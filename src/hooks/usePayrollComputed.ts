import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ComputedPayroll {
  employeeId: string;
  employeeDisplayId: string;
  fullName: string;
  campaignName: string | null;
  monthlyBaseSalary: number;
  dailyDiscountRate: number;
  kpiBonusAmount: number;
  daysAbsent: number;
  sundayPremiumEarned: boolean;
  holidayDaysWorked: number;
  extraDaysWorked: number;
  sundaysWorked: number;
  timeOffDays: number;
  /** Count of scheduled days punched but worked < 6h (prorated, not full pay). */
  partialDayCount: number;
  /** Peso amount docked across those short days (unworked fraction × daily). */
  partialDayDeduction: number;
  days: { date: string; dow: number; status: PayrollDayStatus }[];
}

export type PayrollDayStatus =
  | "off"
  | "worked"
  | "missed"
  | "partial"
  | "vacation"
  | "holiday"
  | "holiday_worked"
  | "extra";

/** A scheduled day with this many net hours or more pays as a full day. */
const FULL_DAY_MIN_HOURS = 6;
/** Fallback scheduled shift length when a campaign has no shift_settings row. */
const DEFAULT_SHIFT_HOURS = 8;

/** Net worked hours for one time_clock row (span minus lunch + breaks).
 *  Returns null when the punch is incomplete (no clock_out) — we don't dock
 *  pay on a half-recorded punch. */
function rowNetHours(row: {
  clock_in: string | null;
  clock_out: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
  break1_start: string | null;
  break1_end: string | null;
  break2_start: string | null;
  break2_end: string | null;
}): number | null {
  if (!row.clock_in || !row.clock_out) return null;
  const ms = (a: string | null, b: string | null) =>
    a && b ? new Date(b).getTime() - new Date(a).getTime() : 0;
  const gross = ms(row.clock_in, row.clock_out);
  const breaks =
    ms(row.lunch_start, row.lunch_end) +
    ms(row.break1_start, row.break1_end) +
    ms(row.break2_start, row.break2_end);
  return Math.max(0, (gross - breaks) / 3_600_000);
}

/** Format a Date as "YYYY-MM-DD" without UTC shift. */
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a "YYYY-MM-DD" string into a local-midnight Date. */
function parseDate(s: string): Date {
  return new Date(s + "T00:00:00");
}

/** Enumerate every date string in [start, end] inclusive. */
function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = parseDate(start);
  const last = parseDate(end);
  while (cur <= last) {
    out.push(fmtDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function usePayrollComputed(
  periodId: string | undefined,
  periodStart: string | undefined,
  periodEnd: string | undefined,
  employeeId?: string
): UseQueryResult<ComputedPayroll[]> {
  return useQuery({
    queryKey: ["payroll-computed", periodId, employeeId],
    enabled: !!periodId && !!periodStart && !!periodEnd,
    queryFn: async (): Promise<ComputedPayroll[]> => {
      const pStart = periodStart!;
      const pEnd = periodEnd!;

      // 1. Fetch employees
      let empQuery = supabase
        .from("employees")
        .select(
          "id, employee_id, full_name, campaign_id, monthly_base_salary, daily_discount_rate, kpi_bonus_amount, hire_date, terminated_at, campaigns!employees_campaign_id_fkey(name)"
        )
        .eq("is_active", true)
        .eq("is_system_user", false)   // partners/auditors are not on payroll
        .gt("monthly_base_salary", 0); // no salary set = not on a pay run
                                       // (drops the owner + zero-salary test accounts)

      if (employeeId) {
        empQuery = empQuery.eq("id", employeeId);
      }

      const { data: employees, error: empErr } = await empQuery;
      if (empErr) throw empErr;
      if (!employees || employees.length === 0) return [];

      // Collect unique campaign IDs
      const campaignIds = [
        ...new Set(
          employees
            .map((e: any) => e.campaign_id as string | null)
            .filter((id): id is string => !!id)
        ),
      ];

      // 2. Fetch time_clock entries (with punch times so we can measure hours)
      const { data: clockRows, error: clockErr } = await supabase
        .from("time_clock")
        .select(
          "employee_id, date, clock_in, clock_out, lunch_start, lunch_end, break1_start, break1_end, break2_start, break2_end"
        )
        .gte("date", pStart)
        .lte("date", pEnd);
      if (clockErr) throw clockErr;

      // Build maps:
      //   clockMap  — employeeUUID -> Set<dateString> (did they punch at all)
      //   hoursMap  — employeeUUID -> Map<dateString, number|null> net hours worked
      //               (null = at least one incomplete punch that day → treat as full)
      const clockMap = new Map<string, Set<string>>();
      const hoursMap = new Map<string, Map<string, number | null>>();
      for (const row of clockRows ?? []) {
        const eid = (row as any).employee_id as string;
        const d = (row as any).date as string;
        if (!clockMap.has(eid)) clockMap.set(eid, new Set());
        clockMap.get(eid)!.add(d);

        if (!hoursMap.has(eid)) hoursMap.set(eid, new Map());
        const dayMap = hoursMap.get(eid)!;
        const net = rowNetHours(row as any);
        const prev = dayMap.get(d);
        if (prev === undefined) {
          dayMap.set(d, net);
        } else if (prev === null || net === null) {
          dayMap.set(d, null); // any incomplete punch poisons the day → full credit
        } else {
          dayMap.set(d, prev + net);
        }
      }

      // 3. Fetch shift_settings
      const safeIds = campaignIds.length > 0 ? campaignIds : ["__none__"];
      const { data: shiftRows, error: shiftErr } = await supabase
        .from("shift_settings")
        .select("campaign_id, days_of_week, start_time, end_time")
        .in("campaign_id", safeIds);
      if (shiftErr) throw shiftErr;

      const shiftMap = new Map<string, number[]>();
      const shiftHoursMap = new Map<string, number>(); // campaign_id -> scheduled day length (h)
      for (const row of shiftRows ?? []) {
        const cid = (row as any).campaign_id as string;
        const dow = (row as any).days_of_week as number[];
        shiftMap.set(cid, dow);
        // start_time / end_time are "HH:MM:SS"; difference = scheduled shift length.
        const start = (row as any).start_time as string | null;
        const end = (row as any).end_time as string | null;
        if (start && end) {
          const toH = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            return h + (m || 0) / 60;
          };
          const len = toH(end) - toH(start);
          if (len > 0) shiftHoursMap.set(cid, len);
        }
      }

      // 4. Fetch mexican_holidays
      const { data: holidayRows, error: holErr } = await supabase
        .from("mexican_holidays")
        .select("date")
        .gte("date", pStart)
        .lte("date", pEnd);
      if (holErr) throw holErr;

      const holidaySet = new Set<string>(
        (holidayRows ?? []).map((r: any) => r.date as string)
      );

      // 5. Fetch approved time-off (any type) overlapping the period.
      // Reads from vacation_requests — the unified time-off table that holds
      // all approved leave (paid Vacation + unpaid Sick/Personal/Other). PTO
      // day math doesn't care if it's paid; absence is absence.
      // See TIME_OFF_UNIFICATION_PLAN.md.
      const { data: timeOffRows, error: toErr } = await supabase
        .from("vacation_requests")
        .select("employee_id, start_date, end_date")
        .eq("status", "approved")
        .lte("start_date", pEnd)
        .gte("end_date", pStart);
      if (toErr) throw toErr;

      // Build map: employeeUUID -> Set<dateString>
      const timeOffMap = new Map<string, Set<string>>();
      for (const row of timeOffRows ?? []) {
        const eid = (row as any).employee_id as string;
        const s = (row as any).start_date as string;
        const e = (row as any).end_date as string;
        // Clamp to period
        const rangeStart = s < pStart ? pStart : s;
        const rangeEnd = e > pEnd ? pEnd : e;
        const dates = dateRange(rangeStart, rangeEnd);
        if (!timeOffMap.has(eid)) timeOffMap.set(eid, new Set());
        const set = timeOffMap.get(eid)!;
        for (const d of dates) set.add(d);
      }

      // All dates in the period
      const allDates = dateRange(pStart, pEnd);

      // 6. Compute per employee
      const results: ComputedPayroll[] = employees.map((emp: any) => {
        const uuid: string = emp.id;
        const campaignId: string | null = emp.campaign_id ?? null;
        const daysOfWeek = (campaignId && shiftMap.get(campaignId)) || [1, 2, 3, 4, 5];

        // Clamp window: an employee can't be absent before they were hired or
        // after they were terminated. terminated_at is a timestamptz — convert
        // to YYYY-MM-DD using local components so the boundary matches the
        // date strings we compare against.
        const hireDate: string | null = (emp.hire_date as string | null) ?? null;
        const termTs: string | null = (emp.terminated_at as string | null) ?? null;
        const termDate: string | null = termTs ? fmtDate(new Date(termTs)) : null;

        // Scheduled days: dates whose day-of-week is in daysOfWeek, minus:
        //   - days before hire_date
        //   - days after termination_at
        //   - Mexican holidays (holidaySet)
        // Without these exclusions, every Mon-Fri before an agent was hired
        // counts as an absence and inflates payroll deductions. Same for
        // holidays — the company doesn't expect anyone to clock in.
        const scheduledDays = new Set(
          allDates.filter((d) => {
            if (!daysOfWeek.includes(parseDate(d).getDay())) return false;
            if (hireDate && d < hireDate) return false;
            if (termDate && d > termDate) return false;
            if (holidaySet.has(d)) return false;
            return true;
          })
        );

        const clocked = clockMap.get(uuid) ?? new Set<string>();
        const timeOff = timeOffMap.get(uuid) ?? new Set<string>();
        const dayHours = hoursMap.get(uuid) ?? new Map<string, number | null>();
        const scheduledShiftHours =
          (campaignId && shiftHoursMap.get(campaignId)) || DEFAULT_SHIFT_HOURS;
        const dailyRate = (Number(emp.monthly_base_salary) || 0) / 30;

        // daysAbsent
        let daysAbsent = 0;
        for (const d of scheduledDays) {
          if (!clocked.has(d) && !timeOff.has(d)) daysAbsent++;
        }

        // Partial days: scheduled days punched but worked < 6h net. The base
        // already paid the full day, so dock the unworked fraction (0..1) ×
        // daily. Incomplete punches (null hours) stay full; missed days (no
        // punch) are counted above, not here.
        const partialDates = new Set<string>();
        let partialDayDeduction = 0;
        for (const d of scheduledDays) {
          if (!clocked.has(d)) continue;
          const h = dayHours.get(d);
          if (h == null || h <= 0 || h >= FULL_DAY_MIN_HOURS) continue;
          const unworked = Math.min(1, Math.max(0, 1 - h / scheduledShiftHours));
          partialDayDeduction += unworked * dailyRate;
          partialDates.add(d);
        }
        partialDayDeduction =
          Math.round((partialDayDeduction + Number.EPSILON) * 100) / 100;

        // sundayPremiumEarned
        let sundayPremiumEarned = false;
        for (const d of clocked) {
          if (parseDate(d).getDay() === 0) {
            sundayPremiumEarned = true;
            break;
          }
        }

        // holidayDaysWorked
        let holidayDaysWorked = 0;
        for (const d of clocked) {
          if (holidaySet.has(d)) holidayDaysWorked++;
        }

        // extraDaysWorked: clocked, not scheduled, not holiday
        let extraDaysWorked = 0;
        for (const d of clocked) {
          if (!scheduledDays.has(d) && !holidaySet.has(d)) extraDaysWorked++;
        }

        // Sundays actually worked (count, for prima dominical)
        let sundaysWorked = 0;
        for (const d of clocked) {
          if (parseDate(d).getDay() === 0) sundaysWorked++;
        }

        // Per-day statuses for the calendar bar
        const days = allDates.map((d) => {
          const dow = parseDate(d).getDay();
          let status: PayrollDayStatus;
          if (holidaySet.has(d)) {
            status = clocked.has(d) ? "holiday_worked" : "holiday";
          } else if (scheduledDays.has(d)) {
            status = clocked.has(d)
              ? partialDates.has(d)
                ? "partial"
                : "worked"
              : timeOff.has(d)
              ? "vacation"
              : "missed";
          } else {
            status = clocked.has(d) ? "extra" : timeOff.has(d) ? "vacation" : "off";
          }
          return { date: d, dow, status };
        });

        const campaignObj = emp.campaigns as { name: string } | null;

        return {
          employeeId: uuid,
          employeeDisplayId: emp.employee_id as string,
          fullName: emp.full_name as string,
          campaignName: campaignObj?.name ?? null,
          monthlyBaseSalary: Number(emp.monthly_base_salary) || 0,
          dailyDiscountRate: Number(emp.daily_discount_rate) || 0,
          kpiBonusAmount: Number(emp.kpi_bonus_amount) || 0,
          daysAbsent,
          sundayPremiumEarned,
          holidayDaysWorked,
          extraDaysWorked,
          sundaysWorked,
          timeOffDays: timeOff.size,
          partialDayCount: partialDates.size,
          partialDayDeduction,
          days,
        };
      });

      return results;
    },
  });
}
