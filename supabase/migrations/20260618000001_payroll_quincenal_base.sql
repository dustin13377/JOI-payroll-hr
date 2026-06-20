-- =============================================================================
-- Payroll Task 1 — Lock cadence to QUINCENAL (base = monthly / 2)
--
-- Joe confirmed (2026-06-18): every employee is paid quincenal (1st–15th and
-- 16th–end of month). No weekly-paid groups exist.
--
-- This is a faithful CREATE OR REPLACE of the CURRENT LIVE _calc_pay_components
-- (from supabase/baseline_schema.sql — the real prod schema), changing EXACTLY
-- ONE line: Branch D full-period base
--     before: monthly_base_salary / 4   (weekly)
--     after:  monthly_base_salary / 2   (quincenal)
--
-- Everything else is preserved verbatim from the live function:
--   daily = monthly_base_salary / 30, overtime via extra_bonus (overtime_pay=0),
--   sunday = 25% × daily, holiday = 2 × daily, vacation deferred (0),
--   custom_deduction subtracted, commission included.
--
-- NOTE: the prior version of this file (regenerated from an older committed
-- migration) was stale — prod had advanced past it. It is replaced here.
-- Remaining TS/SQL difference (commission in the SQL but not yet in previewPay)
-- is Task 2 — see docs/payroll-rework-divergences.md.
--
-- Idempotent: CREATE OR REPLACE. No data modified. D applies to production.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._calc_pay_components(
  e public.employees,
  r public.payroll_records
)
RETURNS public.pay_components
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  c     public.pay_components;
  daily numeric;
BEGIN
  -- Branch B: not included in payroll
  IF NOT r.include_in_payroll THEN
    c.weekly_base := 0; c.kpi_bonus := 0; c.missed_deduction := 0;
    c.overtime_pay := 0; c.sunday_pay := 0; c.vacation_pay := 0;
    c.holiday_pay := 0; c.commission := 0; c.total_pay := 0;
    RETURN c;
  END IF;

  -- Derive daily from monthly. Source of truth = employees.monthly_base_salary
  -- (LFT convention: monthly / 30). If unset, the agent has no rate
  -- configured and everything below returns 0.
  daily := COALESCE(e.monthly_base_salary, 0) / 30.0;

  -- Components common to both partial-week and full-week branches
  c.kpi_bonus    := CASE WHEN r.kpi_achieved THEN COALESCE(e.kpi_bonus_amount, 0) ELSE 0::numeric END;
  c.overtime_pay := 0;                                                              -- Phase 4b: OT handled via extra_bonus
  c.sunday_pay   := round((r.sundays_worked * daily * 0.25)::numeric, 2);           -- LFT Art. 79
  c.holiday_pay  := round((r.holiday_days   * daily * 2)::numeric,    2);           -- LFT Art. 75
  c.commission   := COALESCE(r.commission, 0);
  c.vacation_pay := 0;                                                              -- Phase 4b: deferred to new-entity work

  -- Branch C: partial week (mid-week hire)
  IF r.partial_week_days IS NOT NULL AND r.partial_week_days > 0 THEN
    c.weekly_base      := round((daily * r.partial_week_days)::numeric, 2);
    c.missed_deduction := 0;
    c.total_pay        := round(
      (c.weekly_base + c.kpi_bonus + c.overtime_pay
       + c.sunday_pay + c.holiday_pay
       + r.extra_bonus + c.commission
       - COALESCE(r.custom_deduction, 0))::numeric,
      2
    );
    RETURN c;
  END IF;

  -- Branch D: full period
  -- TASK 1 CHANGE: quincenal base = monthly / 2 (was monthly / 4).
  c.weekly_base      := round((COALESCE(e.monthly_base_salary, 0) / 2.0)::numeric, 2);
  c.missed_deduction := round((r.missed_days * daily)::numeric, 2);
  c.total_pay := round(
    (c.weekly_base - c.missed_deduction - COALESCE(r.custom_deduction, 0)
     + c.kpi_bonus + c.overtime_pay + c.sunday_pay
     + c.vacation_pay + c.holiday_pay
     + r.extra_bonus + c.commission)::numeric,
    2
  );
  RETURN c;
END;
$$;
