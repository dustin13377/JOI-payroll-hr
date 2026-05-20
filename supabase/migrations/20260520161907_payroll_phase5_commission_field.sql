-- =============================================================================
-- Payroll Phase 5 — Step 4: Commission field on payroll_records + anomaly flag
-- Reconstructed 2026-05-20 from DB introspection (applied without local file).
--
-- Adds commission (nullable input, defaults 0) and commission_flag (text,
-- auto-set by trigger) to payroll_records so Joe can enter per-agent commission
-- each week and get an automatic sanity check.
--
-- Also adds commission (nullable) to payroll_archive for future backfill.
--
-- check_commission_flag() compares a new commission entry against 12-week
-- history and flags: FIRST_ENTRY_HIGH, HIGH_VS_HISTORY, HIGH_VS_BASE,
-- LOW_VS_HISTORY. The trigger auto-populates commission_flag on every
-- INSERT/UPDATE.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. payroll_records — add commission + commission_flag columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS commission      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_flag text;

-- ---------------------------------------------------------------------------
-- 2. payroll_archive — add commission column (nullable; Joe backfills later)
-- ---------------------------------------------------------------------------
ALTER TABLE public.payroll_archive
  ADD COLUMN IF NOT EXISTS commission numeric;

-- ---------------------------------------------------------------------------
-- 3. check_commission_flag — anomaly detection helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_commission_flag(
  p_employee_id uuid,
  p_amount      numeric,
  p_exclude_id  uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_avg       numeric;
  v_stddev    numeric;
  v_count     int;
  v_weekly    numeric;
BEGIN
  -- Fetch employee weekly base for relative threshold
  SELECT weekly_base_salary INTO v_weekly
  FROM public.employees
  WHERE id = p_employee_id;

  -- Historical stats: last 12 completed weeks, same employee
  SELECT
    COUNT(*),
    AVG(commission),
    STDDEV(commission)
  INTO v_count, v_avg, v_stddev
  FROM public.payroll_records
  WHERE employee_id  = p_employee_id
    AND commission   IS NOT NULL
    AND status       != 'VOID'
    AND (p_exclude_id IS NULL OR id != p_exclude_id)
  ORDER BY created_at DESC
  LIMIT 12;

  -- No history yet — flag large first entries
  IF v_count = 0 OR v_avg IS NULL THEN
    IF p_amount > 0 AND v_weekly IS NOT NULL AND p_amount > v_weekly * 0.5 THEN
      RETURN format(
        'FIRST_ENTRY_HIGH: $%s commission with no prior history (>50%% of weekly base $%s)',
        p_amount, v_weekly
      );
    END IF;
    RETURN NULL;
  END IF;

  -- Normally earns commission but entered 0
  IF v_avg > 100 AND p_amount = 0 THEN
    RETURN format(
      'LOW_VS_HISTORY: employee normally earns commission (avg $%s over %s weeks) — entered $0',
      round(v_avg, 0), v_count
    );
  END IF;

  -- More than 3× historical average
  IF v_avg > 0 AND p_amount > v_avg * 3 THEN
    RETURN format(
      'HIGH_VS_HISTORY: $%s is %.1f× above %s-week average ($%s)',
      p_amount, round(p_amount / v_avg, 1), v_count, round(v_avg, 0)
    );
  END IF;

  -- Absolute ceiling: more than 2× weekly base salary
  IF v_weekly IS NOT NULL AND p_amount > v_weekly * 2 THEN
    RETURN format(
      'HIGH_VS_BASE: $%s commission exceeds 2× weekly base ($%s)',
      p_amount, v_weekly
    );
  END IF;

  -- Less than 30% of normal (catches accidentally-low entries)
  IF v_avg > 100 AND v_stddev IS NOT NULL
     AND p_amount > 0 AND p_amount < v_avg * 0.3 THEN
    RETURN format(
      'LOW_VS_HISTORY: $%s is unusually low vs %s-week average ($%s)',
      p_amount, v_count, round(v_avg, 0)
    );
  END IF;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Update the recalc trigger function to handle commission_flag
--    (replaces the Phase 2 version; adds commission_flag auto-set)
-- ---------------------------------------------------------------------------
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

  -- Guard 1 (UPDATE only): skip if no input column changed
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

    -- Guard 2: PAID rows are immutable — silent no-op
    IF OLD.status = 'PAID' THEN
      RETURN OLD;
    END IF;
  END IF;

  -- Guard 3 (INSERT only): skip if inserted as PAID
  IF TG_OP = 'INSERT' AND NEW.status = 'PAID' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO e FROM public.employees WHERE id = NEW.employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee % not found for payroll record.', NEW.employee_id
      USING ERRCODE = 'P0002';
  END IF;

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

  c := public._calc_pay_components(e, NEW);

  NEW.weekly_base      := c.weekly_base;
  NEW.kpi_bonus        := c.kpi_bonus;
  NEW.missed_deduction := c.missed_deduction;
  NEW.overtime_pay     := c.overtime_pay;
  NEW.sunday_pay       := c.sunday_pay;
  NEW.vacation_pay     := c.vacation_pay;
  NEW.holiday_pay      := c.holiday_pay;
  NEW.total_pay        := c.total_pay;

  -- Auto-set commission anomaly flag
  NEW.commission_flag := public.check_commission_flag(
    NEW.employee_id,
    COALESCE(NEW.commission, 0),
    NEW.id
  );

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
