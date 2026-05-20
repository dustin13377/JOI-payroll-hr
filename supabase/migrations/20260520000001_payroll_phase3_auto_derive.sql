-- =============================================================================
-- Payroll Phase 3 — Auto-Derive inputs from time_clock + eod_logs
-- Applied: 2026-05-20
--
-- Decisions locked (2026-05-20):
--   D1. OT threshold: 9 net hours (clock_out − clock_in − lunch − breaks)
--   D2. Zero clock rows → status='NO_DATA', missed_days=0 in column
--         (auto_derived snapshot carries status flag; owner reviews)
--   D3. NULL shift_type → status='NO_SHIFT_TYPE', same treatment as NO_DATA
--   D4. TL-submitted punches (edit-time-clock edge fn) = identical to self-submitted
--   D5. Mid-week hire → partial_week_days = scheduled days from hire_date to week_end
--   D6. Mid-week termination → missed_days for days after last_worked_day
--         (partial_week_days stays NULL; uses normal-week-with-missed-days branch)
--
-- Functions created:
--   _scheduled_days_for_shift(text) → int[]
--   _derive_inputs_for_employee_week(uuid, date, date) → jsonb
--   pay_derive_week(uuid) → jsonb
--   pay_redrive_week(uuid, boolean) → jsonb
--
-- Snapshot design note:
--   auto_derived always stores the values WRITTEN to the columns (never nulls for
--   int NOT NULL fields). This ensures the redrive "was it manually changed?"
--   comparison (column_value != snapshot_value) is unambiguous.
--   The 'status' key in auto_derived carries data-quality flags for the Phase 4 UI.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. _scheduled_days_for_shift
--    Returns the Postgres DOW integers for a given shift_type.
--    Postgres extract(dow): 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
--    Returns empty array for NULL / unknown → caller decides what to do.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._scheduled_days_for_shift(p_shift_type text)
RETURNS int[]
LANGUAGE sql
IMMUTABLE STRICT
SET search_path = public
AS $$
  SELECT CASE p_shift_type
    WHEN 'L-J' THEN ARRAY[1,2,3,4]      -- Mon Tue Wed Thu
    WHEN 'L-V' THEN ARRAY[1,2,3,4,5]    -- Mon Tue Wed Thu Fri
    WHEN 'V-D' THEN ARRAY[5,6,0]         -- Fri Sat Sun
    WHEN 'V-L' THEN ARRAY[5,6,0,1]       -- Fri Sat Sun Mon
    ELSE ARRAY[]::int[]
  END;
$$;


-- ---------------------------------------------------------------------------
-- 2. _derive_inputs_for_employee_week
--    Pure function — reads time_clock and mexican_holidays, writes nothing.
--    Called by pay_derive_week (for insert) and pay_redrive_week (for diff).
--    Can also be called directly from the Phase 4 UI for a preview.
--
--    Return shape:
--    {
--      status:            'DERIVED' | 'NO_DATA' | 'NO_SHIFT_TYPE' | 'EMPLOYEE_NOT_FOUND',
--      scheduled_days:    int,
--      missed_days:       int,          ← always int (never null) — see snapshot note above
--      overtime_days:     int,
--      sundays_worked:    int,
--      holiday_days:      int,
--      partial_week_days: int | null,   ← null = full week; int = mid-hire-start week
--      kpi_achieved:      null,         ← v1: manual review
--      notes:             string[]      ← e.g. ['mid_week_hire','mid_week_termination']
--    }
-- ---------------------------------------------------------------------------
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
  v_partial       int;            -- NULL = full week
  v_notes         text[]  := '{}';
  v_d             date;
BEGIN
  -- Fetch employee
  SELECT * INTO v_emp FROM employees WHERE id = p_employee_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'EMPLOYEE_NOT_FOUND');
  END IF;

  -- Guard: NULL or unknown shift_type → can't compute scheduled days
  v_dow := _scheduled_days_for_shift(v_emp.shift_type);
  IF array_length(v_dow, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'status',            'NO_SHIFT_TYPE',
      'shift_type',        v_emp.shift_type,
      'scheduled_days',    0,
      'missed_days',       0,
      'overtime_days',     0,
      'sundays_worked',    0,
      'holiday_days',      0,
      'partial_week_days', NULL,
      'kpi_achieved',      NULL,
      'notes',             '["no_shift_type"]'::jsonb
    );
  END IF;

  -- Effective date range, capped by hire_date and last_worked_day
  v_eff_start := GREATEST(p_week_start, COALESCE(v_emp.hire_date, p_week_start));
  v_eff_end   := LEAST  (p_week_end,   COALESCE(v_emp.last_worked_day, p_week_end));

  -- Count scheduled days within effective range
  v_d := v_eff_start;
  WHILE v_d <= v_eff_end LOOP
    IF extract(dow from v_d)::int = ANY(v_dow) THEN
      v_sched_days := v_sched_days + 1;
    END IF;
    v_d := v_d + 1;
  END LOOP;

  -- Zero clock-in rows for this week → NO_DATA flag
  IF NOT EXISTS (
    SELECT 1 FROM time_clock
    WHERE employee_id = p_employee_id
      AND date BETWEEN p_week_start AND p_week_end
      AND clock_in IS NOT NULL
  ) THEN
    RETURN jsonb_build_object(
      'status',            'NO_DATA',
      'scheduled_days',    v_sched_days,
      'missed_days',       0,      -- column default; auto_derived.status flags review needed
      'overtime_days',     0,
      'sundays_worked',    0,
      'holiday_days',      0,
      'partial_week_days', NULL,
      'kpi_achieved',      NULL,
      'notes',             '["no_clock_data"]'::jsonb
    );
  END IF;

  -- ── Missed days ─────────────────────────────────────────────────────────
  -- Scheduled days from eff_start→week_end that have no clock_in.
  -- NOTE: upper bound is p_week_end (not v_eff_end) so that scheduled days
  -- AFTER last_worked_day count as missed (Decision D6).
  -- Lower bound stays v_eff_start so days before hire_date are excluded (D5).
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
    );

  -- ── Overtime days ────────────────────────────────────────────────────────
  -- Net worked time = clock_out − clock_in − lunch − breaks.
  -- Decision D1: threshold is 9 hours net.
  -- COALESCE handles NULL lunch/break endpoints (e.g. skipped lunch → 0 deducted).
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

  -- ── Sundays worked ───────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_sundays
  FROM time_clock
  WHERE employee_id = p_employee_id
    AND date BETWEEN p_week_start AND p_week_end
    AND clock_in IS NOT NULL
    AND extract(dow from date) = 0;   -- Postgres DOW 0 = Sunday

  -- ── Holiday days (pays_premium = true only) ──────────────────────────────
  SELECT COUNT(*) INTO v_holidays
  FROM time_clock tc
  JOIN mexican_holidays mh
    ON mh.date = tc.date AND mh.pays_premium = true
  WHERE tc.employee_id = p_employee_id
    AND tc.date BETWEEN p_week_start AND p_week_end
    AND tc.clock_in IS NOT NULL;

  -- ── Partial week: mid-hire-start (Decision D5) ───────────────────────────
  -- hire_date strictly INSIDE the week (not on week_start = full week)
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

  -- ── Mid-week termination note (Decision D6) ──────────────────────────────
  -- missed_days already counts days after last_worked_day (p_week_end bound above).
  -- partial_week_days stays NULL (terminations use missed_days, not partial_week_days).
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
    'kpi_achieved',      NULL,   -- v1: manual; Phase 4 will derive from eod_logs
    'notes',             to_jsonb(v_notes)
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. pay_derive_week
--    For a given payroll_weeks row: loop over active employees, skip any that
--    already have a payroll_records row for this week, insert the rest.
--    The BEFORE INSERT trigger trg_payroll_records_recalc fires automatically
--    and computes all calc columns (weekly_base, kpi_bonus, total_pay, etc.).
--
--    Returns a summary jsonb:
--    { inserted, skipped_existing, no_data_flags, no_shift_type, mid_week_hires }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_derive_week(p_week_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week      payroll_weeks%ROWTYPE;
  v_org_id    uuid;
  v_emp       employees%ROWTYPE;
  v_raw       jsonb;
  v_snapshot  jsonb;
  -- final column values (null→0 for NOT NULL int cols)
  v_missed    int;
  v_overtime  int;
  v_sundays   int;
  v_holidays  int;
  v_partial   int;
  -- counters
  v_inserted  int := 0;
  v_skipped   int := 0;
  v_no_data   int := 0;
  v_no_shift  int := 0;
  v_mid_hire  int := 0;
BEGIN
  -- Auth: owner or manager only
  IF NOT is_leadership() THEN
    RAISE EXCEPTION 'pay_derive_week: requires owner or manager role'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_week FROM payroll_weeks WHERE id = p_week_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pay_derive_week: payroll week % not found', p_week_id;
  END IF;

  -- Resolve org from the parent period
  SELECT pp.organization_id INTO v_org_id
  FROM payroll_periods pp WHERE pp.id = v_week.period_id;

  -- Loop over active, non-system employees in this org
  -- whose tenure overlaps the week
  FOR v_emp IN
    SELECT e.*
    FROM employees e
    WHERE e.is_active       = true
      AND e.is_system_user  = false
      AND e.organization_id = v_org_id
      AND COALESCE(e.last_worked_day, '9999-12-31'::date) >= v_week.week_start
      AND COALESCE(e.hire_date,       '1900-01-01'::date) <= v_week.week_end
  LOOP
    -- Hard rule: never overwrite an existing row (protects manual edits)
    IF EXISTS (
      SELECT 1 FROM payroll_records
      WHERE week_id = p_week_id AND employee_id = v_emp.id
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Derive inputs
    v_raw := _derive_inputs_for_employee_week(
      v_emp.id, v_week.week_start, v_week.week_end
    );

    -- Extract column values — replace nulls with 0 for NOT NULL int columns.
    -- For NO_DATA / NO_SHIFT_TYPE, columns get 0; auto_derived.status is the review flag.
    v_missed   := COALESCE((v_raw->>'missed_days')::int,    0);
    v_overtime := COALESCE((v_raw->>'overtime_days')::int,  0);
    v_sundays  := COALESCE((v_raw->>'sundays_worked')::int, 0);
    v_holidays := COALESCE((v_raw->>'holiday_days')::int,   0);
    v_partial  := (v_raw->>'partial_week_days')::int;  -- NULL stays NULL (nullable col)

    -- Snapshot stores the ACTUAL column values written, so redrive comparisons
    -- "column_value != snapshot_value → manually changed" are unambiguous.
    v_snapshot := jsonb_build_object(
      'status',            v_raw->>'status',
      'scheduled_days',    v_raw->'scheduled_days',
      'missed_days',       v_missed,
      'overtime_days',     v_overtime,
      'sundays_worked',    v_sundays,
      'holiday_days',      v_holidays,
      'partial_week_days', v_partial,
      'kpi_achieved',      NULL,
      'notes',             v_raw->'notes'
    );

    -- Track flag counters
    CASE v_raw->>'status'
      WHEN 'NO_DATA'       THEN v_no_data  := v_no_data  + 1;
      WHEN 'NO_SHIFT_TYPE' THEN v_no_shift := v_no_shift + 1;
      ELSE NULL;
    END CASE;
    IF v_raw->'notes' @> '["mid_week_hire"]'::jsonb THEN
      v_mid_hire := v_mid_hire + 1;
    END IF;

    -- Insert — trg_payroll_records_recalc fires BEFORE INSERT and auto-populates
    -- weekly_base, kpi_bonus, missed_deduction, overtime_pay, sunday_pay,
    -- vacation_pay, holiday_pay, total_pay via _calc_pay_components().
    INSERT INTO payroll_records (
      week_id, employee_id, campaign_id, organization_id,
      missed_days, overtime_days, sundays_worked, holiday_days,
      kpi_achieved, partial_week_days,
      auto_derived, status
    ) VALUES (
      p_week_id,
      v_emp.id,
      v_emp.campaign_id,
      v_org_id,
      v_missed,
      v_overtime,
      v_sundays,
      v_holidays,
      true,        -- kpi_achieved: default true; owner reviews NO_DATA rows
      v_partial,
      v_snapshot,
      'UNPAID'
    );

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted',          v_inserted,
    'skipped_existing',  v_skipped,
    'no_data_flags',     v_no_data,
    'no_shift_type',     v_no_shift,
    'mid_week_hires',    v_mid_hire
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 4. pay_redrive_week
--    Re-derive a week, respecting manual overrides.
--
--    p_confirm = false → returns a DIFF only, no writes (safe preview)
--    p_confirm = true  → applies changes, preserves any manually-overridden fields
--
--    Manual override detection:
--      column_value IS NOT DISTINCT FROM snapshot_value → NOT overridden → update
--      column_value IS DISTINCT FROM snapshot_value     → overridden → preserve
--
--    PAID rows are always skipped (never modified).
--
--    Returns:
--    {
--      confirmed, updated, would_update, skipped_paid, preserved_overrides,
--      diff: [{ employee_id, record_id, status, changes:{}, preserved:{} }]
--    }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_redrive_week(
  p_week_id  uuid,
  p_confirm  boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week         payroll_weeks%ROWTYPE;
  v_rec          payroll_records%ROWTYPE;
  v_raw          jsonb;
  v_snap         jsonb;
  v_diff_rows    jsonb[] := '{}';
  -- fresh column values
  v_f_missed     int;
  v_f_overtime   int;
  v_f_sundays    int;
  v_f_holidays   int;
  v_f_partial    int;
  -- final values (fresh or manually-overridden)
  v_n_missed     int;
  v_n_overtime   int;
  v_n_sundays    int;
  v_n_holidays   int;
  v_n_partial    int;
  -- per-record diff tracking
  v_changes      jsonb;
  v_preserved    jsonb;
  -- counters
  v_updated      int := 0;
  v_skip_paid    int := 0;
  v_pres_ct      int := 0;
BEGIN
  IF NOT is_leadership() THEN
    RAISE EXCEPTION 'pay_redrive_week: requires owner or manager role'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_week FROM payroll_weeks WHERE id = p_week_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pay_redrive_week: payroll week % not found', p_week_id;
  END IF;

  FOR v_rec IN
    SELECT * FROM payroll_records WHERE week_id = p_week_id
  LOOP
    -- Hard rule: PAID rows are immutable
    IF v_rec.status = 'PAID' THEN
      v_skip_paid := v_skip_paid + 1;
      CONTINUE;
    END IF;

    -- Get fresh derived values and existing snapshot
    v_raw  := _derive_inputs_for_employee_week(
                v_rec.employee_id, v_week.week_start, v_week.week_end);
    v_snap := COALESCE(v_rec.auto_derived, '{}'::jsonb);

    -- Fresh column values (null → 0 for NOT NULL cols)
    v_f_missed   := COALESCE((v_raw->>'missed_days')::int,    0);
    v_f_overtime := COALESCE((v_raw->>'overtime_days')::int,  0);
    v_f_sundays  := COALESCE((v_raw->>'sundays_worked')::int, 0);
    v_f_holidays := COALESCE((v_raw->>'holiday_days')::int,   0);
    v_f_partial  := (v_raw->>'partial_week_days')::int;

    v_changes   := '{}'::jsonb;
    v_preserved := '{}'::jsonb;

    -- ── missed_days ──────────────────────────────────────────────────────
    IF v_rec.missed_days IS NOT DISTINCT FROM (v_snap->>'missed_days')::int THEN
      v_n_missed := v_f_missed;
      IF v_rec.missed_days IS DISTINCT FROM v_f_missed THEN
        v_changes := v_changes || jsonb_build_object('missed_days',
          jsonb_build_object('from', v_rec.missed_days, 'to', v_f_missed));
      END IF;
    ELSE
      v_n_missed  := v_rec.missed_days;   -- preserve manual value
      v_preserved := v_preserved || jsonb_build_object('missed_days',
        jsonb_build_object(
          'manual',         v_rec.missed_days,
          'snapshot_was',   (v_snap->>'missed_days')::int,
          'fresh_would_be', v_f_missed));
      v_pres_ct := v_pres_ct + 1;
    END IF;

    -- ── overtime_days ────────────────────────────────────────────────────
    IF v_rec.overtime_days IS NOT DISTINCT FROM (v_snap->>'overtime_days')::int THEN
      v_n_overtime := v_f_overtime;
      IF v_rec.overtime_days IS DISTINCT FROM v_f_overtime THEN
        v_changes := v_changes || jsonb_build_object('overtime_days',
          jsonb_build_object('from', v_rec.overtime_days, 'to', v_f_overtime));
      END IF;
    ELSE
      v_n_overtime := v_rec.overtime_days;
      v_preserved  := v_preserved || jsonb_build_object('overtime_days',
        jsonb_build_object(
          'manual',         v_rec.overtime_days,
          'snapshot_was',   (v_snap->>'overtime_days')::int,
          'fresh_would_be', v_f_overtime));
      v_pres_ct := v_pres_ct + 1;
    END IF;

    -- ── sundays_worked ───────────────────────────────────────────────────
    IF v_rec.sundays_worked IS NOT DISTINCT FROM (v_snap->>'sundays_worked')::int THEN
      v_n_sundays := v_f_sundays;
      IF v_rec.sundays_worked IS DISTINCT FROM v_f_sundays THEN
        v_changes := v_changes || jsonb_build_object('sundays_worked',
          jsonb_build_object('from', v_rec.sundays_worked, 'to', v_f_sundays));
      END IF;
    ELSE
      v_n_sundays := v_rec.sundays_worked;
      v_preserved := v_preserved || jsonb_build_object('sundays_worked',
        jsonb_build_object(
          'manual',         v_rec.sundays_worked,
          'snapshot_was',   (v_snap->>'sundays_worked')::int,
          'fresh_would_be', v_f_sundays));
      v_pres_ct := v_pres_ct + 1;
    END IF;

    -- ── holiday_days ─────────────────────────────────────────────────────
    IF v_rec.holiday_days IS NOT DISTINCT FROM (v_snap->>'holiday_days')::int THEN
      v_n_holidays := v_f_holidays;
      IF v_rec.holiday_days IS DISTINCT FROM v_f_holidays THEN
        v_changes := v_changes || jsonb_build_object('holiday_days',
          jsonb_build_object('from', v_rec.holiday_days, 'to', v_f_holidays));
      END IF;
    ELSE
      v_n_holidays := v_rec.holiday_days;
      v_preserved  := v_preserved || jsonb_build_object('holiday_days',
        jsonb_build_object(
          'manual',         v_rec.holiday_days,
          'snapshot_was',   (v_snap->>'holiday_days')::int,
          'fresh_would_be', v_f_holidays));
      v_pres_ct := v_pres_ct + 1;
    END IF;

    -- ── partial_week_days (nullable) ─────────────────────────────────────
    IF v_rec.partial_week_days IS NOT DISTINCT FROM (v_snap->>'partial_week_days')::int THEN
      v_n_partial := v_f_partial;
      IF v_rec.partial_week_days IS DISTINCT FROM v_f_partial THEN
        v_changes := v_changes || jsonb_build_object('partial_week_days',
          jsonb_build_object('from', v_rec.partial_week_days, 'to', v_f_partial));
      END IF;
    ELSE
      v_n_partial := v_rec.partial_week_days;
      v_preserved := v_preserved || jsonb_build_object('partial_week_days',
        jsonb_build_object(
          'manual',         v_rec.partial_week_days,
          'snapshot_was',   (v_snap->>'partial_week_days')::int,
          'fresh_would_be', v_f_partial));
      v_pres_ct := v_pres_ct + 1;
    END IF;

    -- Accumulate diff entry for this record
    v_diff_rows := array_append(v_diff_rows, jsonb_build_object(
      'employee_id',  v_rec.employee_id,
      'record_id',    v_rec.id,
      'derive_status', v_raw->>'status',
      'changes',      v_changes,
      'preserved',    v_preserved
    ));

    -- Apply if confirmed
    -- trg_payroll_records_recalc fires on UPDATE and recomputes calc columns.
    IF p_confirm THEN
      UPDATE payroll_records SET
        missed_days       = v_n_missed,
        overtime_days     = v_n_overtime,
        sundays_worked    = v_n_sundays,
        holiday_days      = v_n_holidays,
        partial_week_days = v_n_partial,
        -- Snapshot updated to reflect new column values
        auto_derived = jsonb_build_object(
          'status',            v_raw->>'status',
          'scheduled_days',    v_raw->'scheduled_days',
          'missed_days',       v_n_missed,
          'overtime_days',     v_n_overtime,
          'sundays_worked',    v_n_sundays,
          'holiday_days',      v_n_holidays,
          'partial_week_days', v_n_partial,
          'kpi_achieved',      NULL,
          'notes',             v_raw->'notes'
        )
      WHERE id = v_rec.id;
      v_updated := v_updated + 1;
    END IF;

  END LOOP;

  RETURN jsonb_build_object(
    'confirmed',           p_confirm,
    'updated',             CASE WHEN     p_confirm THEN v_updated                          ELSE 0    END,
    'would_update',        CASE WHEN NOT p_confirm THEN array_length(v_diff_rows, 1)::int  ELSE NULL END,
    'skipped_paid',        v_skip_paid,
    'preserved_overrides', v_pres_ct,
    'diff',                to_jsonb(v_diff_rows)
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 5. Permissions
--    SECURITY DEFINER functions run as postgres (owner); is_leadership() inside
--    enforces owner/manager restriction.
--
--    _scheduled_days_for_shift        → authenticated (no sensitive data, just DOW map)
--    _derive_inputs_for_employee_week → NOT granted to authenticated directly.
--      Any authenticated user could call it with an arbitrary employee UUID and
--      read derived payroll data. SECURITY DEFINER callers (pay_derive_week,
--      pay_redrive_week) already enforce leadership checks. Phase 4 preview must
--      go through a wrapper function with its own is_leadership() guard.
--    pay_derive_week / pay_redrive_week → authenticated (guarded internally by
--      is_leadership()).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._scheduled_days_for_shift(text)                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public._derive_inputs_for_employee_week(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_derive_week(uuid)                               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_redrive_week(uuid, boolean)                     FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public._scheduled_days_for_shift(text)    TO authenticated;
-- _derive_inputs_for_employee_week: no authenticated grant (see note above)
GRANT EXECUTE ON FUNCTION public.pay_derive_week(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_redrive_week(uuid, boolean)     TO authenticated;
