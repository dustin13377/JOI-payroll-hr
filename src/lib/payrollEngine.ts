/**
 * payrollEngine.ts — canonical pre-payroll calculation.
 *
 * This is the validated engine behind the pre-payroll screen (confirmed with
 * Joe, 2026-06-19). It is a PURE function of its inputs — no DB, no I/O — so it
 * is fully unit-testable and is the single source of truth the screen renders
 * from. Input derivation (time clock → counts, makeup vs overtime, spiff pull)
 * lives upstream in hooks; this file only does the math.
 *
 * Rules (quincenal, gross / pre-tax — accountant handles IMSS/ISR):
 *   base            = monthly / 2        (half-month; everyone is quincenal)
 *   daily           = monthly / 30       (LFT salario diario)
 *   missed day      = − daily            (scheduled day absent)
 *   makeup day      = + daily            (off-day worked that covers a miss; no $1,000)
 *   overtime day    = + $1,000           (off-day worked beyond covering misses)
 *   sunday worked   = + 25% × daily      (prima dominical, LFT Art. 71)
 *   vacation day    = + 25% × daily       (prima vacacional premium; base already pays the day)
 *   holiday worked  = + 2 × daily        (LFT Art. 75 premium)
 *   spiff           = USD × exchangeRate (spiffs entered in USD, taken at 17 MXN)
 *   kpi bonus       = + amount when achieved
 *   custom deduction= − amount           (manager-entered)
 */

export const OVERTIME_DAY_PAY = 1000;
export const DEFAULT_EXCHANGE_RATE = 17; // MXN per 1 USD
export const SUNDAY_PREMIUM_PCT = 0.25; // prima dominical
export const VACATION_PREMIUM_PCT = 0.25; // prima vacacional
export const HOLIDAY_PREMIUM_MULT = 2; // worked-holiday premium

export interface EngineInputs {
  monthlyBase: number;
  missedDays?: number;
  makeupDays?: number;
  overtimeDays?: number;
  sundaysWorked?: number;
  vacationDays?: number;
  holidayDaysWorked?: number;
  spiffUsd?: number;
  exchangeRate?: number;
  kpiBonus?: number;
  customDeduction?: number;
}

export interface EngineResult {
  base: number;
  daily: number;
  missedDeduction: number;
  makeupCredit: number;
  overtimePay: number;
  sundayPay: number;
  vacationPremium: number;
  holidayPay: number;
  spiffMxn: number;
  kpiBonus: number;
  customDeduction: number;
  net: number;
}

/** Round to 2 decimals (matches Postgres round(x::numeric, 2)). */
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Classify worked off-days into makeup vs overtime.
 * Misses are covered first (each worked off-day credits back one missed day);
 * any remaining worked off-days are genuine overtime. This is computed across
 * the whole makeup window (can span pay periods) before splitting per period.
 */
export function classifyOffDays(
  missedDays: number,
  offDaysWorked: number
): { makeupDays: number; overtimeDays: number } {
  const makeupDays = Math.max(0, Math.min(missedDays, offDaysWorked));
  const overtimeDays = Math.max(0, offDaysWorked - makeupDays);
  return { makeupDays, overtimeDays };
}

/** Compute one employee's net pay for a pay period. */
export function computeNetPay(i: EngineInputs): EngineResult {
  const monthly = i.monthlyBase || 0;
  const daily = monthly / 30;
  const base = r2(monthly / 2);

  const missedDeduction = r2((i.missedDays ?? 0) * daily);
  const makeupCredit = r2((i.makeupDays ?? 0) * daily);
  const overtimePay = r2((i.overtimeDays ?? 0) * OVERTIME_DAY_PAY);
  const sundayPay = r2((i.sundaysWorked ?? 0) * daily * SUNDAY_PREMIUM_PCT);
  const vacationPremium = r2((i.vacationDays ?? 0) * daily * VACATION_PREMIUM_PCT);
  const holidayPay = r2((i.holidayDaysWorked ?? 0) * daily * HOLIDAY_PREMIUM_MULT);
  const spiffMxn = r2((i.spiffUsd ?? 0) * (i.exchangeRate ?? DEFAULT_EXCHANGE_RATE));
  const kpiBonus = r2(i.kpiBonus ?? 0);
  const customDeduction = r2(i.customDeduction ?? 0);

  const net = r2(
    base -
      missedDeduction +
      makeupCredit +
      overtimePay +
      sundayPay +
      vacationPremium +
      holidayPay +
      spiffMxn +
      kpiBonus -
      customDeduction
  );

  return {
    base,
    daily: r2(daily),
    missedDeduction,
    makeupCredit,
    overtimePay,
    sundayPay,
    vacationPremium,
    holidayPay,
    spiffMxn,
    kpiBonus,
    customDeduction,
    net,
  };
}
