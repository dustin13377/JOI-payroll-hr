-- Migration: 20260519000005_payroll_phase2_calc_engine.sql
-- Phase 2: Calc engine — _calc_pay_components + pay_calc_record RPC + BEFORE trigger
--
-- Source of truth: JOI_PAYROLL_CLEAN.js calcAgentPay_() line 885.
-- This migration is a direct port of that function into PL/pgSQL.
-- See docs/payroll-reference/PHASE2_CALC_SPEC.md for the full spec.
-- See docs/payroll-reference/PHASE2_CODE_REVIEW.md for divergence findings.
--
-- D approved 2026-05-19.

-- ============================================================================
-- Composite return type for the shared helper
-- ============================================================================
DROP TYPE IF EXISTS public.pay_components CASCADE;

CREATE TYPE public.pay_components AS (
  weekly_base      numeric(12,2),
  kpi_bonus        numeric(12,2),
  missed_deduction numeric(12,2),
  overtime_pay     numeric(12,2),
  sunday_pay       numeric(12,2),
  vacation_pay     numeric(12,2),
  holiday_pay      numeric(12,2),
  total_pay        numeric(12,2)
);

-- ============================================================================
-- _calc_pay_components(e, r)
--
-- Shared helper — called by BOTH pay_calc_record and the trigger so the math
-- lives in exactly one place.  Any bug fix only needs to happen once here.
--
-- Implements the 4 branches from calcAgentPay_():
--   B: include_in_payroll = false → zero everything
--   C: partial_week_days IS NOT NULL AND > 0 → mid-week hire convention
--   D: full week (normal case)
--   A: PAID guard is handled by callers, not here.
--
-- Rounding policy (PHASE2_CALC_SPEC §5 + BUG-07 fix):
--   Every per-component intermediate is round(x::numeric, 2).
--   Cast to ::numeric is MANDATORY — round(double_precision, 2) uses
--   banker's rounding and can drift.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._calc_pay_components(
  e  public.employees,
  r  public.payroll_records
)
RETURNS public.pay_components
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  c public.pay_components;
BEGIN

  -- ── Branch B: not included in payroll (Joe CLEAN.js joiRecalculatePayrollRunRow_ line 8340)
  IF NOT r.include_in_payroll THEN
    c.weekly_base      := 0;
    c.kpi_bonus        := 0;
    c.missed_deduction := 0;
    c.overtime_pay     := 0;
    c.sunday_pay       := 0;
    c.vacation_pay     := 0;
    c.holiday_pay      := 0;
    c.total_pay        := 0;
    RETURN c;
  END IF;

  -- ── Shared components (same in both partial and full branches)
  c.kpi_bonus    := CASE WHEN r.kpi_achieved THEN e.kpi_bonus_amount ELSE 0::numeric END;
  c.overtime_pay := round((r.overtime_days    * e.overtime_day_pay)::numeric,   2);
  c.sunday_pay   := round((r.sundays_worked   * e.sunday_bonus_amount)::numeric, 2);
  -- LFT Art. 75: holiday_pay = days × daily_salary × 2 (extra premium only;
  -- the base day is already covered by weekly_base).
  c.holiday_pay  := round((r.holiday_days * e.daily_salary * 2)::numeric, 2);

  -- ── Branch C: partial week (Joe CLEAN.js calcAgentPay_ line 920)
  -- Mid-week hire: earns daily_salary × days worked.
  -- No missed-day deduction (not scheduled for absent days).
  -- No vacation pay (can't accrue on first partial week).
  -- holiday_pay IS included — follows calcAgentPay_ line 922.
  -- (calcPartialWeekPay_ line 3099 omits holiday_pay — see PHASE2_CODE_REVIEW.md Finding 1)
  IF r.partial_week_days IS NOT NULL AND r.partial_week_days > 0 THEN
    c.weekly_base      := round((e.daily_salary * r.partial_week_days)::numeric, 2);
    c.missed_deduction := 0;
    c.vacation_pay     := 0;
    c.total_pay        := round(
      (c.weekly_base + c.kpi_bonus + c.overtime_pay
       + c.sunday_pay + c.holiday_pay + r.extra_bonus)::numeric,
      2
    );
    RETURN c;
  END IF;

  -- ── Branch D: full week — normal case (Joe CLEAN.js calcAgentPay_ lines 904–926)
  c.weekly_base      := e.weekly_base_salary;   -- stored numeric(12,2), no rounding needed
  c.missed_deduction := round((r.missed_days   * e.daily_discount_rate)::numeric, 2);
  c.vacation_pay     := round(
    (r.vacation_days * e.daily_salary * (1 + e.vacation_premium_pct))::numeric,
    2
  );
  c.total_pay        := round(
    (c.weekly_base - c.missed_deduction
     + c.kpi_bonus + c.overtime_pay + c.sunday_pay
     + c.vacation_pay + c.holiday_pay + r.extra_bonus)::numeric,
    2
  );
  RETURN c;

END;
$$;

-- ============================================================================
-- pay_calc_record(p_record_id uuid)
--
-- Callable RPC.  Recalculates a single payroll_records row and writes the
-- 8 calc columns back in the same transaction.  Raises loudly on PAID rows
-- (unlike the trigger, which silently returns OLD).
--
-- SECURITY DEFINER so the RPC can read employees regardless of the caller's
-- RLS context (caller only needs SELECT on payroll_records via their own policy).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pay_calc_record(p_record_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r        public.payroll_records;
  e        public.employees;
  c        public.pay_components;
  old_calc jsonb;
  new_calc jsonb;
BEGIN

  SELECT * INTO r FROM public.payroll_records WHERE id = p_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll record % not found.', p_record_id
      USING ERRCODE = 'P0002';
  END IF;

  -- PAID rows are immutable from the RPC. Caller must unlock first.
  IF r.status = 'PAID' THEN
    RAISE EXCEPTION
      'Cannot recalculate PAID record %. Unlock the pay period first.',
      p_record_id
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO e FROM public.employees WHERE id = r.employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee % not found for payroll record %.',
      r.employee_id, p_record_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Snapshot before-state for audit log
  old_calc := jsonb_build_object(
    'weekly_base',      r.weekly_base,
    'kpi_bonus',        r.kpi_bonus,
    'missed_deduction', r.missed_deduction,
    'overtime_pay',     r.overtime_pay,
    'sunday_pay',       r.sunday_pay,
    'vacation_pay',     r.vacation_pay,
    'holiday_pay',      r.holiday_pay,
    'total_pay',        r.total_pay
  );

  c := public._calc_pay_components(e, r);

  -- Write calc columns only — this UPDATE will fire the recalc trigger,
  -- but the trigger's input-change guard will detect no INPUT column changed
  -- and return NEW immediately, preventing an infinite loop.
  UPDATE public.payroll_records SET
    weekly_base      = c.weekly_base,
    kpi_bonus        = c.kpi_bonus,
    missed_deduction = c.missed_deduction,
    overtime_pay     = c.overtime_pay,
    sunday_pay       = c.sunday_pay,
    vacation_pay     = c.vacation_pay,
    holiday_pay      = c.holiday_pay,
    total_pay        = c.total_pay
  WHERE id = p_record_id;

  new_calc := jsonb_build_object(
    'weekly_base',      c.weekly_base,
    'kpi_bonus',        c.kpi_bonus,
    'missed_deduction', c.missed_deduction,
    'overtime_pay',     c.overtime_pay,
    'sunday_pay',       c.sunday_pay,
    'vacation_pay',     c.vacation_pay,
    'holiday_pay',      c.holiday_pay,
    'total_pay',        c.total_pay
  );

  INSERT INTO public.payroll_audit_log
    (record_id, action, before, after, actor, organization_id)
  VALUES
    (p_record_id, 'RECALC', old_calc, new_calc, auth.uid(), r.organization_id);

END;
$$;

-- ============================================================================
-- payroll_records_recalc_trigger_fn()
--
-- BEFORE INSERT OR UPDATE trigger function.
-- Fires automatically whenever an input column changes, so calc columns
-- are always in sync with inputs in the same transaction.
--
-- Key design decisions:
--   1. Input-column guard: returns NEW immediately if no INPUT column changed.
--      This prevents an infinite loop when pay_calc_record (or anything else)
--      updates ONLY the calc columns.
--   2. PAID guard: on UPDATE to a PAID row, returns OLD silently (no exception).
--      The separate trg_payroll_records_paid_lock trigger already blocks edits
--      to PAID rows by raising; the recalc trigger returning OLD is a safety
--      net in case the lock is bypassed (e.g., SECURITY DEFINER context).
--   3. INSERT + PAID: a row shouldn't be inserted directly in PAID status, but
--      if it is, skip recalc (don't overwrite the values being inserted).
--   4. Trigger naming: sorts alphabetically after trg_payroll_records_paid_lock
--      and before trg_payroll_records_updated_at, so lock → recalc → stamp.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.payroll_records_recalc_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  e        public.employees;
  c        public.pay_components;
  old_calc jsonb;
BEGIN

  -- ── Guard 1 (UPDATE only): skip if no input column actually changed.
  -- This is what prevents pay_calc_record's UPDATE (which only touches calc
  -- columns) from re-triggering an infinite recalculation loop.
  IF TG_OP = 'UPDATE' THEN
    IF (
      OLD.include_in_payroll   IS NOT DISTINCT FROM NEW.include_in_payroll  AND
      OLD.missed_days          IS NOT DISTINCT FROM NEW.missed_days         AND
      OLD.overtime_days        IS NOT DISTINCT FROM NEW.overtime_days       AND
      OLD.sundays_worked       IS NOT DISTINCT FROM NEW.sundays_worked      AND
      OLD.vacation_days        IS NOT DISTINCT FROM NEW.vacation_days       AND
      OLD.holiday_days         IS NOT DISTINCT FROM NEW.holiday_days        AND
      OLD.kpi_achieved         IS NOT DISTINCT FROM NEW.kpi_achieved        AND
      OLD.extra_bonus          IS NOT DISTINCT FROM NEW.extra_bonus         AND
      OLD.partial_week_days    IS NOT DISTINCT FROM NEW.partial_week_days
    ) THEN
      RETURN NEW;
    END IF;

    -- ── Guard 2 (UPDATE only): PAID rows are immutable — silent no-op.
    -- The paid_lock trigger already handles the loud rejection for regular UPDATEs.
    IF OLD.status = 'PAID' THEN
      RETURN OLD;
    END IF;
  END IF;

  -- ── Guard 3 (INSERT only): don't recalc if inserted already as PAID.
  IF TG_OP = 'INSERT' AND NEW.status = 'PAID' THEN
    RETURN NEW;
  END IF;

  -- ── Fetch employee rates
  SELECT * INTO e FROM public.employees WHERE id = NEW.employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee % not found for payroll record.',
      NEW.employee_id
      USING ERRCODE = 'P0002';
  END IF;

  -- ── Snapshot before-state for audit log
  IF TG_OP = 'UPDATE' THEN
    old_calc := jsonb_build_object(
      'weekly_base',      OLD.weekly_base,
      'kpi_bonus',        OLD.kpi_bonus,
      'missed_deduction', OLD.missed_deduction,
      'overtime_pay',     OLD.overtime_pay,
      'sunday_pay',       OLD.sunday_pay,
      'vacation_pay',     OLD.vacation_pay,
      'holiday_pay',      OLD.holiday_pay,
      'total_pay',        OLD.total_pay
    );
  ELSE
    old_calc := '{}'::jsonb;
  END IF;

  -- ── Run calc
  c := public._calc_pay_components(e, NEW);

  -- ── Write calc results into NEW (BEFORE trigger mutates the row in-place)
  NEW.weekly_base      := c.weekly_base;
  NEW.kpi_bonus        := c.kpi_bonus;
  NEW.missed_deduction := c.missed_deduction;
  NEW.overtime_pay     := c.overtime_pay;
  NEW.sunday_pay       := c.sunday_pay;
  NEW.vacation_pay     := c.vacation_pay;
  NEW.holiday_pay      := c.holiday_pay;
  NEW.total_pay        := c.total_pay;

  -- ── Audit log
  INSERT INTO public.payroll_audit_log
    (record_id, action, before, after, actor, organization_id)
  VALUES (
    NEW.id,
    'RECALC',
    old_calc,
    jsonb_build_object(
      'weekly_base',      NEW.weekly_base,
      'kpi_bonus',        NEW.kpi_bonus,
      'missed_deduction', NEW.missed_deduction,
      'overtime_pay',     NEW.overtime_pay,
      'sunday_pay',       NEW.sunday_pay,
      'vacation_pay',     NEW.vacation_pay,
      'holiday_pay',      NEW.holiday_pay,
      'total_pay',        NEW.total_pay
    ),
    auth.uid(),
    NEW.organization_id
  );

  RETURN NEW;
END;
$$;

-- ── Wire up the trigger
-- Naming: 'trg_payroll_records_recalc' sorts after 'trg_payroll_records_paid_lock'
-- and before 'trg_payroll_records_updated_at' alphabetically, so PostgreSQL fires
-- them in the correct order: lock → recalc → stamp.
DROP TRIGGER IF EXISTS trg_payroll_records_recalc ON public.payroll_records;

CREATE TRIGGER trg_payroll_records_recalc
  BEFORE INSERT OR UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.payroll_records_recalc_trigger_fn();
