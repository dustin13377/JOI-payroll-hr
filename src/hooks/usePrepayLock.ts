/**
 * usePrepayLock — Close & Lock a quincenal pre-payroll period.
 *
 * On lock: (1) snapshot every employee's computed pay into prepay_lines,
 * (2) mark the payroll_periods row LOCKED, (3) auto-create the next period
 * (OPEN) so the screen rolls forward. Owner-only (RLS enforces server-side).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PrepayLine {
  employee_id: string;
  monthly_base: number;
  missed_days: number;
  makeup_days: number;
  overtime_days: number;
  sundays_worked: number;
  vacation_days: number;
  base: number;
  kpi_bonus: number;
  missed_deduction: number;
  partial_day_deduction: number;
  makeup_credit: number;
  overtime_pay: number;
  sunday_pay: number;
  vacation_premium: number;
  holiday_pay: number;
  spiff_mxn: number;
  advance_deduction: number;
  net: number;
}

/** One advance instalment to book against the period being locked. */
export interface AdvanceCharge {
  advance_id: string;
  amount: number;
}

export interface LockPeriod {
  id: string;
  year: number;
  month: number;
  half: "PP1" | "PP2";
}

/** Compute the next period that opens after this one. */
function nextPeriod(p: LockPeriod) {
  let { year, month } = p;
  let half: "PP1" | "PP2";
  if (p.half === "PP1") {
    half = "PP2";
  } else {
    half = "PP1";
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  const start_date = half === "PP1" ? `${year}-${mm}-01` : `${year}-${mm}-16`;
  const end_date = half === "PP1" ? `${year}-${mm}-15` : `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
  return {
    period_code: `${year}-${mm}-${half}`,
    year,
    month,
    half,
    start_date,
    end_date,
    status: "OPEN",
    period_type: half === "PP1" ? "Q1" : "Q2",
  };
}

export function usePrepayLock() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      period,
      lines,
      advanceCharges = [],
    }: {
      period: LockPeriod;
      lines: PrepayLine[];
      advanceCharges?: AdvanceCharge[];
    }) => {
      // 1. Snapshot the lines (replace any prior snapshot for this period)
      await supabase.from("prepay_lines").delete().eq("period_id", period.id);
      if (lines.length > 0) {
        const rows = lines.map((l) => ({ ...l, period_id: period.id }));
        const { error: insErr } = await supabase.from("prepay_lines").insert(rows);
        if (insErr) throw insErr;
      }

      // 1b. Book the advance instalments against this period. This is what
      // actually moves the loan balance — without it the same $500 would come
      // off every period forever. Deliberately NOT wrapped in the delete/insert
      // above: re-locking a period must not charge a second instalment, which
      // the (advance_id, period_id) unique key enforces. ignoreDuplicates makes
      // a re-lock a no-op rather than an error. A trigger flips the advance to
      // paid_off once the ledger covers the principal.
      if (advanceCharges.length > 0) {
        const { error: advErr } = await supabase
          .from("employee_advance_deductions")
          .upsert(
            advanceCharges.map((a) => ({
              advance_id: a.advance_id,
              period_id: period.id,
              amount: a.amount,
            })),
            { onConflict: "advance_id,period_id", ignoreDuplicates: true }
          );
        if (advErr) throw advErr;
      }

      // 2. Lock the period
      const { error: lockErr } = await supabase
        .from("payroll_periods")
        .update({ status: "LOCKED", locked_at: new Date().toISOString(), locked_by: user?.id ?? null })
        .eq("id", period.id);
      if (lockErr) throw lockErr;

      // 3. Auto-create the next period if it doesn't already exist
      const np = nextPeriod(period);
      const { data: existing } = await supabase
        .from("payroll_periods")
        .select("id")
        .eq("period_code", np.period_code)
        .maybeSingle();
      if (!existing) {
        const { error: npErr } = await supabase.from("payroll_periods").insert(np);
        if (npErr) throw npErr;
      }

      return { lockedPeriodId: period.id, nextPeriodCode: np.period_code };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      qc.invalidateQueries({ queryKey: ["payroll-computed"] });
      qc.invalidateQueries({ queryKey: ["prepay-advances"] });
      qc.invalidateQueries({ queryKey: ["prepay-advance-taken"] });
    },
  });
}
