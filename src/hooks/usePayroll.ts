/**
 * usePayroll.ts — Phase 4a payroll hooks (fresh, replaces useSupabasePayroll.ts).
 *
 * Do NOT edit useSupabasePayroll.ts — it's Phase-0 code that will be removed in 4c
 * once the new UI is fully wired and tested.
 *
 * Manager scope note: there is no manager_campaigns join table in the DB.
 * Managers currently see all campaigns. The RLS on payroll_records enforces
 * the real boundary server-side. If per-manager campaign filtering is ever
 * needed, add a manager_campaigns table (same shape as team_lead_campaigns)
 * and update useWeekRecords to filter here.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type PeriodStatus = "OPEN" | "LOCKED";
export type WeekStatus = "UNPAID" | "COMPLETE" | "PAID";

export interface PayPeriod {
  id: string;
  period_code: string | null;
  year: number | null;
  month: number | null;
  half: "PP1" | "PP2" | null;
  start_date: string;
  end_date: string;
  status: PeriodStatus;
  locked_at: string | null;
  locked_by: string | null;
  organization_id: string;
  created_at: string;
}

export interface PayrollWeek {
  id: string;
  period_id: string;
  week_number: number;
  week_start: string;
  week_end: string;
  status: WeekStatus;
  status_changed_at: string | null;
  status_changed_by: string | null;
  organization_id: string;
  created_at: string;
}

/** Employee rate fields needed for client-side pay preview in expanded row.
 *  Phase 4b simplification: only monthly_base_salary + kpi_bonus_amount drive
 *  the calc. Other fields kept here for compatibility with existing JOINs but
 *  the calc engine ignores them. */
export interface EmployeeRates {
  id: string;
  full_name: string;
  work_name: string | null;
  employee_id: string | null;        // display ID e.g. "JOI-0042"
  monthly_base_salary: number | null;  // source of truth
  kpi_bonus_amount: number | null;
  weekly_base_salary: number | null;     // legacy — not read by calc
  daily_salary: number | null;            // legacy — not read by calc
  daily_discount_rate: number | null;     // legacy — not read by calc
  overtime_day_pay: number | null;        // legacy — not read by calc
  sunday_bonus_amount: number | null;     // legacy — not read by calc
  vacation_premium_pct: number | null;    // legacy — not read by calc
}

export interface PayrollRecord {
  id: string;
  week_id: string;
  employee_id: string;
  campaign_id: string;
  organization_id: string;
  include_in_payroll: boolean;
  // -- editable inputs --
  missed_days: number;
  overtime_days: number;
  sundays_worked: number;
  vacation_days: number;
  holiday_days: number;
  kpi_achieved: boolean;
  extra_bonus: number;
  partial_week_days: number | null;
  custom_deduction: number;
  // -- trigger-computed (never UPDATE from UI) --
  weekly_base: number;
  kpi_bonus: number;
  missed_deduction: number;
  overtime_pay: number;
  sunday_pay: number;
  vacation_pay: number;
  holiday_pay: number;
  total_pay: number;
  commission: number | null;
  commission_flag: string | null;
  // -- meta --
  status: WeekStatus;
  memo: string | null;
  auto_derived: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  // -- joined --
  employees: EmployeeRates | null;
  campaigns: { name: string } | null;
}

/** Only the input columns managers/owners can UPDATE from the week view. */
export type PayrollRecordInputs = {
  missed_days: number;
  overtime_days: number;
  sundays_worked: number;
  vacation_days: number;
  holiday_days: number;
  kpi_achieved: boolean;
  extra_bonus: number;
  partial_week_days: number | null;
  custom_deduction: number;
};

/* ------------------------------------------------------------------ */
/*  Query keys                                                          */
/* ------------------------------------------------------------------ */

export const payrollKeys = {
  currentPeriod: () => ["payroll", "current-period"] as const,
  weeksInPeriod: (periodId: string) => ["payroll-weeks", periodId] as const,
  week: (weekId: string) => ["payroll-week", weekId] as const,
  weekRecords: (weekId: string) => ["payroll-records", weekId] as const,
  // Phase 4b
  rateRoster: () => ["payroll", "rate-roster"] as const,
  agentHistory: (employeeId: string) => ["payroll", "agent-history", employeeId] as const,
  holidays: (year: number) => ["payroll", "holidays", year] as const,
  allPeriods: () => ["payroll", "all-periods"] as const,
  periodSummary: (periodId: string) => ["payroll", "period-summary", periodId] as const,
};

/* ------------------------------------------------------------------ */
/*  Phase 4b types                                                      */
/* ------------------------------------------------------------------ */

/** One row in the Rates Editor table. */
export interface RateRosterRow {
  id: string;                              // employees.id (uuid)
  employee_id: string;                     // employees.employee_id (text, e.g. "JOI-0042")
  full_name: string;
  work_name: string | null;
  campaign_id: string | null;              // kept for completeness; not surfaced in UI
  campaign_name: string | null;            // kept for completeness; not surfaced in UI
  client_id: string | null;                // surfaced in UI (replaces campaign)
  client_name: string | null;              // surfaced in UI (replaces campaign)
  department_id: string | null;
  department_name: string | null;
  shift_type: string | null;
  weekly_base_salary: number | null;
  daily_salary: number | null;
  daily_discount_rate: number | null;
  kpi_bonus_amount: number | null;
  overtime_day_pay: number | null;
  sunday_bonus_amount: number | null;
  vacation_premium_pct: number | null;
  monthly_base_salary: number | null;
}

/** Fields that the Rates Editor is allowed to write. */
export type EditableRateField =
  | "weekly_base_salary"
  | "daily_salary"
  | "daily_discount_rate"
  | "kpi_bonus_amount"
  | "overtime_day_pay"
  | "sunday_bonus_amount"
  | "vacation_premium_pct"
  | "monthly_base_salary";

/** Per-period entry on an agent's history page. */
export interface AgentHistoryRow {
  record_id: string;
  week_id: string;
  week_number: number;
  week_start: string;
  week_end: string;
  period_id: string;
  period_code: string | null;
  status: WeekStatus;
  include_in_payroll: boolean;
  missed_days: number;
  overtime_days: number;
  sundays_worked: number;
  vacation_days: number;
  holiday_days: number;
  kpi_achieved: boolean;
  extra_bonus: number;
  partial_week_days: number | null;
  weekly_base: number;
  kpi_bonus: number;
  missed_deduction: number;
  overtime_pay: number;
  sunday_pay: number;
  vacation_pay: number;
  holiday_pay: number;
  total_pay: number;
}

export interface MexicanHoliday {
  date: string;        // YYYY-MM-DD
  name: string | null;
  name_es: string | null;
  name_en: string | null;
  type: string;        // 'LFT_OFICIAL' | 'EMPRESA' | 'OPCIONAL'
  pays_premium: boolean;
}

/** One row in the Periods Management table. */
export interface PeriodWithSummary extends PayPeriod {
  agent_count: number;
  grand_total: number;
  week_count: number;
}

/* ------------------------------------------------------------------ */
/*  Landing hooks                                                       */
/* ------------------------------------------------------------------ */

/**
 * The most-recently-opened pay period. Returns null if none exists yet.
 * "Current" = status OPEN, latest end_date first.
 */
export function useCurrentPayPeriod() {
  return useQuery({
    queryKey: payrollKeys.currentPeriod(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_periods")
        .select("*")
        .eq("status", "OPEN")
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as PayPeriod) ?? null;
    },
  });
}

/**
 * Total payroll for the current open period (sum of all payroll_records.total_pay
 * across every week in the period). Returns 0 if no current period.
 * Used by the Dashboard's "Biweekly Payroll" KPI card.
 */
export function useCurrentPeriodTotal() {
  return useQuery({
    queryKey: ["payroll", "current-period-total"],
    queryFn: async () => {
      // 1. Get current open period
      const { data: period, error: pErr } = await supabase
        .from("payroll_periods")
        .select("id")
        .eq("status", "OPEN")
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!period) return { total: 0, period_id: null, week_count: 0, record_count: 0 };

      // 2. Sum payroll_records.total_pay for all weeks in this period
      const { data: weeks, error: wErr } = await supabase
        .from("payroll_weeks")
        .select("id")
        .eq("period_id", period.id);
      if (wErr) throw wErr;

      const weekIds = (weeks ?? []).map((w) => w.id);
      if (weekIds.length === 0) {
        return { total: 0, period_id: period.id, week_count: 0, record_count: 0 };
      }

      const { data: records, error: rErr } = await supabase
        .from("payroll_records")
        .select("total_pay")
        .in("week_id", weekIds);
      if (rErr) throw rErr;

      const total = (records ?? []).reduce(
        (s, r) => s + Number(r.total_pay ?? 0),
        0
      );

      return {
        total: Math.round(total * 100) / 100,
        period_id: period.id,
        week_count: weekIds.length,
        record_count: (records ?? []).length,
      };
    },
  });
}

/** All payroll_weeks rows for a given period, sorted by week_number. */
export function useWeeksInPeriod(periodId: string | null) {
  return useQuery({
    queryKey: payrollKeys.weeksInPeriod(periodId ?? ""),
    enabled: !!periodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_weeks")
        .select("*")
        .eq("period_id", periodId!)
        .order("week_number", { ascending: true });

      if (error) throw error;
      return (data ?? []) as PayrollWeek[];
    },
  });
}

/**
 * Create the next week in a period, then auto-derive records via pay_derive_week.
 * Owner-only in the UI; RLS enforces server-side.
 *
 * Week-dating logic: next_week_start = latest_week_end + 1 day. Falls back to
 * period.start_date if no weeks exist yet. This works correctly even when
 * weeks were backfilled out-of-order (e.g., a week_start before period.start_date
 * because Joe's rule puts the week_end in this period).
 */
export function useCreateNextWeek() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      periodId,
      existingWeeks,
      period,
    }: {
      periodId: string;
      existingWeeks: PayrollWeek[];
      period: PayPeriod;
    }) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      const toDateStr = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      const nextWeekNumber =
        existingWeeks.length > 0
          ? Math.max(...existingWeeks.map((w) => w.week_number)) + 1
          : 1;

      // Find the LATEST week_end across all existing weeks. The next week
      // starts the day after that, regardless of week_number ordering.
      let weekStartDate: Date;
      if (existingWeeks.length === 0) {
        // No weeks yet — start at period.start_date
        const [sy, sm, sd] = period.start_date.split("-").map(Number);
        weekStartDate = new Date(sy, sm - 1, sd);
      } else {
        // Use latest week_end + 1
        const latestEndISO = existingWeeks
          .map((w) => w.week_end)
          .sort()
          .pop()!;
        const [ey, em, ed] = latestEndISO.split("-").map(Number);
        const latestEnd = new Date(ey, em - 1, ed);
        weekStartDate = new Date(
          latestEnd.getFullYear(),
          latestEnd.getMonth(),
          latestEnd.getDate() + 1
        );
      }

      const weekEndDate = new Date(
        weekStartDate.getFullYear(),
        weekStartDate.getMonth(),
        weekStartDate.getDate() + 6
      );

      // Don't cap at period_end — weeks can legitimately span period boundaries
      // (Joe's rule: week_end determines which period a week belongs to).
      // If new week_start is past period_end, throw a clear error.
      const [pey, pem, ped] = period.end_date.split("-").map(Number);
      const periodEnd = new Date(pey, pem - 1, ped);
      if (weekStartDate > periodEnd) {
        throw new Error(
          `Next week would start ${toDateStr(weekStartDate)}, which is after ` +
            `the period ends (${period.end_date}). This period is full — ` +
            `close it as PAID and start a new period.`
        );
      }

      // Insert the week row.
      // organization_id is REQUIRED — both the NOT NULL constraint AND the
      // RLS policy (organization_id = my_org_id()) reject nulls. We derive
      // it from the parent period since both must belong to the same org.
      if (!period.organization_id) {
        throw new Error(
          `Cannot create week: period ${periodId} has no organization_id. ` +
            `Refresh the page and try again, or contact admin.`
        );
      }
      const { data: week, error: insertErr } = await supabase
        .from("payroll_weeks")
        .insert({
          period_id: periodId,
          week_number: nextWeekNumber,
          week_start: toDateStr(weekStartDate),
          week_end: toDateStr(weekEndDate),
          status: "UNPAID",
          organization_id: period.organization_id,
        })
        .select("id")
        .single();

      if (insertErr) {
        // Supabase errors aren't always Error instances; preserve message.
        throw new Error(
          `Failed to insert week row: ${insertErr.message ?? JSON.stringify(insertErr)}`
        );
      }

      // Auto-derive payroll_records from time_clock
      const { error: deriveErr } = await supabase.rpc("pay_derive_week", {
        p_week_id: week.id,
      });
      if (deriveErr) {
        throw new Error(
          `Auto-derive failed for week ${week.id}: ${deriveErr.message ?? JSON.stringify(deriveErr)}`
        );
      }

      return week;
    },
    onSuccess: (_, { periodId }) => {
      qc.invalidateQueries({ queryKey: payrollKeys.weeksInPeriod(periodId) });
      qc.invalidateQueries({ queryKey: payrollKeys.currentPeriod() });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Week view hooks                                                     */
/* ------------------------------------------------------------------ */

/** Single payroll_week row. */
export function useWeek(weekId: string | null) {
  return useQuery({
    queryKey: payrollKeys.week(weekId ?? ""),
    enabled: !!weekId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_weeks")
        .select("*")
        .eq("id", weekId!)
        .single();

      if (error) throw error;
      return data as PayrollWeek;
    },
  });
}

/**
 * All payroll_records for a week, joined with employee rates + campaign name.
 * RLS ensures managers only see records for employees they're authorized to view.
 * FK hints prevent PostgREST HTTP 300 ambiguity errors.
 */
export function useWeekRecords(weekId: string | null) {
  return useQuery({
    queryKey: payrollKeys.weekRecords(weekId ?? ""),
    enabled: !!weekId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_records")
        .select(
          `*,
          employees!payroll_records_employee_id_fkey(
            id,
            full_name,
            work_name,
            employee_id,
            monthly_base_salary,
            kpi_bonus_amount,
            weekly_base_salary,
            daily_salary,
            daily_discount_rate,
            overtime_day_pay,
            sunday_bonus_amount,
            vacation_premium_pct
          ),
          campaigns!payroll_records_campaign_id_fkey(name)`
        )
        .eq("week_id", weekId!);

      if (error) throw error;
      return (data ?? []) as PayrollRecord[];
    },
  });
}

/**
 * Update a single payroll_record's input columns.
 * The DB trigger trg_payroll_records_recalc fires automatically and
 * recomputes weekly_base / kpi_bonus / total_pay etc.
 * Never pass computed columns (weekly_base, kpi_bonus, etc.) — those are
 * trigger-owned and the UI should never write them directly.
 */
export function useUpdatePayrollRecord() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      recordId,
      weekId,
      inputs,
    }: {
      recordId: string;
      weekId: string;
      inputs: Partial<PayrollRecordInputs>;
    }) => {
      const { error } = await supabase
        .from("payroll_records")
        .update(inputs)
        .eq("id", recordId);

      if (error) throw error;
      return { recordId, weekId };
    },
    onSuccess: ({ weekId }) => {
      qc.invalidateQueries({ queryKey: payrollKeys.weekRecords(weekId) });
    },
  });
}

/**
 * Mark a week as COMPLETE and cascade that status to all its records.
 * Records already PAID are skipped (PAID lock trigger would reject them anyway).
 */
export function useMarkWeekComplete() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      weekId,
      periodId,
    }: {
      weekId: string;
      periodId: string;
    }) => {
      // 1. Update the week row
      const { error: weekErr } = await supabase
        .from("payroll_weeks")
        .update({
          status: "COMPLETE",
          status_changed_at: new Date().toISOString(),
          status_changed_by: user?.id ?? null,
        })
        .eq("id", weekId);
      if (weekErr) throw weekErr;

      // 2. Cascade to all non-PAID records in this week
      const { error: recErr } = await supabase
        .from("payroll_records")
        .update({ status: "COMPLETE" })
        .eq("week_id", weekId)
        .neq("status", "PAID");
      if (recErr) throw recErr;

      return { weekId, periodId };
    },
    onSuccess: ({ weekId, periodId }) => {
      qc.invalidateQueries({ queryKey: payrollKeys.week(weekId) });
      qc.invalidateQueries({ queryKey: payrollKeys.weekRecords(weekId) });
      qc.invalidateQueries({ queryKey: payrollKeys.weeksInPeriod(periodId) });
    },
  });
}

/**
 * Mark a pay period LOCKED and cascade PAID status to all its weeks + records.
 * Owner-only in the UI; RLS enforces server-side.
 * Records already PAID are skipped.
 */
export function useMarkPeriodPaid() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ periodId }: { periodId: string }) => {
      // 1. Lock the period
      const { error: periodErr } = await supabase
        .from("payroll_periods")
        .update({
          status: "LOCKED",
          locked_at: new Date().toISOString(),
          locked_by: user?.id ?? null,
        })
        .eq("id", periodId);
      if (periodErr) throw periodErr;

      // 2. Fetch all week IDs in this period
      const { data: weeks, error: weeksErr } = await supabase
        .from("payroll_weeks")
        .select("id")
        .eq("period_id", periodId);
      if (weeksErr) throw weeksErr;

      const weekIds = (weeks ?? []).map((w) => w.id);

      if (weekIds.length > 0) {
        // 3. Mark all weeks PAID
        const { error: weekStatusErr } = await supabase
          .from("payroll_weeks")
          .update({
            status: "PAID",
            status_changed_at: new Date().toISOString(),
            status_changed_by: user?.id ?? null,
          })
          .in("id", weekIds);
        if (weekStatusErr) throw weekStatusErr;

        // 4. Cascade to all non-PAID records in those weeks
        const { error: recErr } = await supabase
          .from("payroll_records")
          .update({ status: "PAID" })
          .in("week_id", weekIds)
          .neq("status", "PAID");
        if (recErr) throw recErr;
      }

      return { periodId };
    },
    onSuccess: ({ periodId }) => {
      qc.invalidateQueries({ queryKey: payrollKeys.currentPeriod() });
      qc.invalidateQueries({ queryKey: payrollKeys.weeksInPeriod(periodId) });
      // Invalidate all week + record caches (we don't know all weekIds here,
      // so broadcast a broad payroll invalidation)
      qc.invalidateQueries({ queryKey: ["payroll"] });
      qc.invalidateQueries({ queryKey: ["payroll-weeks"] });
      qc.invalidateQueries({ queryKey: ["payroll-week"] });
      qc.invalidateQueries({ queryKey: ["payroll-records"] });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Unlock PAID period (Phase 4c)                                       */
/* ------------------------------------------------------------------ */

/** Return shape from pay_unlock_period RPC. */
export interface UnlockPeriodResult {
  period_id: string;
  period_code: string | null;
  weeks_unlocked: number;
  records_unlocked: number;
  reason: string;
  actor: string;
  at: string;
}

/**
 * Owner-only: unlock a LOCKED pay period.
 * Calls pay_unlock_period(periodId, reason). DB enforces owner check + that
 * the period is currently LOCKED. On success, broadcasts payroll cache
 * invalidations so all open payroll views refresh.
 */
export function useUnlockPeriod() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      periodId,
      reason,
    }: {
      periodId: string;
      reason: string;
    }) => {
      const { data, error } = await supabase.rpc("pay_unlock_period", {
        p_period_id: periodId,
        p_reason: reason,
      });
      if (error) throw error;
      return data as unknown as UnlockPeriodResult;
    },
    onSuccess: (_, { periodId }) => {
      qc.invalidateQueries({ queryKey: payrollKeys.currentPeriod() });
      qc.invalidateQueries({ queryKey: payrollKeys.weeksInPeriod(periodId) });
      // Mirror useMarkPeriodPaid: broad invalidation so any open week/records
      // view refreshes too (we don't know all week IDs in this period).
      qc.invalidateQueries({ queryKey: ["payroll"] });
      qc.invalidateQueries({ queryKey: ["payroll-weeks"] });
      qc.invalidateQueries({ queryKey: ["payroll-week"] });
      qc.invalidateQueries({ queryKey: ["payroll-records"] });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Re-derive (Phase 4c)                                                */
/* ------------------------------------------------------------------ */

/**
 * Per-field "will be applied" entry inside a redrive diff row.
 * Values may be null for nullable columns (partial_week_days).
 */
export interface RedriveChange {
  from: number | null;
  to: number | null;
}

/**
 * Per-field "was manually changed — will be preserved" entry.
 */
export interface RedrivePreserved {
  manual: number | null;
  snapshot_was: number | null;
  fresh_would_be: number | null;
}

/** Fields the redrive function inspects. */
export type RedriveField =
  | "missed_days"
  | "overtime_days"
  | "sundays_worked"
  | "holiday_days"
  | "partial_week_days";

/** One row in the diff array — one per non-PAID payroll_record in the week. */
export interface RedriveDiffRow {
  employee_id: string;
  record_id: string;
  derive_status: string | null;  // 'OK' | 'NO_DATA' | 'NO_SHIFT_TYPE' | etc.
  changes: Partial<Record<RedriveField, RedriveChange>>;
  preserved: Partial<Record<RedriveField, RedrivePreserved>>;
}

/** Full pay_redrive_week response. */
export interface RedriveResult {
  confirmed: boolean;
  updated: number;
  would_update: number | null;
  skipped_paid: number;
  preserved_overrides: number;
  diff: RedriveDiffRow[];
}

/**
 * Preview the diff for re-deriving a week from time_clock.
 * Calls pay_redrive_week(week_id, false) — DOES NOT WRITE.
 *
 * The DB function preserves manual overrides (column != snapshot) and skips
 * PAID rows. The returned `diff` array includes every non-PAID record in the
 * week, including ones where `changes` and `preserved` are both empty objects
 * (i.e. nothing would change). The UI is responsible for filtering those out
 * for display.
 */
export function useRedriveWeekPreview() {
  return useMutation({
    mutationFn: async ({ weekId }: { weekId: string }) => {
      const { data, error } = await supabase.rpc("pay_redrive_week", {
        p_week_id: weekId,
        p_confirm: false,
      });
      if (error) throw error;
      return data as unknown as RedriveResult;
    },
  });
}

/**
 * Apply the redrive — calls pay_redrive_week(week_id, true).
 * Updates records in place; the BEFORE UPDATE trigger on payroll_records
 * recomputes total_pay etc. Invalidates the week + records caches.
 */
export function useRedriveWeekApply() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ weekId }: { weekId: string }) => {
      const { data, error } = await supabase.rpc("pay_redrive_week", {
        p_week_id: weekId,
        p_confirm: true,
      });
      if (error) throw error;
      return data as unknown as RedriveResult;
    },
    onSuccess: (_, { weekId }) => {
      qc.invalidateQueries({ queryKey: payrollKeys.weekRecords(weekId) });
      qc.invalidateQueries({ queryKey: payrollKeys.week(weekId) });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Permission helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Whether the current user can edit the extra_bonus field on this record.
 *
 * Matrix (locked in chat with D, 2026-05-20):
 *   UNPAID  → owner + manager can edit
 *   COMPLETE → owner only
 *   PAID    → nobody
 */
export function useCanEditExtraBonus(record: PayrollRecord | null): boolean {
  const { isOwner, isManager } = useAuth();
  if (!record) return false;
  if (record.status === "PAID") return false;
  if (record.status === "COMPLETE") return isOwner;
  // UNPAID
  return isOwner || isManager;
}

/** Only owner can create a new payroll week. */
export function useCanCreateWeek(): boolean {
  const { isOwner } = useAuth();
  return isOwner;
}

/** Only owner can lock a period to PAID. */
export function useCanLockToPaid(): boolean {
  const { isOwner } = useAuth();
  return isOwner;
}

/** Only owner can unlock a PAID period. Mirrors the DB-side is_owner() guard. */
export function useCanUnlockPaid(): boolean {
  const { isOwner } = useAuth();
  return isOwner;
}

/* ------------------------------------------------------------------ */
/*  Client-side pay preview helper                                      */
/* ------------------------------------------------------------------ */

/**
 * Replicates the pay_calc_record formula client-side for live preview.
 * Server trigger is always canonical — this is UX-only.
 * Returns null if employee rates are not loaded yet.
 *
 * Phase 4b simplification: derives daily = monthly/30, weekly = monthly/4.
 * OT pay = 0 (handled via extra_bonus), vacation pay = 0 (deferred).
 */
export function previewTotalPay(
  inputs: PayrollRecordInputs,
  rates: EmployeeRates | null
): number | null {
  if (!rates) return null;

  const monthly = rates.monthly_base_salary ?? 0;
  const daily = monthly / 30;                              // LFT convention
  const kpi = rates.kpi_bonus_amount ?? 0;
  const customDed = inputs.custom_deduction ?? 0;

  const r2 = (n: number) => Math.round(n * 100) / 100;

  let base: number;
  let missedDed: number;

  if (inputs.partial_week_days != null) {
    base = r2(daily * inputs.partial_week_days);
    missedDed = 0;
  } else {
    base = r2(monthly / 4);
    missedDed = r2(inputs.missed_days * daily);
  }

  const kpiBonus    = inputs.kpi_achieved ? kpi : 0;
  const overtimePay = 0;                                   // Phase 4b: extra_bonus instead
  const sundayPay   = r2(inputs.sundays_worked * daily * 0.25);  // LFT Art. 79
  const holidayPay  = r2(inputs.holiday_days   * daily * 2);     // LFT Art. 75
  const vacPay      = 0;                                          // Phase 4b: deferred

  return r2(
    base - missedDed - customDed
    + kpiBonus + overtimePay + sundayPay
    + vacPay + holidayPay
    + inputs.extra_bonus
  );
}

/* ------------------------------------------------------------------ */
/*  Phase 4b hooks — Rates Editor                                       */
/* ------------------------------------------------------------------ */

/**
 * All active non-system employees with their rate fields + joined
 * campaign/department names. Used by the Rates Editor page.
 */
export function useRateRoster() {
  return useQuery({
    queryKey: payrollKeys.rateRoster(),
    queryFn: async () => {
      // employees → campaigns (campaign_id) → clients (campaigns.client_id)
      // We surface client info in the UI; campaign is kept on the row for
      // future use but isn't shown in the filter bar or table.
      const { data, error } = await supabase
        .from("employees")
        .select(
          `id, employee_id, full_name, work_name, campaign_id, department_id,
           shift_type, weekly_base_salary, daily_salary, daily_discount_rate,
           kpi_bonus_amount, overtime_day_pay, sunday_bonus_amount,
           vacation_premium_pct, monthly_base_salary,
           campaigns!employees_campaign_id_fkey(name, clients(id, name)),
           departments(name)`
        )
        .eq("is_active", true)
        .eq("is_system_user", false)
        .order("full_name", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((row): RateRosterRow => {
        const campaigns = (row as { campaigns?: { name?: string; clients?: { id?: string; name?: string } | null } | null }).campaigns ?? null;
        return {
          id: row.id,
          employee_id: row.employee_id,
          full_name: row.full_name,
          work_name: row.work_name,
          campaign_id: row.campaign_id,
          campaign_name: campaigns?.name ?? null,
          client_id: campaigns?.clients?.id ?? null,
          client_name: campaigns?.clients?.name ?? null,
          department_id: row.department_id,
          department_name: (row as { departments?: { name?: string } | null }).departments?.name ?? null,
          shift_type: row.shift_type,
          weekly_base_salary: row.weekly_base_salary == null ? null : Number(row.weekly_base_salary),
          daily_salary: row.daily_salary == null ? null : Number(row.daily_salary),
          daily_discount_rate: row.daily_discount_rate == null ? null : Number(row.daily_discount_rate),
          kpi_bonus_amount: row.kpi_bonus_amount == null ? null : Number(row.kpi_bonus_amount),
          overtime_day_pay: row.overtime_day_pay == null ? null : Number(row.overtime_day_pay),
          sunday_bonus_amount: row.sunday_bonus_amount == null ? null : Number(row.sunday_bonus_amount),
          vacation_premium_pct: row.vacation_premium_pct == null ? null : Number(row.vacation_premium_pct),
          monthly_base_salary: row.monthly_base_salary == null ? null : Number(row.monthly_base_salary),
        };
      });
    },
  });
}

/**
 * Update a single employee's rate fields (one row at a time, used by inline edit).
 * Partial — only sends the fields that changed.
 * RLS enforces who can update.
 */
export function useUpdateEmployeeRates() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      employeeId,
      updates,
    }: {
      employeeId: string;
      updates: Partial<Record<EditableRateField, number | null>>;
    }) => {
      const { error } = await supabase
        .from("employees")
        .update(updates)
        .eq("id", employeeId);

      if (error) throw error;
      return { employeeId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: payrollKeys.rateRoster() });
      // Invalidate any open week views since rates feed the calc engine
      qc.invalidateQueries({ queryKey: ["payroll-records"] });
    },
  });
}

/**
 * Apply the same field-value to many employees in a single update statement.
 * Used by the bulk "Apply Raise" action.
 */
export function useBulkApplyRate() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      employeeIds,
      field,
      value,
    }: {
      employeeIds: string[];
      field: EditableRateField;
      value: number | null;
    }) => {
      if (employeeIds.length === 0) return { count: 0 };

      const { error } = await supabase
        .from("employees")
        .update({ [field]: value })
        .in("id", employeeIds);

      if (error) throw error;
      return { count: employeeIds.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: payrollKeys.rateRoster() });
      qc.invalidateQueries({ queryKey: ["payroll-records"] });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Phase 4b hooks — Per-Agent Breakdown                                */
/* ------------------------------------------------------------------ */

/**
 * Full payroll history for one employee: every record they have,
 * joined with the week + period for grouping in the UI.
 * RLS-scoped by employee (manager only sees agents in their campaigns).
 */
export function useAgentPayHistory(employeeId: string | null) {
  return useQuery({
    queryKey: payrollKeys.agentHistory(employeeId ?? ""),
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_records")
        .select(
          `id, week_id, status, include_in_payroll, missed_days, overtime_days,
           sundays_worked, vacation_days, holiday_days, kpi_achieved,
           extra_bonus, partial_week_days, weekly_base, kpi_bonus,
           missed_deduction, overtime_pay, sunday_pay, vacation_pay,
           holiday_pay, total_pay,
           payroll_weeks!inner(
             id, week_number, week_start, week_end, period_id,
             payroll_periods!inner(period_code)
           )`
        )
        .eq("employee_id", employeeId!)
        .order("week_start", { ascending: false, foreignTable: "payroll_weeks" });

      if (error) throw error;

      return (data ?? []).map((row): AgentHistoryRow => {
        const week = (row as unknown as { payroll_weeks: {
          id: string; week_number: number; week_start: string; week_end: string;
          period_id: string; payroll_periods: { period_code: string | null };
        } }).payroll_weeks;
        return {
          record_id: row.id,
          week_id: week.id,
          week_number: week.week_number,
          week_start: week.week_start,
          week_end: week.week_end,
          period_id: week.period_id,
          period_code: week.payroll_periods?.period_code ?? null,
          status: row.status as WeekStatus,
          include_in_payroll: row.include_in_payroll,
          missed_days: Number(row.missed_days),
          overtime_days: Number(row.overtime_days),
          sundays_worked: Number(row.sundays_worked),
          vacation_days: Number(row.vacation_days),
          holiday_days: Number(row.holiday_days),
          kpi_achieved: row.kpi_achieved,
          extra_bonus: Number(row.extra_bonus),
          partial_week_days: row.partial_week_days == null ? null : Number(row.partial_week_days),
          weekly_base: Number(row.weekly_base),
          kpi_bonus: Number(row.kpi_bonus),
          missed_deduction: Number(row.missed_deduction),
          overtime_pay: Number(row.overtime_pay),
          sunday_pay: Number(row.sunday_pay),
          vacation_pay: Number(row.vacation_pay),
          holiday_pay: Number(row.holiday_pay),
          total_pay: Number(row.total_pay),
        };
      });
    },
  });
}

/**
 * Vacation balance for one employee (admin view only — never on agent screens).
 *
 *   entitled  = employees.vacation_days_entitled (LFT Art. 76; manager-editable)
 *   used      = SUM(payroll_records.vacation_days) across all of that employee's records
 *   remaining = entitled − used  (clamped at 0)
 *
 * Returns null if employeeId is null. Returns null entitled if employee has
 * vacation_days_entitled = 0 (not yet eligible — under 1 year tenure).
 */
export function useEmployeeVacationBalance(employeeId: string | null) {
  return useQuery({
    queryKey: ["payroll", "vacation-balance", employeeId ?? ""],
    enabled: !!employeeId,
    queryFn: async () => {
      const [empResult, recordsResult] = await Promise.all([
        supabase
          .from("employees")
          .select("vacation_days_entitled, hire_date")
          .eq("id", employeeId!)
          .single(),
        supabase
          .from("payroll_records")
          .select("vacation_days")
          .eq("employee_id", employeeId!),
      ]);

      if (empResult.error) throw empResult.error;
      if (recordsResult.error) throw recordsResult.error;

      const entitled = Number(empResult.data?.vacation_days_entitled ?? 0);
      const used = (recordsResult.data ?? []).reduce(
        (s, r) => s + Number(r.vacation_days ?? 0),
        0
      );
      const remaining = Math.max(0, entitled - used);

      return {
        entitled,
        used,
        remaining,
        hire_date: empResult.data?.hire_date as string | null,
      };
    },
  });
}

/** Bare employee header info for the per-agent page. */
export function useEmployeeForPayroll(employeeId: string | null) {
  return useQuery({
    queryKey: ["payroll", "employee-header", employeeId ?? ""],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select(
          `id, employee_id, full_name, work_name, weekly_base_salary,
           daily_salary, kpi_bonus_amount,
           campaigns!employees_campaign_id_fkey(name),
           departments(name)`
        )
        .eq("id", employeeId!)
        .single();

      if (error) throw error;
      const r = data as {
        id: string;
        employee_id: string;
        full_name: string;
        work_name: string | null;
        weekly_base_salary: number | null;
        daily_salary: number | null;
        kpi_bonus_amount: number | null;
        campaigns?: { name?: string } | null;
        departments?: { name?: string } | null;
      };
      return {
        id: r.id,
        employee_id: r.employee_id,
        full_name: r.full_name,
        work_name: r.work_name,
        weekly_base_salary: r.weekly_base_salary == null ? null : Number(r.weekly_base_salary),
        daily_salary: r.daily_salary == null ? null : Number(r.daily_salary),
        kpi_bonus_amount: r.kpi_bonus_amount == null ? null : Number(r.kpi_bonus_amount),
        campaign_name: r.campaigns?.name ?? null,
        department_name: r.departments?.name ?? null,
      };
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Phase 4b hooks — Holidays                                           */
/* ------------------------------------------------------------------ */

/** LFT Article 74 + company holidays for a given calendar year. */
export function useMexicanHolidays(year: number) {
  return useQuery({
    queryKey: payrollKeys.holidays(year),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mexican_holidays")
        .select("date, name, name_es, name_en, type, pays_premium")
        .gte("date", `${year}-01-01`)
        .lte("date", `${year}-12-31`)
        .order("date", { ascending: true });

      if (error) throw error;
      return (data ?? []) as MexicanHoliday[];
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Phase 4b hooks — Periods Management                                 */
/* ------------------------------------------------------------------ */

/**
 * All pay periods with rolled-up summaries (agent count, grand total,
 * week count). Sorted by end_date desc, most recent first.
 * Limit to last N periods so this stays fast.
 */
export function useAllPeriodsWithSummaries(limit: number = 24) {
  return useQuery({
    queryKey: [...payrollKeys.allPeriods(), limit],
    queryFn: async () => {
      // 1. Fetch periods
      const { data: periods, error: pErr } = await supabase
        .from("payroll_periods")
        .select("*")
        .order("end_date", { ascending: false })
        .limit(limit);
      if (pErr) throw pErr;

      const periodList = (periods ?? []) as PayPeriod[];
      if (periodList.length === 0) return [] as PeriodWithSummary[];

      const periodIds = periodList.map((p) => p.id);

      // 2. Fetch all weeks for these periods (to count weeks + roll up records)
      const { data: weeks, error: wErr } = await supabase
        .from("payroll_weeks")
        .select("id, period_id")
        .in("period_id", periodIds);
      if (wErr) throw wErr;

      const weekList = (weeks ?? []) as Array<{ id: string; period_id: string }>;
      const weekIds = weekList.map((w) => w.id);

      // 3. Fetch records aggregates (one query, group client-side)
      let records: Array<{ week_id: string; employee_id: string; total_pay: number }> = [];
      if (weekIds.length > 0) {
        const { data: recs, error: rErr } = await supabase
          .from("payroll_records")
          .select("week_id, employee_id, total_pay")
          .in("week_id", weekIds);
        if (rErr) throw rErr;
        records = (recs ?? []) as typeof records;
      }

      // 4. Group: period -> week -> records
      const weeksByPeriod = new Map<string, string[]>();
      for (const w of weekList) {
        if (!weeksByPeriod.has(w.period_id)) weeksByPeriod.set(w.period_id, []);
        weeksByPeriod.get(w.period_id)!.push(w.id);
      }
      const recordsByWeek = new Map<string, Array<{ employee_id: string; total_pay: number }>>();
      for (const r of records) {
        if (!recordsByWeek.has(r.week_id)) recordsByWeek.set(r.week_id, []);
        recordsByWeek.get(r.week_id)!.push({ employee_id: r.employee_id, total_pay: Number(r.total_pay) });
      }

      return periodList.map((p): PeriodWithSummary => {
        const wIds = weeksByPeriod.get(p.id) ?? [];
        const agentSet = new Set<string>();
        let total = 0;
        for (const wid of wIds) {
          for (const rec of recordsByWeek.get(wid) ?? []) {
            agentSet.add(rec.employee_id);
            total += rec.total_pay;
          }
        }
        return {
          ...p,
          week_count: wIds.length,
          agent_count: agentSet.size,
          grand_total: Math.round(total * 100) / 100,
        };
      });
    },
  });
}
