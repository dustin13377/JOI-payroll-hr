-- ============================================================
-- attach_pending_spiffs(p_invoice_id)
--
-- For a DRAFT invoice: find all pending spiffs for its
-- client + week whose employee has a non-flat line on the
-- invoice. Sum per line → update spiffs + total + total_price.
-- Mark each spiff billed. Idempotent: only touches 'pending'.
--
-- Returns one row: (attached_count, attached_total_usd, orphan_count)
-- orphan_count = pending spiffs for this client+week with no
-- matching line (report only — caller surfaces these to user).
-- ============================================================
CREATE OR REPLACE FUNCTION public.attach_pending_spiffs(p_invoice_id uuid)
RETURNS TABLE (
  attached_count  int,
  attached_total_usd numeric,
  orphan_count    int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv       RECORD;
  v_line      RECORD;
  v_spiff_sum numeric;
  v_spiff_ids uuid[];
  v_new_total numeric;
  v_attached  int     := 0;
  v_att_total numeric := 0;
  v_orphans   int     := 0;
BEGIN
  -- Org-scoped lookup via clients.organization_id (invoices has no organization_id column)
  SELECT i.id, i.client_id, i.week_start, i.week_end, i.status, c.organization_id
    INTO v_inv
    FROM invoices i
    JOIN clients c ON c.id = i.client_id
   WHERE i.id = p_invoice_id
     AND c.organization_id = my_org_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found or not in this organisation', p_invoice_id;
  END IF;

  IF v_inv.status <> 'draft' THEN
    RAISE EXCEPTION 'Invoice % is % — only draft invoices can have spiffs attached',
      p_invoice_id, v_inv.status;
  END IF;

  -- Per agent line: aggregate pending spiffs and link them
  FOR v_line IN
    SELECT id, employee_id, days_worked, unit_price, holiday_days, spiffs
      FROM invoice_lines
     WHERE invoice_id = p_invoice_id
       AND employee_id IS NOT NULL
       AND is_flat_total = false
  LOOP
    SELECT
      COALESCE(SUM(amount_usd), 0),
      ARRAY_AGG(id)
    INTO v_spiff_sum, v_spiff_ids
    FROM spiffs
    WHERE employee_id   = v_line.employee_id
      AND client_id     = v_inv.client_id
      AND spiff_date   BETWEEN v_inv.week_start AND v_inv.week_end
      AND status        = 'pending'
      AND organization_id = my_org_id();

    -- Nothing pending for this agent → skip
    CONTINUE WHEN v_spiff_ids IS NULL OR CARDINALITY(v_spiff_ids) = 0;

    -- Recompute line totals (add newly-attaching spiffs to whatever was already there)
    v_new_total := v_line.days_worked * v_line.unit_price
                 + v_line.holiday_days * v_line.unit_price * 2;

    UPDATE invoice_lines
       SET spiffs      = spiffs + v_spiff_sum,
           total       = v_new_total,
           total_price = v_new_total + (spiffs + v_spiff_sum)
     WHERE id = v_line.id;

    -- Mark spiffs billed
    UPDATE spiffs
       SET status          = 'billed',
           invoice_line_id = v_line.id,
           billed_at       = NOW()
     WHERE id = ANY(v_spiff_ids)
       AND status = 'pending';

    v_attached  := v_attached  + CARDINALITY(v_spiff_ids);
    v_att_total := v_att_total + v_spiff_sum;
  END LOOP;

  -- Count orphans: pending spiffs for this client+week with no matching line
  SELECT COUNT(*) INTO v_orphans
    FROM spiffs s
   WHERE s.client_id    = v_inv.client_id
     AND s.spiff_date  BETWEEN v_inv.week_start AND v_inv.week_end
     AND s.status       = 'pending'
     AND s.organization_id = my_org_id()
     AND NOT EXISTS (
       SELECT 1 FROM invoice_lines il
        WHERE il.invoice_id  = p_invoice_id
          AND il.employee_id = s.employee_id
     );

  attached_count     := v_attached;
  attached_total_usd := v_att_total;
  orphan_count       := v_orphans;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.attach_pending_spiffs(uuid) TO authenticated;


-- ============================================================
-- detach_invoice_spiffs(p_invoice_id)
--
-- Reverses attach: resets linked spiffs to 'pending', clears
-- invoice_line_id / billed_at, and zeros invoice_lines.spiffs
-- (recomputes total / total_price). Guards against paid invoices.
-- ============================================================
CREATE OR REPLACE FUNCTION public.detach_invoice_spiffs(p_invoice_id uuid)
RETURNS TABLE (
  detached_count     int,
  detached_total_usd numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv       RECORD;
  v_det_count int;
  v_det_total numeric;
BEGIN
  SELECT i.id, i.status, c.organization_id
    INTO v_inv
    FROM invoices i
    JOIN clients c ON c.id = i.client_id
   WHERE i.id = p_invoice_id
     AND c.organization_id = my_org_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found or not in this organisation', p_invoice_id;
  END IF;

  IF v_inv.status = 'paid' THEN
    RAISE EXCEPTION 'Invoice % is paid — cannot detach spiffs from a paid invoice', p_invoice_id;
  END IF;

  -- Snapshot what we're about to detach
  SELECT COUNT(*), COALESCE(SUM(s.amount_usd), 0)
    INTO v_det_count, v_det_total
    FROM spiffs s
    JOIN invoice_lines il ON il.id = s.invoice_line_id
   WHERE il.invoice_id = p_invoice_id
     AND s.status      = 'billed';

  -- Reset spiffs back to pending
  UPDATE spiffs
     SET status          = 'pending',
         invoice_line_id = NULL,
         billed_at       = NULL
   WHERE invoice_line_id IN (
     SELECT id FROM invoice_lines WHERE invoice_id = p_invoice_id
   )
     AND organization_id = my_org_id();

  -- Zero out spiffs column and recompute line totals
  UPDATE invoice_lines
     SET spiffs      = 0,
         total       = days_worked * unit_price + holiday_days * unit_price * 2,
         total_price = days_worked * unit_price + holiday_days * unit_price * 2
   WHERE invoice_id   = p_invoice_id
     AND is_flat_total = false
     AND employee_id IS NOT NULL;

  detached_count     := v_det_count;
  detached_total_usd := v_det_total;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.detach_invoice_spiffs(uuid) TO authenticated;


-- ============================================================
-- Update generate_weekly_invoices to call attach_pending_spiffs
-- after creating each invoice's lines.
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
    SELECT DISTINCT cl.id AS cid, cl.name AS cname
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
            AND eca.start_date <= p_sunday
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
        COALESCE((
          SELECT count(DISTINCT tc.date)::numeric FROM time_clock tc
          WHERE tc.employee_id = e.id
            AND tc.date BETWEEN p_monday AND p_sunday
            AND tc.date >= eca.start_date
            AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)
        ), 0),
        0, e.daily_bill_rate,
        COALESCE((
          SELECT count(DISTINCT tc.date)::numeric FROM time_clock tc
          WHERE tc.employee_id = e.id
            AND tc.date BETWEEN p_monday AND p_sunday
            AND tc.date >= eca.start_date
            AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)
        ), 0) * e.daily_bill_rate,
        0,
        COALESCE((
          SELECT count(DISTINCT tc.date)::numeric FROM time_clock tc
          WHERE tc.employee_id = e.id
            AND tc.date BETWEEN p_monday AND p_sunday
            AND tc.date >= eca.start_date
            AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)
        ), 0) * e.daily_bill_rate,
        false
      FROM employees e
      JOIN employee_campaign_assignments eca ON eca.employee_id = e.id
      JOIN campaigns c ON c.id = eca.campaign_id
      WHERE c.client_id = v_client_rec.cid
        AND e.is_system_user = false
        AND eca.start_date <= p_sunday
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
      WHERE e.flat_bill_client_id = v_client_rec.cid
        AND e.is_active = true AND e.is_system_user = false
        AND e.flat_weekly_bill_amount > 0
        AND (e.hire_date IS NULL OR e.hire_date <= p_sunday)
        AND (e.last_worked_day IS NULL OR e.last_worked_day >= p_monday)
      RETURNING total_price
    )
    SELECT
      ((SELECT count(*) FROM per_day) + (SELECT count(*) FROM flat_billed))::int,
      COALESCE((SELECT SUM(total_price) FROM per_day), 0) + COALESCE((SELECT SUM(total_price) FROM flat_billed), 0)
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
      WHERE i2.client_id = v_client_rec.cid
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
        v_total := v_total - v_amt;
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
