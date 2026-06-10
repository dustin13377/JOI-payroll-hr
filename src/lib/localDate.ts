/**
 * Local-date helpers for the timeclock / EOD flows.
 *
 * `new Date().toISOString().split("T")[0]` returns a UTC date string.
 * For an agent in Mexico (UTC-6) clocking in at 6 PM on the 13th, UTC is
 * already the 14th — so the row got stamped with the wrong calendar day.
 *
 * All `time_clock.date` and `eod_logs.date` writes must use `todayLocal()`.
 * All displays of those dates should go through `parseLocalDate()` so the
 * string doesn't get re-parsed as UTC midnight and render as the prior day.
 */

export function todayLocal(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string as local midnight (not UTC midnight). */
export function parseLocalDate(dateStr: string): Date {
  // Appending the time component forces local parsing in all JS engines.
  return new Date(`${dateStr}T00:00:00`);
}

/**
 * App-wide standard date format: MM/DD/YYYY (US style), per D's decision
 * 2026-06-10. All numeric on-screen dates go through here.
 *
 * NOTE: the "MX" names are legacy — they used to emit DD/MM/YY(YY). They now
 * delegate to `formatDateUSShort` so every existing call site flips to US
 * format without touching 25 files. New code should call `formatDateUSShort`
 * directly. (Spanish legal documents are unaffected — those use
 * `formatDateSpanishFull` / `formatDateSpanishMedium` below.)
 */
export function formatDateMX(d: string | Date | null | undefined): string {
  return formatDateUSShort(d);
}

/** @deprecated legacy name — same MM/DD/YYYY output as formatDateUSShort. */
export function formatDateMXLong(d: string | Date | null | undefined): string {
  return formatDateUSShort(d);
}

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * American long-form date for client-facing US documents: "May 18, 2026".
 * Use this on invoices billed to US clients.
 */
export function formatDateUSLong(d: string | Date | null | undefined): string {
  if (d == null) return "";
  const date = typeof d === "string" ? parseLocalDate(d.slice(0, 10)) : d;
  if (isNaN(date.getTime())) return "";
  return `${MONTHS_EN[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * American numeric date format: MM/DD/YYYY. Use if `formatDateUSLong` is too
 * wordy for the layout.
 */
export function formatDateUSShort(d: string | Date | null | undefined): string {
  if (d == null) return "";
  const date = typeof d === "string" ? parseLocalDate(d.slice(0, 10)) : d;
  if (isNaN(date.getTime())) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Returns Mon-Sun week range as ISO date strings, for any date inside the week.
 * Used by the weekly invoice batch generator.
 */
export function getWeekRange(d: Date | string = new Date()): { monday: string; sunday: string } {
  const date = typeof d === "string" ? parseLocalDate(d.slice(0, 10)) : new Date(d);
  // JS Sunday=0, Monday=1, ..., Saturday=6. Shift so Monday=0.
  const dayShift = (date.getDay() + 6) % 7;
  const mon = new Date(date);
  mon.setDate(date.getDate() - dayShift);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { monday: todayLocal(mon), sunday: todayLocal(sun) };
}

/**
 * Returns the last *completed* Mon-Sun week relative to `today`. Used to default
 * the weekly invoice batch generator to "the week that just ended."
 */
export function lastCompletedWeek(today: Date = new Date()): { monday: string; sunday: string } {
  const thisWeek = getWeekRange(today);
  const thisMonday = parseLocalDate(thisWeek.monday);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  return getWeekRange(lastMonday);
}

const WEEKDAYS_ES = [
  "domingo", "lunes", "martes", "miércoles",
  "jueves", "viernes", "sábado",
];
const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Spanish long-form date with weekday: "sabado 18 de abril 2026"
 * Used in acta opening paragraph for {incident_day_short}.
 */
export function formatDateSpanishFull(d: string | Date | null | undefined): string {
  if (d == null) return "";
  const date = typeof d === "string" ? parseLocalDate(d.slice(0, 10)) : d;
  if (isNaN(date.getTime())) return "";
  const wd = WEEKDAYS_ES[date.getDay()];
  const day = date.getDate();
  const month = MONTHS_ES[date.getMonth()];
  const year = date.getFullYear();
  return `${wd}, ${day} de ${month} de ${year}`;
}

/**
 * Spanish medium-long date without weekday: "21 de abril de 2026"
 * Used in acta closing for {incident_date_short}.
 */
export function formatDateSpanishMedium(d: string | Date | null | undefined): string {
  if (d == null) return "";
  const date = typeof d === "string" ? parseLocalDate(d.slice(0, 10)) : d;
  if (isNaN(date.getTime())) return "";
  const day = date.getDate();
  const month = MONTHS_ES[date.getMonth()];
  const year = date.getFullYear();
  return `${day} de ${month} de ${year}`;
}
