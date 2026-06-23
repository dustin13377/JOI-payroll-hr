// AUTO-GENERATED from JOI_Employee_Break_Schedules.pdf (issued 2026-06-17).
// Source of truth for the read-only schedule banner on the Timeclock page.
// Keyed by employees.employee_id. To change a schedule, edit here and redeploy.
// Future: lift this same shape into an employee_break_schedules table for in-app editing.

export interface AltShift {
  label: string;
  days: string;
  clockIn: string;
  clockOut: string;
  break1: string;
  lunch: string;
  break2: string;
}

export interface BreakSchedule {
  campaign: string;
  unit: string;
  days: string;
  clockIn: string;
  clockOut: string;
  break1: string;
  /**
   * Fixed lunch window for current agents. Set to `null` for a NEW hire to have
   * their lunch auto-balanced into the emptiest window for their team (see
   * useLunchSlot / lunchBalancer). Existing agents keep their printed time.
   */
  lunch: string | null;
  lunchGroup: "A" | "B" | "C" | null;
  break2: string;
  /** Present only for employees with a different weekend shift (e.g. EMP-024). */
  altShift?: AltShift;
}

export const BREAK_SCHEDULES: Record<string, BreakSchedule> = {
  "EMP-003": { campaign: "Torro", unit: "SLOC Weekday", days: "Mon – Thu", clockIn: "7:00a", clockOut: "6:00p", break1: "9:45a – 10:00a", lunch: "12:00p – 1:00p", lunchGroup: "A", break2: "3:45p – 4:00p" },
  "EMP-004": { campaign: "Torro", unit: "SLOC Weekday", days: "Mon – Thu", clockIn: "7:00a", clockOut: "6:00p", break1: "9:45a – 10:00a", lunch: "12:00p – 1:00p", lunchGroup: "A", break2: "3:45p – 4:00p" },
  "EMP-002": { campaign: "Torro", unit: "SLOC Weekday", days: "Mon – Thu", clockIn: "7:00a", clockOut: "6:00p", break1: "9:45a – 10:00a", lunch: "12:00p – 1:00p", lunchGroup: "A", break2: "3:45p – 4:00p" },
  "EMP-046": { campaign: "Torro", unit: "SLOC Weekday", days: "Mon – Thu", clockIn: "7:00a", clockOut: "6:00p", break1: "10:00a – 10:15a", lunch: "12:00p – 1:00p", lunchGroup: "A", break2: "4:00p – 4:15p" },
  "EMP-105": { campaign: "Torro", unit: "SLOC Weekday", days: "Mon – Thu", clockIn: "7:00a", clockOut: "6:00p", break1: "10:00a – 10:15a", lunch: "12:00p – 1:00p", lunchGroup: "A", break2: "4:00p – 4:15p" },
  "EMP-001": { campaign: "Torro", unit: "SLOC Weekday", days: "Mon – Thu", clockIn: "7:00a", clockOut: "6:00p", break1: "10:00a – 10:15a", lunch: "1:00p – 2:00p", lunchGroup: "B", break2: "4:00p – 4:15p" },
  "EMP-031": { campaign: "Torro", unit: "SLOC Weekday", days: "Mon – Thu", clockIn: "7:00a", clockOut: "6:00p", break1: "10:15a – 10:30a", lunch: "1:00p – 2:00p", lunchGroup: "B", break2: "4:15p – 4:30p" },
  "EMP-102": { campaign: "Torro", unit: "SLOC Weekday", days: "Mon – Thu", clockIn: "7:00a", clockOut: "6:00p", break1: "10:15a – 10:30a", lunch: "1:00p – 2:00p", lunchGroup: "B", break2: "4:15p – 4:30p" },
  "EMP-0121": { campaign: "Torro", unit: "SLOC Weekday", days: "Mon – Thu", clockIn: "7:00a", clockOut: "6:00p", break1: "10:15a – 10:30a", lunch: "1:00p – 2:00p", lunchGroup: "B", break2: "4:15p – 4:30p" },
  "EMP-032": { campaign: "Torro", unit: "SLOC Weekday", days: "Mon – Thu", clockIn: "7:00a", clockOut: "6:00p", break1: "10:30a – 10:45a", lunch: "1:00p – 2:00p", lunchGroup: "B", break2: "4:30p – 4:45p" },
  "EMP-049": { campaign: "Torro", unit: "SLOC Weekday", days: "Mon – Thu", clockIn: "7:00a", clockOut: "6:00p", break1: "10:30a – 10:45a", lunch: "2:00p – 3:00p", lunchGroup: "C", break2: "4:30p – 4:45p" },
  "EMP-045": { campaign: "Torro", unit: "SLOC Weekday", days: "Mon – Thu", clockIn: "7:00a", clockOut: "6:00p", break1: "10:30a – 10:45a", lunch: "2:00p – 3:00p", lunchGroup: "C", break2: "4:30p – 4:45p" },
  "JOI-0133": { campaign: "Torro", unit: "SLOC Weekday", days: "Mon – Thu", clockIn: "7:00a", clockOut: "6:00p", break1: "10:45a – 11:00a", lunch: "2:00p – 3:00p", lunchGroup: "C", break2: "4:45p – 5:00p" },
  "JOI-0134": { campaign: "Torro", unit: "SLOC Weekday", days: "Mon – Thu", clockIn: "7:00a", clockOut: "6:00p", break1: "10:45a – 11:00a", lunch: "2:00p – 3:00p", lunchGroup: "C", break2: "4:45p – 5:00p" },
  "JOI-0135": { campaign: "Torro", unit: "SLOC Weekday", days: "Mon – Thu", clockIn: "7:00a", clockOut: "6:00p", break1: "10:45a – 11:00a", lunch: "2:00p – 3:00p", lunchGroup: "C", break2: "4:45p – 5:00p" },
  "EMP-011": { campaign: "Torro", unit: "SLOC Weekend", days: "Fri – Sun", clockIn: "7:00a", clockOut: "7:00p", break1: "10:00a – 10:15a", lunch: "12:00p – 1:00p", lunchGroup: "A", break2: "5:00p – 5:15p" },
  "EMP-014": { campaign: "Torro", unit: "SLOC Weekend", days: "Fri – Sun", clockIn: "7:00a", clockOut: "7:00p", break1: "10:00a – 10:15a", lunch: "12:00p – 1:00p", lunchGroup: "A", break2: "5:00p – 5:15p" },
  "EMP-012": { campaign: "Torro", unit: "SLOC Weekend", days: "Fri – Sun", clockIn: "7:00a", clockOut: "7:00p", break1: "10:00a – 10:15a", lunch: "12:00p – 1:00p", lunchGroup: "A", break2: "5:00p – 5:15p" },
  "EMP-005": { campaign: "Torro", unit: "SLOC Weekend", days: "Fri – Sun", clockIn: "7:00a", clockOut: "7:00p", break1: "10:15a – 10:30a", lunch: "12:00p – 1:00p", lunchGroup: "A", break2: "5:15p – 5:30p" },
  "EMP-108": { campaign: "Torro", unit: "SLOC Weekend", days: "Fri – Sun", clockIn: "7:00a", clockOut: "7:00p", break1: "10:15a – 10:30a", lunch: "1:00p – 2:00p", lunchGroup: "B", break2: "5:15p – 5:30p" },
  "EMP-015": { campaign: "Torro", unit: "SLOC Weekend", days: "Fri – Sun", clockIn: "7:00a", clockOut: "7:00p", break1: "10:15a – 10:30a", lunch: "1:00p – 2:00p", lunchGroup: "B", break2: "5:15p – 5:30p" },
  "EMP-013": { campaign: "Torro", unit: "SLOC Weekend", days: "Fri – Sun", clockIn: "7:00a", clockOut: "7:00p", break1: "10:30a – 10:45a", lunch: "1:00p – 2:00p", lunchGroup: "B", break2: "5:30p – 5:45p" },
  "EMP-120": { campaign: "Torro", unit: "SLOC Weekend", days: "Fri – Sun", clockIn: "7:00a", clockOut: "7:00p", break1: "10:30a – 10:45a", lunch: "1:00p – 2:00p", lunchGroup: "B", break2: "5:30p – 5:45p" },
  "EMP-0127": { campaign: "Torro", unit: "SLOC Weekend", days: "Fri – Sun", clockIn: "7:00a", clockOut: "7:00p", break1: "10:30a – 10:45a", lunch: "2:00p – 3:00p", lunchGroup: "C", break2: "5:30p – 5:45p" },
  "EMP-117": { campaign: "Torro", unit: "SLOC Weekend", days: "Fri – Sun", clockIn: "7:00a", clockOut: "7:00p", break1: "10:45a – 11:00a", lunch: "2:00p – 3:00p", lunchGroup: "C", break2: "5:45p – 6:00p" },
  "EMP-016": { campaign: "Torro", unit: "MCA", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "10:45a – 11:00a", lunch: "12:00p – 1:00p", lunchGroup: "A", break2: "3:30p – 3:45p" },
  "EMP-101": { campaign: "Torro", unit: "MCA", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "10:45a – 11:00a", lunch: "12:00p – 1:00p", lunchGroup: "A", break2: "3:30p – 3:45p" },
  "EMP-019": { campaign: "Torro", unit: "MCA", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "10:45a – 11:00a", lunch: "1:00p – 2:00p", lunchGroup: "B", break2: "3:30p – 3:45p" },
  "EMP-020": { campaign: "Torro", unit: "MCA", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "11:00a – 11:15a", lunch: "1:00p – 2:00p", lunchGroup: "B", break2: "3:45p – 4:00p" },
  "EMP-022": { campaign: "Torro", unit: "Underwriting", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "11:00a – 11:15a", lunch: "12:00p – 1:00p", lunchGroup: null, break2: "3:45p – 4:00p" },
  "EMP-025": { campaign: "Torro", unit: "Data Entry", days: "Mon – Fri", clockIn: "9:00a", clockOut: "5:00p", break1: "11:00a – 11:15a", lunch: "12:00p – 1:00p", lunchGroup: null, break2: "3:45p – 4:00p" },
  "EMP-009": { campaign: "Torro", unit: "Decline", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "11:00a – 11:15a", lunch: "12:00p – 1:00p", lunchGroup: null, break2: "3:45p – 4:00p" },
  "EMP-008": { campaign: "HFB Tech", unit: "Setter", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "10:45a – 11:00a", lunch: "12:00p – 1:00p", lunchGroup: "A", break2: "3:30p – 3:45p" },
  "EMP-027": { campaign: "HFB Tech", unit: "Setter", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "10:45a – 11:00a", lunch: "12:00p – 1:00p", lunchGroup: "A", break2: "3:30p – 3:45p" },
  "EMP-010": { campaign: "HFB Tech", unit: "Setter", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "10:45a – 11:00a", lunch: "1:00p – 2:00p", lunchGroup: "B", break2: "3:30p – 3:45p" },
  "JOI-0132": { campaign: "HFB Tech", unit: "Setter", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "11:00a – 11:15a", lunch: "1:00p – 2:00p", lunchGroup: "B", break2: "3:45p – 4:00p" },
  "EMP-036": { campaign: "HFB Tech", unit: "Designer", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "11:00a – 11:15a", lunch: "12:00p – 1:00p", lunchGroup: "A", break2: "3:45p – 4:00p" },
  "EMP-047": { campaign: "HFB Tech", unit: "Designer", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "11:00a – 11:15a", lunch: "1:00p – 2:00p", lunchGroup: "B", break2: "3:45p – 4:00p" },
  "EMP-041": { campaign: "HFB Tech", unit: "Collections", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "11:00a – 11:15a", lunch: "12:00p – 1:00p", lunchGroup: null, break2: "3:45p – 4:00p" },
  "EMP-053": { campaign: "HFB Tech", unit: "SEO Specialist", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "11:00a – 11:15a", lunch: "12:00p – 1:00p", lunchGroup: null, break2: "3:45p – 4:00p" },
  "EMP-112": { campaign: "Scoop", unit: "Sales CS", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "11:00a – 11:15a", lunch: "12:00p – 1:00p", lunchGroup: "A", break2: "3:45p – 4:00p" },
  "EMP-044": { campaign: "Scoop", unit: "Sales CS", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "11:00a – 11:15a", lunch: "1:00p – 2:00p", lunchGroup: "B", break2: "3:45p – 4:00p" },
  "EMP-035": { campaign: "Scoop", unit: "Tech Support", days: "Mon – Thu", clockIn: "7:00a", clockOut: "5:00p", break1: "10:00a – 10:15a", lunch: "12:00p – 1:00p", lunchGroup: null, break2: "3:45p – 4:00p" },
  "EMP-034": { campaign: "Scoop", unit: "Tech Support WE", days: "Fri – Sun", clockIn: "7:00a", clockOut: "7:00p", break1: "10:00a – 10:15a", lunch: "12:00p – 1:00p", lunchGroup: null, break2: "5:45p – 6:00p" },
  "EMP-006": { campaign: "One Star Capital", unit: "Funding Manager", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "11:00a – 11:15a", lunch: "12:00p – 1:00p", lunchGroup: null, break2: "3:45p – 4:00p" },
  "EMP-024": { campaign: "Torro", unit: "Underwriting Weekend", days: "Fri / Mon / Tue", clockIn: "8:00a", clockOut: "5:00p", break1: "11:00a – 11:15a", lunch: "12:00p – 1:00p", lunchGroup: null, break2: "3:45p – 4:00p", altShift: { label: "Sat / Sun", days: "Sat / Sun", clockIn: "10:00a", clockOut: "5:00p", break1: "1:00p – 1:15p", lunch: "2:00p – 3:00p", break2: "3:45p – 4:00p" } },
  // Test account (sandoval-agent@gmail.com) — placeholder schedule for previewing the banner.
  "sandovalagent": { campaign: "Torro", unit: "Test", days: "Mon – Fri", clockIn: "8:00a", clockOut: "5:00p", break1: "10:30a – 10:45a", lunch: "1:00p – 2:00p", lunchGroup: "B", break2: "3:45p – 4:00p" },
};

/** Returns the schedule for an employee_id, or null if none is on file. */
export function getBreakSchedule(
  employeeId: string | null | undefined,
): BreakSchedule | null {
  if (!employeeId) return null;
  return BREAK_SCHEDULES[employeeId] ?? null;
}
