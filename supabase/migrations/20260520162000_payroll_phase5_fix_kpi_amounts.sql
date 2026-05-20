-- =============================================================================
-- Payroll Phase 5 — Fix: KPI bonus amounts + sunday pay formula in calc engine
-- Reconstructed 2026-05-20 from DB introspection (applied without local file).
--
-- Two formula corrections identified during validation replay:
--
--   1. sunday_pay: Changed from e.sunday_bonus_amount (flat amount field) to
--      e.daily_salary * 0.25 (LFT Art. 71 premium formula). Joe's sheet uses
--      the formula, not the flat field, so sunday_bonus_amount was causing
--      divergences wherever it differed from 25% of daily rate.
--
--   2. kpi_bonus: Already correct (uses e.kpi_bonus_amount). No change needed.
--
-- This is the final form of _calc_pay_components — the version stored in the DB
-- as of 2026-05-20 after all Phase 5 fix passes.
-- =============================================================================

-- Final form of _calc_pay_components (idempotent re-apply)
CREATE OR REPLACE FUNCTION public._calc_pay_components(
  e employees,
  r payroll_records
)
RETURNS public.pay_components
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  c public.pay_components;
BEGIN

  -- Branch B: excluded from payroll
  IF NOT r.include_in_payroll THEN
    c.weekly_base      := 0;
    c.kpi_bonus        := 0;
    c.missed_deduction := 0;
    c.overtime_pay     := 0;
    c.sunday_pay       := 0;
    c.vacation_pay     := 0;
    c.holiday_pay      := 0;
    c.commission       := 0;
    c.total_pay        := 0;
    RETURN c;
  END IF;

  -- Shared components
  c.kpi_bonus    := CASE WHEN r.kpi_achieved THEN e.kpi_bonus_amount ELSE 0::numeric END;
  c.overtime_pay := round((r.overtime_days  * e.overtime_day_pay)::numeric,        2);
  -- LFT Art. 71: Sunday premium = 25% of daily rate (not a flat bonus amount)
  c.sunday_pay   := round((r.sundays_worked * e.daily_salary * 0.25)::numeric,     2);
  c.holiday_pay  := round((r.holiday_days   * e.daily_salary * 2)::numeric,        2);
  c.commission   := COALESCE(r.commission, 0);

  -- Branch C: partial week (new hire, mid-week start)
  IF r.partial_week_days IS NOT NULL AND r.partial_week_days > 0 THEN
    c.weekly_base      := round((e.daily_salary * r.partial_week_days)::numeric, 2);
    c.missed_deduction := 0;
    c.vacation_pay     := 0;
    c.total_pay        := round(
      (c.weekly_base + c.kpi_bonus + c.overtime_pay
       + c.sunday_pay + c.holiday_pay
       + r.extra_bonus + c.commission)::numeric,
      2
    );
    RETURN c;
  END IF;

  -- Branch D: full week
  c.weekly_base      := e.weekly_base_salary;
  c.missed_deduction := round((r.missed_days  * e.daily_discount_rate)::numeric,   2);
  c.vacation_pay     := round(
    (r.vacation_days * e.daily_salary * (1 + e.vacation_premium_pct))::numeric, 2
  );
  c.total_pay := round(
    (c.weekly_base - c.missed_deduction
     + c.kpi_bonus + c.overtime_pay + c.sunday_pay
     + c.vacation_pay + c.holiday_pay
     + r.extra_bonus + c.commission)::numeric,
    2
  );
  RETURN c;

END;
$$;
