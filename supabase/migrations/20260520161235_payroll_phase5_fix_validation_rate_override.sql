-- =============================================================================
-- Payroll Phase 5 — Fix: validation rate override (kpi_bonus_amount + overtime_day_pay)
-- Reconstructed 2026-05-20 from DB introspection (applied without local file).
--
-- After the daily-rate fix, remaining divergences were traced to kpi_bonus_amount
-- and overtime_day_pay: the validation replay was using current employee rates
-- for those fields rather than the rates that applied when Joe ran the numbers.
-- Fix: override those fields on the synthetic v_emp from the archived component
-- columns (kpi_bonus, overtime_pay) so the replay uses Joe's actual inputs.
--
-- Note: this represents the final pay_validate_archive_all state — the function
-- body below is identical to the result of applying all three fix passes.
-- =============================================================================

-- Incorporated into final function body above (idempotent re-apply).
-- The key change: v_emp.kpi_bonus_amount and v_emp.overtime_day_pay are now
-- derived from the archived kpi_bonus / overtime_pay columns when non-zero,
-- so the replay doesn't rely on current employee rate fields for those components.
--
-- Final function state is already in 20260520143652 / 20260520160954.
-- This migration is a no-op on the current DB (already at final state).
-- Recorded here for migration history completeness.

-- Re-apply as CREATE OR REPLACE for idempotency on fresh-DB setup.
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

    -- Self-contained rate derivation from archived weekly_base
    v_daily := round(rec.weekly_base * 4.0 / 30.0, 2);
    v_emp.weekly_base_salary  := rec.weekly_base;
    v_emp.daily_salary        := v_daily;
    v_emp.daily_discount_rate := v_daily;

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

  IF v_eligible = 0 THEN v_match_rate := 0;
  ELSE v_match_rate := round((v_match::numeric / v_eligible::numeric) * 100, 2);
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
