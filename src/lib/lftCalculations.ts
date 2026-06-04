// LFT (Ley Federal del Trabajo) calculation engine for resignation finiquito.
// Pure functions. No React, no DB. All amounts rounded to 2 decimals after
// each multiplication step to match Mexican payroll conventions.
//
// Uses 365 days uniformly (no leap-year adjustment). This matches the
// reference template and is standard practice in MX payroll software.

import { parseLocalDate } from "@/lib/localDate";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Days between two ISO date strings, inclusive of start, exclusive of end. */
export function daysBetween(startISO: string, endISO: string): number {
  const s = parseLocalDate(startISO);
  const e = parseLocalDate(endISO);
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86_400_000));
}

/**
 * Aguinaldo proporcional (LFT Art. 87).
 * 15 × salario_diario × (days worked in resignation year / 365).
 * "Days worked" = Jan 1 (or hire date if later) to resignation date.
 */
export function calcAguinaldoProporcional(args: {
  salarioDiario: number;
  hireDate: string;
  resignationDate: string;
}): number {
  const resignYear = parseLocalDate(args.resignationDate).getFullYear();
  const jan1 = `${resignYear}-01-01`;
  const yearStart =
    args.hireDate > jan1 ? args.hireDate : jan1;
  // +1: resignation date is a worked day (inclusive both ends, matches MX payroll convention)
  const days = daysBetween(yearStart, args.resignationDate) + 1;
  return round2(15 * args.salarioDiario * (days / 365));
}

/**
 * LFT Art. 76 post-2023 reform: entitled vacation days by completed tenure year.
 * Year 1→12, 2→14, 3→16, 4→18, 5→20, 6-10→22, 11-15→24, 16-20→26,
 * 21-25→28, 26-30→30, then +2 every additional 5 years.
 */
export function entitledVacationDays(yearsOfTenure: number): number {
  if (yearsOfTenure <= 0) return 12;
  if (yearsOfTenure <= 5) return 10 + yearsOfTenure * 2; // 12,14,16,18,20
  // After year 5: +2 every 5 years → 22 (6-10), 24 (11-15), 26 (16-20), ...
  const extraBrackets = Math.ceil((yearsOfTenure - 5) / 5);
  return 20 + extraBrackets * 2;
}

/**
 * Vacaciones correspondientes.
 * entitled_days × (days since last anniversary / 365) × salario_diario.
 */
export function calcVacaciones(args: {
  salarioDiario: number;
  hireDate: string;
  resignationDate: string;
}): { days: number; amount: number } {
  const hire = parseLocalDate(args.hireDate);
  const resign = parseLocalDate(args.resignationDate);

  // Completed full years of tenure
  let fullYears = resign.getFullYear() - hire.getFullYear();
  const hireAnniversaryThisYear = new Date(
    resign.getFullYear(),
    hire.getMonth(),
    hire.getDate(),
  );
  if (resign < hireAnniversaryThisYear) {
    fullYears--;
  }
  if (fullYears < 0) fullYears = 0;

  // Current tenure year (1-based): fullYears + 1
  const currentTenureYear = fullYears + 1;
  const entitled = entitledVacationDays(currentTenureYear);

  // Days since last anniversary (or since hire if in first year)
  let lastAnniversary: string;
  if (fullYears === 0) {
    lastAnniversary = args.hireDate;
  } else {
    const la = new Date(
      resign.getFullYear(),
      hire.getMonth(),
      hire.getDate(),
    );
    if (la > resign) {
      la.setFullYear(la.getFullYear() - 1);
    }
    const yy = la.getFullYear();
    const mm = String(la.getMonth() + 1).padStart(2, "0");
    const dd = String(la.getDate()).padStart(2, "0");
    lastAnniversary = `${yy}-${mm}-${dd}`;
  }

  // +1: resignation date is a worked day (inclusive both ends)
  const daysSinceAnniversary = daysBetween(lastAnniversary, args.resignationDate) + 1;
  // Compute amount in one step to avoid premature rounding of fractional days
  const amount = round2(entitled * (daysSinceAnniversary / 365) * args.salarioDiario);
  const vacDays = round2(entitled * (daysSinceAnniversary / 365));

  return { days: vacDays, amount };
}

/** Prima vacacional (LFT Art. 80): 25% of vacation amount. */
export function calcPrimaVacacional(vacacionesMonto: number): number {
  return round2(vacacionesMonto * 0.25);
}

/**
 * Sum aguinaldo + vacaciones + prima (+ salarios devengados, if any),
 * rounded to 2 decimals. salariosDevengados is a manual amount HR enters for
 * days already worked but not yet paid in the final period.
 */
export function calcFiniquitoTotal(args: {
  aguinaldo: number;
  vacaciones: number;
  prima: number;
  salariosDevengados?: number;
}): number {
  return round2(
    args.aguinaldo + args.vacaciones + args.prima + (args.salariosDevengados ?? 0),
  );
}

// ── Number to Spanish words (MX peso format) ────────────────────────

const UNITS = [
  "", "UN", "DOS", "TRES", "CUATRO", "CINCO",
  "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ",
  "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE",
  "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE",
  "VEINTIÚN", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO",
  "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE",
];

const TENS = [
  "", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA",
  "SESENTA", "SETENTA", "OCHENTA", "NOVENTA",
];

const HUNDREDS = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
];

function wordsUnder1000(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  if (n < 30) return UNITS[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    return u === 0 ? TENS[t] : `${TENS[t]} Y ${UNITS[u]}`;
  }
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (rest === 0) return n === 100 ? "CIEN" : HUNDREDS[h];
  return `${HUNDREDS[h]} ${wordsUnder1000(rest)}`;
}

function integerToWords(n: number): string {
  if (n === 0) return "CERO";
  if (n < 0) return `MENOS ${integerToWords(-n)}`;

  const parts: string[] = [];

  const millions = Math.floor(n / 1_000_000);
  if (millions > 0) {
    parts.push(
      millions === 1
        ? "UN MILLÓN"
        : `${wordsUnder1000(millions)} MILLONES`,
    );
  }

  const thousands = Math.floor((n % 1_000_000) / 1000);
  if (thousands > 0) {
    parts.push(
      thousands === 1 ? "MIL" : `${wordsUnder1000(thousands)} MIL`,
    );
  }

  const remainder = n % 1000;
  if (remainder > 0) {
    parts.push(wordsUnder1000(remainder));
  }

  return parts.join(" ");
}

/**
 * Convert a decimal amount to MX peso format in Spanish words.
 * e.g. 8876.72 → "OCHO MIL OCHOCIENTOS SETENTA Y SEIS PESOS CON SETENTA Y DOS CENTAVOS 72/100 M.N."
 */
export function numberToSpanishWords(amount: number): string {
  const rounded = round2(Math.abs(amount));
  const intPart = Math.floor(rounded);
  const centavos = Math.round((rounded - intPart) * 100);
  const centStr = String(centavos).padStart(2, "0");

  const pesoWord = intPart === 1 ? "PESO" : "PESOS";
  const intWords = integerToWords(intPart);

  if (centavos === 0) {
    return `${intWords} ${pesoWord} ${centStr}/100 M.N.`;
  }

  const centWords = integerToWords(centavos);
  const centLabel = centavos === 1 ? "CENTAVO" : "CENTAVOS";
  return `${intWords} ${pesoWord} CON ${centWords} ${centLabel} ${centStr}/100 M.N.`;
}
