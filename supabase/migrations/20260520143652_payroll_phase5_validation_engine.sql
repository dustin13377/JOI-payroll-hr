-- =============================================================================
-- Payroll Phase 5 — Step 3: Validation engine (archive replay vs. calc engine)
-- Reconstructed 2026-05-20 from DB introspection (applied without local file).
--
-- Adds 'commission' to the pay_components composite type, updates
-- _calc_pay_components to carry it through, creates payroll_validation_runs
-- table, and creates pay_validate_archive_all() which replays every archive row
-- through the calc engine and compares to Joe's totals.
--
-- Gate: match_rate >= 95% AND diverge_count = 0 → gate_passed = true
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend pay_components composite type with commission field
-- ---------------------------------------------------------------------------
ALTER TYPE public.pay_components
  ADD ATTRIBUTE commission numeric;

-- ---------------------------------------------------------------------------
-- 2. Update _calc_pay_components to pass commission through
--    (full replacement — commission is read from the record, not calculated)
-- ---------------------------------------------------------------------------
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

  -- Branch B: not included in payroll
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
  -- Sunday pay = 25% premium on top of daily rate (LFT Art. 71)
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

-- ---------------------------------------------------------------------------
-- 3. payroll_validation_runs — stores one row per validation run
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_validation_runs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at              timestamptz NOT NULL DEFAULT now(),
  run_by              uuid        REFERENCES auth.users(id),
  notes               text,
  total_archive_rows  int         NOT NULL,
  replay_eligible     int         NOT NULL,
  match_count         int         NOT NULL,
  diverge_count       int         NOT NULL,
  skip_count          int         NOT NULL,
  match_rate_pct      numeric(5,2) NOT NULL,
  gate_passed         boolean     NOT NULL,
  diverge_detail      jsonb
);

ALTER TABLE public.payroll_validation_runs ENABLE ROW LEVEL SECURITY;

-- Leadership (owner/admin/manager) can SELECT; nobody can INSERT/UPDATE/DELETE
-- directly — rows are created only via pay_validate_archive_all (SECURITY DEFINER).
DROP POLICY IF EXISTS validation_runs_select ON public.payroll_validation_runs;
CREATE POLICY validation_runs_select ON public.payroll_validation_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('owner','admin','manager')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. pay_validate_archive_all — replays every eligible archive row
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_validate_archive_all(
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id            uuid := gen_random_uuid();
  v_total             int  := 0;
  v_eligible          int  := 0;
  v_match             int  := 0;
  v_diverge           int  := 0;
  v_skip              int  := 0;
  v_diverge_detail    jsonb := '[]'::jsonb;
  v_match_rate        numeric(5,2);
  v_gate              boolean;

  rec                 payroll_archive%ROWTYPE;
  v_emp               employees%ROWTYPE;
  v_pr                payroll_records%ROWTYPE;
  calc                public.pay_components;
  v_diff              numeric;
  v_daily             numeric;
BEGIN
  FOR rec IN
    SELECT * FROM public.payroll_archive ORDER BY week_start, legacy_agent_id
  LOOP
    v_total := v_total + 1;

    IF rec.employee_id IS NULL THEN
      v_skip := v_skip + 1;
      CONTINUE;
    END IF;

    SELECT * INTO v_emp FROM public.employees WHERE id = rec.employee_id LIMIT 1;
    IF NOT FOUND THEN
      v_skip := v_skip + 1;
      CONTINUE;
    END IF;

    v_eligible := v_eligible + 1;

    -- Derive all rates from the archived weekly_base (self-contained replay).
    -- Using archived weekly_base rather than current employee rates so the
    -- replay reflects what Joe calculated, not current salary.
    v_daily := round(rec.weekly_base * 4.0 / 30.0, 2);
    v_emp.weekly_base_salary  := rec.weekly_base;
    v_emp.daily_salary        := v_daily;
    v_emp.daily_discount_rate := v_daily;

    -- Build a synthetic payroll_records row from archive data
    v_pr.include_in_payroll := rec.include_in_payroll;
    v_pr.missed_days        := rec.missed_days;
    v_pr.overtime_days      := rec.overtime_days;
    v_pr.sundays_worked     := rec.sundays_worked;
    v_pr.vacation_days      := rec.vacation_days;
    v_pr.holiday_days       := rec.holiday_days;
    v_pr.kpi_achieved       := rec.kpi_achieved;
    v_pr.extra_bonus        := COALESCE(rec.extra_bonus, 0);
    v_pr.partial_week_days  := rec.partial_week_days;
    v_pr.commission         := COALESCE(rec.commission, 0);

    calc := public._calc_pay_components(v_emp, v_pr);

    v_diff := abs(calc.total_pay - rec.total_pay);

    IF v_diff <= 0.01 THEN
      v_match := v_match + 1;
    ELSE
      v_diverge := v_diverge + 1;
      v_diverge_detail := v_diverge_detail || jsonb_build_object(
        'archive_id',       rec.id,
        'period_code',      rec.period_code,
        'week_label',       rec.week_label,
        'legacy_agent_id',  rec.legacy_agent_id,
        'agent_name',       rec.agent_name,
        'joe_total',        rec.total_pay,
        'engine_total',     calc.total_pay,
        'diff',             round(v_diff, 2),
        'components', jsonb_build_object(
          'engine_weekly_base',      calc.weekly_base,
          'engine_missed_deduction', calc.missed_deduction,
          'engine_kpi_bonus',        calc.kpi_bonus,
          'engine_overtime_pay',     calc.overtime_pay,
          'engine_sunday_pay',       calc.sunday_pay,
          'engine_vacation_pay',     calc.vacation_pay,
          'engine_holiday_pay',      calc.holiday_pay,
          'engine_commission',       calc.commission
        ),
        'joe_components', jsonb_build_object(
          'joe_weekly_base',      rec.weekly_base,
          'joe_missed_deduction', rec.missed_deduction,
          'joe_kpi_bonus',        rec.kpi_bonus,
          'joe_overtime_pay',     rec.overtime_pay,
          'joe_sunday_pay',       rec.sunday_pay,
          'joe_vacation_pay',     rec.vacation_pay,
          'joe_holiday_pay',      rec.holiday_pay,
          'joe_commission',       rec.commission
        ),
        'inputs', jsonb_build_object(
          'missed_days',       rec.missed_days,
          'overtime_days',     rec.overtime_days,
          'sundays_worked',    rec.sundays_worked,
          'vacation_days',     rec.vacation_days,
          'holiday_days',      rec.holiday_days,
          'kpi_achieved',      rec.kpi_achieved,
          'extra_bonus',       rec.extra_bonus,
          'partial_week_days', rec.partial_week_days,
          'commission',        rec.commission
        ),
        'rates_used', jsonb_build_object(
          'weekly_base_salary',   v_emp.weekly_base_salary,
          'daily_rate',           v_daily,
          'kpi_bonus_amount',     v_emp.kpi_bonus_amount,
          'overtime_day_pay',     v_emp.overtime_day_pay,
          'vacation_premium_pct', v_emp.vacation_premium_pct
        )
      );
    END IF;

  END LOOP;

  IF v_eligible = 0 THEN
    v_match_rate := 0;
  ELSE
    v_match_rate := round((v_match::numeric / v_eligible::numeric) * 100, 2);
  END IF;

  v_gate := (v_match_rate >= 95.00 AND v_diverge = 0);

  INSERT INTO public.payroll_validation_runs (
    id, run_at, run_by, notes,
    total_archive_rows, replay_eligible, match_count, diverge_count, skip_count,
    match_rate_pct, gate_passed, diverge_detail
  ) VALUES (
    v_run_id, now(), auth.uid(), p_notes,
    v_total, v_eligible, v_match, v_diverge, v_skip,
    v_match_rate, v_gate, v_diverge_detail
  );

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pay_validate_archive_all(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.pay_validate_archive_all(text) TO authenticated;
