-- Phase: campaign-history Phase 3 — payroll function update (step 2 of 2)
-- _derive_inputs_for_employee_week now looks up client_holidays via the
-- agent's campaign assignment that was effective on each candidate day,
-- not their current employees.campaign_id. Handles mid-week campaign
-- moves correctly so past payroll runs use the right client's holidays.
--
-- Applied 2026-05-25 via Supabase MCP apply_migration. Replaces the
-- version in 20260525120001.

CREATE OR REPLACE FUNCTION public._derive_inputs_for_employee_week(
  p_employee_id  uuid,
  p_week_start   date,
  p_week_end     date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_emp           employees%ROWTYPE;
  v_dow           int[];
  v_eff_start     date;
  v_eff_end       date;
  v_sched_days    int     := 0;
  v_missed_days   int     := 0;
  v_overtime_days int     := 0;
  v_sundays       int     := 0;
  v_holidays      int     := 0;
  v_partial       int;
  v_notes         text[]  := '{}';
  v_d             date;
BEGIN
  SELECT * INTO v_emp FROM employees WHERE id = p_employee_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'EMPLOYEE_NOT_FOUND');
  END IF;

  v_dow := _scheduled_days_for_shift(v_emp.shift_type);
  IF array_length(v_dow, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'NO_SHIFT_TYPE', 'shift_type', v_emp.shift_type,
      'scheduled_days', 0, 'missed_days', 0, 'overtime_days', 0,
      'sundays_worked', 0, 'holiday_days', 0, 'partial_week_days', NULL,
      'kpi_achieved', NULL, 'notes', '["no_shift_type"]'::jsonb
    );
  END IF;

  v_eff_start := GREATEST(p_week_start, COALESCE(v_emp.hire_date, p_week_start));
  v_eff_end   := LEAST  (p_week_end,   COALESCE(v_emp.last_worked_day, p_week_end));

  v_d := v_eff_start;
  WHILE v_d <= v_eff_end LOOP
    IF extract(dow from v_d)::int = ANY(v_dow) THEN
      v_sched_days := v_sched_days + 1;
    END IF;
    v_d := v_d + 1;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM time_clock
    WHERE employee_id = p_employee_id
      AND date BETWEEN p_week_start AND p_week_end
      AND clock_in IS NOT NULL
  ) THEN
    RETURN jsonb_build_object(
      'status', 'NO_DATA', 'scheduled_days', v_sched_days,
      'missed_days', 0, 'overtime_days', 0, 'sundays_worked', 0,
      'holiday_days', 0, 'partial_week_days', NULL,
      'kpi_achieved', NULL, 'notes', '["no_clock_data"]'::jsonb
    );
  END IF;

  -- ── Missed days ─────────────────────────────────────────────────────────
  -- Excludes:
  --   1. days the agent actually punched
  --   2. LFT statutory holidays (everyone)
  --   3. Client holidays for the campaign the agent was assigned to ON THAT
  --      DAY (historical lookup via employee_campaign_assignments). Handles
  --      mid-week campaign moves so the right client's holidays apply.
  SELECT COUNT(*) INTO v_missed_days
  FROM (
    SELECT generate_series(v_eff_start, p_week_end, '1 day'::interval)::date AS d
  ) g
  WHERE extract(dow from g.d)::int = ANY(v_dow)
    AND g.d NOT IN (
      SELECT date FROM time_clock
      WHERE employee_id = p_employee_id
        AND date BETWEEN p_week_start AND p_week_end
        AND clock_in IS NOT NULL
    )
    AND g.d NOT IN (SELECT date FROM mexican_holidays)
    AND NOT EXISTS (
      SELECT 1
      FROM employee_campaign_assignments eca
      JOIN campaigns c       ON c.id = eca.campaign_id
      JOIN client_holidays ch ON ch.client_id = c.client_id AND ch.date = g.d
      WHERE eca.employee_id = p_employee_id
        AND eca.start_date <= g.d
        AND (eca.end_date IS NULL OR eca.end_date >= g.d)
    );

  SELECT COUNT(*) INTO v_overtime_days
  FROM time_clock
  WHERE employee_id = p_employee_id
    AND date BETWEEN p_week_start AND p_week_end
    AND clock_in  IS NOT NULL
    AND clock_out IS NOT NULL
    AND (
      extract(epoch FROM (
        (clock_out - clock_in)
        - COALESCE(lunch_end   - lunch_start,  '0 seconds'::interval)
        - COALESCE(break1_end  - break1_start, '0 seconds'::interval)
        - COALESCE(break2_end  - break2_start, '0 seconds'::interval)
      )) / 3600.0
    ) > 9;

  SELECT COUNT(*) INTO v_sundays
  FROM time_clock
  WHERE employee_id = p_employee_id
    AND date BETWEEN p_week_start AND p_week_end
    AND clock_in IS NOT NULL
    AND extract(dow from date) = 0;

  SELECT COUNT(*) INTO v_holidays
  FROM time_clock tc
  JOIN mexican_holidays mh
    ON mh.date = tc.date AND mh.pays_premium = true
  WHERE tc.employee_id = p_employee_id
    AND tc.date BETWEEN p_week_start AND p_week_end
    AND tc.clock_in IS NOT NULL;

  v_partial := NULL;
  IF v_emp.hire_date IS NOT NULL
     AND v_emp.hire_date > p_week_start
     AND v_emp.hire_date <= p_week_end
  THEN
    v_partial := 0;
    v_d := v_emp.hire_date;
    WHILE v_d <= p_week_end LOOP
      IF extract(dow from v_d)::int = ANY(v_dow) THEN
        v_partial := v_partial + 1;
      END IF;
      v_d := v_d + 1;
    END LOOP;
    v_notes := v_notes || ARRAY['mid_week_hire'];
  END IF;

  IF v_emp.last_worked_day IS NOT NULL
     AND v_emp.last_worked_day >= p_week_start
     AND v_emp.last_worked_day <  p_week_end
  THEN
    v_notes := v_notes || ARRAY['mid_week_termination'];
  END IF;

  RETURN jsonb_build_object(
    'status',            'DERIVED',
    'scheduled_days',    v_sched_days,
    'missed_days',       v_missed_days,
    'overtime_days',     v_overtime_days,
    'sundays_worked',    v_sundays,
    'holiday_days',      v_holidays,
    'partial_week_days', v_partial,
    'kpi_achieved',      NULL,
    'notes',             to_jsonb(v_notes)
  );
END;
$$;
