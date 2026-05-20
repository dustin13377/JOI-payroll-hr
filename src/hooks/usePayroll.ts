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

/** Employee rate fields needed for client-side pay preview in expanded row. */
export interface EmployeeRates {
  id: string;
  full_name: string;
  work_name: string | null;
  employee_id: string | null;        // display ID e.g. "JOI-0042"
  weekly_base_salary: number | null;
  daily_salary: number | null;
  daily_discount_rate: number | null;
  kpi_bonus_amount: number | null;
  overtime_day_pay: number | null;
  sunday_bonus_amount: number | null;
  vacation_premium_pct: number | null;
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
};

/* ------------------------------------------------------------------ */
/*  Query keys                                                          */
/* ------------------------------------------------------------------ */

export const payrollKeys = {
  currentPeriod: () => ["payroll", "current-period"] as const,
  weeksInPeriod: (periodId: string) => ["payroll-weeks", periodId] as const,
  week: (weekId: string) => ["payroll-week", weekId] as const,
  weekRecords: (weekId: string) => ["payroll-records", weekId] as const,
};

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
      const nextWeekNumber =
        existingWeeks.length > 0
          ? Math.max(...existingWeeks.map((w) => w.week_number)) + 1
          : 1;

      // Calculate week dates from the period's start_date.
      // Parse as local noon to avoid UTC-midnight shift edge cases.
      const [sy, sm, sd] = period.start_date.split("-").map(Number);
      const weekStartDate = new Date(sy, sm - 1, sd + (nextWeekNumber - 1) * 7);
      const weekEndDate = new Date(
        weekStartDate.getFullYear(),
        weekStartDate.getMonth(),
        weekStartDate.getDate() + 6
      );

      // Cap at period end date
      const [ey, em, ed] = period.end_date.split("-").map(Number);
      const periodEnd = new Date(ey, em - 1, ed);
      if (weekEndDate > periodEnd) {
        weekEndDate.setTime(periodEnd.getTime());
      }

      const pad = (n: number) => String(n).padStart(2, "0");
      const toDateStr = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      // Insert the week row
      const { data: week, error: insertErr } = await supabase
        .from("payroll_weeks")
        .insert({
          period_id: periodId,
          week_number: nextWeekNumber,
          week_start: toDateStr(weekStartDate),
          week_end: toDateStr(weekEndDate),
          status: "UNPAID",
        })
        .select("id")
        .single();

      if (insertErr) throw insertErr;

      // Auto-derive payroll_records from time_clock
      const { error: deriveErr } = await supabase.rpc("pay_derive_week", {
        p_week_id: week.id,
      });
      if (deriveErr) throw deriveErr;

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
            weekly_base_salary,
            daily_salary,
            daily_discount_rate,
            kpi_bonus_amount,
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

/* ------------------------------------------------------------------ */
/*  Client-side pay preview helper                                      */
/* ------------------------------------------------------------------ */

/**
 * Replicates the pay_calc_record formula client-side for live preview.
 * Server trigger is always canonical — this is UX-only.
 * Returns null if employee rates are not loaded yet.
 */
export function previewTotalPay(
  inputs: PayrollRecordInputs,
  rates: EmployeeRates | null
): number | null {
  if (!rates) return null;

  const {
    weekly_base_salary,
    daily_salary,
    daily_discount_rate,
    kpi_bonus_amount,
    overtime_day_pay,
    sunday_bonus_amount,
    vacation_premium_pct,
  } = rates;

  const ds = daily_salary ?? 0;
  const ddr = daily_discount_rate ?? 0;
  const kpi = kpi_bonus_amount ?? 0;
  const otPay = overtime_day_pay ?? 0;
  const sunBonus = sunday_bonus_amount ?? 0;
  const vacPct = vacation_premium_pct ?? 0.25;
  const wbs = weekly_base_salary ?? 0;

  let base: number;
  let missedDed: number;
  let vacPay: number;

  if (inputs.partial_week_days != null) {
    base = Math.round(ds * inputs.partial_week_days * 100) / 100;
    missedDed = 0;
    vacPay = 0;
  } else {
    base = wbs;
    missedDed = Math.round(inputs.missed_days * ddr * 100) / 100;
    vacPay =
      Math.round(inputs.vacation_days * ds * (1 + vacPct) * 100) / 100;
  }

  const kpiBonus = inputs.kpi_achieved ? kpi : 0;
  const overtimePay = Math.round(inputs.overtime_days * otPay * 100) / 100;
  const sundayPay = Math.round(inputs.sundays_worked * sunBonus * 100) / 100;
  const holidayPay = Math.round(inputs.holiday_days * ds * 2 * 100) / 100;

  const total =
    Math.round(
      (base -
        missedDed +
        kpiBonus +
        overtimePay +
        sundayPay +
        vacPay +
        holidayPay +
        inputs.extra_bonus) *
        100
    ) / 100;

  return total;
}
