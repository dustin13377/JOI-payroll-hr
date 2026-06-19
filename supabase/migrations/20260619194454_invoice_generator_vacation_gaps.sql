-- Drop existing function to allow return type change (adding is_gap_warning, gap_dates)
DROP FUNCTION IF EXISTS public.weekly_invoice_preview(date, date);

-- ============================================================
-- weekly_invoice_preview
--
-- Changes vs previous version:
--   1. Branch 1 now uses a LATERAL to compute days_worked once,
--      adding approved paid vacation days for bill_vacation clients
--      (no double-counting punched days).
--   2. New Branch 3: gap warnings — one row per (employee, client)
--      pair where the employee has punches in the week that fall
--      outside ALL their assignment windows for that client.
--      is_gap_warning=true, gap_dates = array of ISO date strings.
--   3. Return type gains two new columns: is_gap_warning boolean,
--      gap_dates text[].
-- ============================================================
CREATE OR REPLACE FUNCTION public.weekly_invoice_preview(p_monday date, p_sunday date)
RETURNS TABLE(
  client_id           uuid,
  client_prefix       text,
  client_name         text,
  employee_id         uuid,
  employee_code       text,
  employee_name       text,
  campaign_id         uuid,
  campaign_name       text,
  daily_bill_rate     numeric,
  days_worked         numeric,
  existing_invoice_id uuid,
  is_flat_bill        boolean,
  flat_amount         numeric,
  is_gap_warning      boolean,
  gap_dates           text[]
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY

  -- ── Branch 1: per-day billed employees ──────────────────────────────────
  SELECT
    cl.id,
    cl.prefix,
    cl.name,
    e.id,
    e.employee_id,
    e.full_name,
    c.id,
    c.name,
    e.daily_bill_rate,
    dw.days_worked_total,
    (SELECT i.id FROM invoices i
     WHERE i.client_id = cl.id
       AND i.week_start = p_monday
       AND i.week_end   = p_sunday
     LIMIT 1),
    false,
    0::numeric,
    false,
    NULL::text[]
  FROM employees e
  JOIN employee_campaign_assignments eca ON eca.employee_id = e.id
  JOIN campaigns c  ON c.id  = eca.campaign_id
  JOIN clients   cl ON cl.id = c.client_id
  CROSS JOIN LATERAL (
    SELECT (
      -- Clock punches within this assignment window
      COALESCE((
        SELECT count(DISTINCT tc.date)::numeric
        FROM time_clock tc
        WHERE tc.employee_id = e.id
          AND tc.date BETWEEN p_monday AND p_sunday
          AND tc.date >= eca.start_date
          AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)
      ), 0)
      +
      -- Approved paid vacation days (bill_vacation clients only),
      -- not already counted via a punch.
      CASE WHEN cl.bill_vacation THEN
        COALESCE((
          SELECT COUNT(DISTINCT vd.vdate)::numeric
          FROM (
            SELECT gs::date AS vdate
            FROM vacation_requests vr,
                 generate_series(vr.start_date, vr.end_date, '1 day'::interval) gs
            WHERE vr.employee_id = e.id
              AND vr.status      = 'approved'
              AND vr.is_paid     = true
              AND vr.start_date <= p_sunday
              AND vr.end_date   >= p_monday
          ) vd
          WHERE vd.vdate BETWEEN p_monday AND p_sunday
            AND vd.vdate >= eca.start_date
            AND vd.vdate <= COALESCE(eca.end_date, '9999-12-31'::date)
            AND NOT EXISTS (
              SELECT 1 FROM time_clock tc2
              WHERE tc2.employee_id = e.id AND tc2.date = vd.vdate
            )
        ), 0)
      ELSE 0
      END
    ) AS days_worked_total
  ) dw
  WHERE e.is_system_user = false
    AND cl.is_billable   = true
    AND eca.start_date  <= p_sunday
    AND (eca.end_date IS NULL OR eca.end_date >= p_monday)
    AND (
      (e.is_active = true
       AND (e.hire_date IS NULL OR e.hire_date <= p_sunday)
       AND (e.last_worked_day IS NULL OR e.last_worked_day >= p_monday))
      OR EXISTS (
        SELECT 1 FROM time_clock tc
        WHERE tc.employee_id = e.id
          AND tc.date BETWEEN p_monday AND p_sunday
          AND tc.date >= eca.start_date
          AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)
      )
    )

  UNION ALL

  -- ── Branch 2: flat-bill employees ───────────────────────────────────────
  SELECT
    cl.id, cl.prefix, cl.name,
    e.id, e.employee_id, e.full_name,
    NULL::uuid, '— flat bill —',
    0::numeric, 0::numeric,
    (SELECT i.id FROM invoices i
     WHERE i.client_id = cl.id
       AND i.week_start = p_monday
       AND i.week_end   = p_sunday
     LIMIT 1),
    true,
    e.flat_weekly_bill_amount,
    false,
    NULL::text[]
  FROM employees e
  JOIN clients cl ON cl.id = e.flat_bill_client_id
  WHERE e.is_active            = true
    AND e.is_system_user       = false
    AND cl.is_billable         = true
    AND e.flat_weekly_bill_amount > 0
    AND (e.hire_date IS NULL OR e.hire_date <= p_sunday)
    AND (e.last_worked_day IS NULL OR e.last_worked_day >= p_monday)

  UNION ALL

  -- ── Branch 3: gap warnings ──────────────────────────────────────────────
  -- One row per (employee, client) where the employee punched in during the
  -- week but those punches fall outside ALL their assignment windows for that
  -- client. days_worked = count of gap punches; gap_dates = sorted array of
  -- ISO date strings. These rows are NOT billed — they surface a data-quality
  -- issue so the operator can fix the assignment before generating.
  SELECT
    cl.id, cl.prefix, cl.name,
    e.id, e.employee_id, e.full_name,
    NULL::uuid,
    '— unmatched punches —',
    0::numeric,
    COUNT(DISTINCT tc.date)::numeric,
    (SELECT i.id FROM invoices i
     WHERE i.client_id = cl.id
       AND i.week_start = p_monday
       AND i.week_end   = p_sunday
     LIMIT 1),
    false,
    0::numeric,
    true,
    array_agg(DISTINCT tc.date::text ORDER BY tc.date::text)
  FROM time_clock tc
  JOIN employees e ON e.id = tc.employee_id
  -- Employee must be associated with this client via at least one assignment
  JOIN employee_campaign_assignments eca_any ON eca_any.employee_id = e.id
  JOIN campaigns  c_any ON c_any.id  = eca_any.campaign_id
  JOIN clients    cl    ON cl.id     = c_any.client_id
  WHERE tc.date BETWEEN p_monday AND p_sunday
    AND cl.is_billable   = true
    AND e.is_system_user = false
    -- This specific punch falls outside ALL assignment windows for this client
    AND NOT EXISTS (
      SELECT 1
      FROM employee_campaign_assignments eca_in
      JOIN campaigns c_in ON c_in.id = eca_in.campaign_id
      WHERE eca_in.employee_id = e.id
        AND c_in.client_id     = cl.id
        AND tc.date >= eca_in.start_date
        AND tc.date <= COALESCE(eca_in.end_date, '9999-12-31'::date)
    )
  GROUP BY cl.id, cl.prefix, cl.name, e.id, e.employee_id, e.full_name

  ORDER BY 3, 6;  -- client_name, employee_name
END;
$$;


-- ============================================================
-- generate_weekly_invoices
--
-- Changes vs previous version:
--   1. Outer FOR loop now selects cl.bill_vacation AS cbill_vac.
--   2. Per-day INSERT uses a CROSS JOIN LATERAL to compute
--      days_worked once: punches + vacation days (when cbill_vac).
--      This replaces the three repeated correlated subqueries.
-- Spiff attach logic is unchanged.
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_weekly_invoices(p_monday date, p_sunday date)
RETURNS TABLE (
  invoice_id     uuid,
  client_id      uuid,
  invoice_number text,
  line_count     int,
  total_amount   numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_rec record;
  v_invoice_id uuid;
  v_invoice_number text;
  v_line_count int;
  v_total numeric;
  v_iso_week int;
  v_ded record;
  v_ded_paid numeric;
  v_ded_count int;
  v_remaining numeric;
  v_amt numeric;
BEGIN
  v_iso_week := EXTRACT(WEEK FROM p_monday)::int;

  FOR v_client_rec IN
    SELECT DISTINCT cl.id AS cid, cl.name AS cname, cl.bill_vacation AS cbill_vac
    FROM clients cl
    WHERE cl.is_billable = true
      AND NOT EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.client_id = cl.id AND i.week_start = p_monday AND i.week_end = p_sunday
      )
      AND (
        EXISTS (
          SELECT 1 FROM employees e
          JOIN employee_campaign_assignments eca ON eca.employee_id = e.id
          JOIN campaigns c ON c.id = eca.campaign_id
          WHERE c.client_id = cl.id
            AND e.is_system_user = false
            AND eca.start_date  <= p_sunday
            AND (eca.end_date IS NULL OR eca.end_date >= p_monday)
            AND (
              e.is_active = true
              OR EXISTS (
                SELECT 1 FROM time_clock tc
                WHERE tc.employee_id = e.id
                  AND tc.date BETWEEN p_monday AND p_sunday
                  AND tc.date >= eca.start_date
                  AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)
              )
            )
        )
        OR EXISTS (
          SELECT 1 FROM employees e
          WHERE e.flat_bill_client_id = cl.id AND e.flat_weekly_bill_amount > 0
            AND e.is_active = true AND e.is_system_user = false
        )
      )
  LOOP
    v_invoice_number := next_invoice_number(v_client_rec.cid);

    INSERT INTO invoices (
      client_id, invoice_number, week_number, week_start, week_end,
      due_date, status, submitted_on, project_name
    ) VALUES (
      v_client_rec.cid, v_invoice_number, v_iso_week, p_monday, p_sunday,
      p_sunday + INTERVAL '4 days', 'draft', CURRENT_DATE, v_client_rec.cname
    )
    RETURNING id INTO v_invoice_id;

    WITH per_day AS (
      INSERT INTO invoice_lines (
        invoice_id, employee_id, agent_name, campaign_name,
        days_worked, holiday_days, unit_price, total, spiffs, total_price, is_flat_total
      )
      SELECT
        v_invoice_id, e.id, e.full_name, c.name,
        dw.days_w,
        0,
        e.daily_bill_rate,
        dw.days_w * e.daily_bill_rate,
        0,
        dw.days_w * e.daily_bill_rate,
        false
      FROM employees e
      JOIN employee_campaign_assignments eca ON eca.employee_id = e.id
      JOIN campaigns c ON c.id = eca.campaign_id
      CROSS JOIN LATERAL (
        SELECT (
          -- Clock punches within this assignment window
          COALESCE((
            SELECT count(DISTINCT tc.date)::numeric
            FROM time_clock tc
            WHERE tc.employee_id = e.id
              AND tc.date BETWEEN p_monday AND p_sunday
              AND tc.date >= eca.start_date
              AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)
          ), 0)
          +
          -- Approved paid vacation days (bill_vacation clients only),
          -- within this assignment window, not already punched.
          CASE WHEN v_client_rec.cbill_vac THEN
            COALESCE((
              SELECT COUNT(DISTINCT vd.vdate)::numeric
              FROM (
                SELECT gs::date AS vdate
                FROM vacation_requests vr,
                     generate_series(vr.start_date, vr.end_date, '1 day'::interval) gs
                WHERE vr.employee_id = e.id
                  AND vr.status      = 'approved'
                  AND vr.is_paid     = true
                  AND vr.start_date <= p_sunday
                  AND vr.end_date   >= p_monday
              ) vd
              WHERE vd.vdate BETWEEN p_monday AND p_sunday
                AND vd.vdate >= eca.start_date
                AND vd.vdate <= COALESCE(eca.end_date, '9999-12-31'::date)
                AND NOT EXISTS (
                  SELECT 1 FROM time_clock tc2
                  WHERE tc2.employee_id = e.id AND tc2.date = vd.vdate
                )
            ), 0)
          ELSE 0
          END
        ) AS days_w
      ) dw
      WHERE c.client_id       = v_client_rec.cid
        AND e.is_system_user  = false
        AND eca.start_date   <= p_sunday
        AND (eca.end_date IS NULL OR eca.end_date >= p_monday)
        AND (
          (
            e.is_active = true
            AND (e.hire_date IS NULL OR e.hire_date <= p_sunday)
            AND (e.last_worked_day IS NULL OR e.last_worked_day >= p_monday)
          )
          OR EXISTS (
            SELECT 1 FROM time_clock tc
            WHERE tc.employee_id = e.id
              AND tc.date BETWEEN p_monday AND p_sunday
              AND tc.date >= eca.start_date
              AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)
          )
        )
      RETURNING total_price
    ),
    flat_billed AS (
      INSERT INTO invoice_lines (
        invoice_id, employee_id, agent_name, campaign_name,
        days_worked, holiday_days, unit_price, total, spiffs, total_price, is_flat_total
      )
      SELECT
        v_invoice_id, e.id, e.full_name, '— flat bill —',
        7, 0, 0, 0, 0, e.flat_weekly_bill_amount, true
      FROM employees e
      WHERE e.flat_bill_client_id      = v_client_rec.cid
        AND e.is_active                = true
        AND e.is_system_user           = false
        AND e.flat_weekly_bill_amount  > 0
        AND (e.hire_date IS NULL OR e.hire_date <= p_sunday)
        AND (e.last_worked_day IS NULL OR e.last_worked_day >= p_monday)
      RETURNING total_price
    )
    SELECT
      ((SELECT count(*) FROM per_day) + (SELECT count(*) FROM flat_billed))::int,
      COALESCE((SELECT SUM(total_price) FROM per_day),      0)
      + COALESCE((SELECT SUM(total_price) FROM flat_billed), 0)
    INTO v_line_count, v_total;

    -- Recurring deductions
    FOR v_ded IN
      SELECT * FROM client_recurring_deductions d
      WHERE d.client_id = v_client_rec.cid AND d.is_active = true
    LOOP
      SELECT COALESCE(SUM(-il.total_price), 0), COUNT(*)
        INTO v_ded_paid, v_ded_count
      FROM invoice_lines il
      JOIN invoices i2 ON i2.id = il.invoice_id
      WHERE i2.client_id  = v_client_rec.cid
        AND il.agent_name LIKE v_ded.label_prefix || ' #%'
        AND i2.id <> v_invoice_id;

      v_remaining := v_ded.total_amount - v_ded.prepaid_amount - v_ded_paid;

      IF v_remaining > 0 THEN
        v_amt := LEAST(v_ded.weekly_amount, v_remaining);
        INSERT INTO invoice_lines (
          invoice_id, employee_id, agent_name, campaign_name,
          days_worked, holiday_days, unit_price, total, spiffs, total_price, is_flat_total
        ) VALUES (
          v_invoice_id, NULL,
          v_ded.label_prefix || ' #' || (v_ded.next_counter_start + v_ded_count),
          '— deduction —', 0, 0, 0, 0, 0, -v_amt, true
        );
        v_line_count := v_line_count + 1;
        v_total      := v_total - v_amt;
      END IF;
    END LOOP;

    -- Attach any pending spiffs for this client + week to their lines.
    -- Silently continues if no spiffs exist (PERFORM discards the return set).
    PERFORM attach_pending_spiffs(v_invoice_id);

    -- Re-read total_price after spiffs may have been added
    SELECT COALESCE(SUM(total_price), 0) INTO v_total
      FROM invoice_lines WHERE invoice_id = v_invoice_id;

    invoice_id     := v_invoice_id;
    client_id      := v_client_rec.cid;
    invoice_number := v_invoice_number;
    line_count     := v_line_count;
    total_amount   := v_total;
    RETURN NEXT;
  END LOOP;
END;
$$;
