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
  days: { date: string; dow: number; status: PayrollDayStatus }[];
}

export type PayrollDayStatus =
  | "off"
  | "worked"
  | "missed"
  | "vacation"
  | "holiday"
  | "holiday_worked"
  | "extra";

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
        .eq("is_system_user", false);  // partners/auditors are not on payroll

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

      // 2. Fetch time_clock entries
      const { data: clockRows, error: clockErr } = await supabase
        .from("time_clock")
        .select("employee_id, date")
        .gte("date", pStart)
        .lte("date", pEnd);
      if (clockErr) throw clockErr;

      // Build map: employeeUUID -> Set<dateString>
      const clockMap = new Map<string, Set<string>>();
      for (const row of clockRows ?? []) {
        const eid = (row as any).employee_id as string;
        const d = (row as any).date as string;
        if (!clockMap.has(eid)) clockMap.set(eid, new Set());
        clockMap.get(eid)!.add(d);
      }

      // 3. Fetch shift_settings
      const safeIds = campaignIds.length > 0 ? campaignIds : ["__none__"];
      const { data: shiftRows, error: shiftErr } = await supabase
        .from("shift_settings")
        .select("campaign_id, days_of_week")
        .in("campaign_id", safeIds);
      if (shiftErr) throw shiftErr;

      const shiftMap = new Map<string, number[]>();
      for (const row of shiftRows ?? []) {
        const cid = (row as any).campaign_id as string;
        const dow = (row as any).days_of_week as number[];
        shiftMap.set(cid, dow);
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

        // daysAbsent
        let daysAbsent = 0;
        for (const d of scheduledDays) {
          if (!clocked.has(d) && !timeOff.has(d)) daysAbsent++;
        }

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
            status = clocked.has(d) ? "worked" : timeOff.has(d) ? "vacation" : "missed";
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
          days,
        };
      });

      return results;
    },
  });
}
