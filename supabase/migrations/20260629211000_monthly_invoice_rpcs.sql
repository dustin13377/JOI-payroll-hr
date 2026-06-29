-- Monthly billing engine for monthly clients (e.g. HFB Tech).
--
-- A monthly invoice bills the WHOLE month up front (Mon-Fri weekdays in the
-- month, per agent, at their daily_bill_rate), then reconciles the PRIOR month
-- on the same invoice:
--   * missed-day credit = (prior-month weekdays the agent was active) − (days
--     actually worked) , billed as a negative line.
--   * prior-month spiffs that are still 'pending' (not yet billed elsewhere),
--     added as positive lines and marked billed.
--
-- Because the up-front charge IS "weekdays in the month", next month's credit
-- (billed weekdays − actual worked) is self-correcting: you only ever end up
-- paying for days actually worked, one month in arrears.
--
-- Number format for monthly clients: PREFIX-Month-YYYY  (e.g. HFB-July-2026).

-- ---------------------------------------------------------------------------
-- Preview (read-only): per-agent breakdown for a given client + month.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.monthly_invoice_preview(p_client_id uuid, p_month_start date)
 RETURNS TABLE(
   employee_id uuid,
   agent_name text,
   campaign_name text,
   daily_bill_rate numeric,
   upfront_days numeric,
   upfront_amount numeric,
   prior_missed_days numeric,
   credit_amount numeric,
   prior_spiff_amount numeric,
   net_amount numeric,
   existing_invoice_id uuid
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m_start      date := date_trunc('month', p_month_start)::date;
  v_m_end        date := (date_trunc('month', p_month_start) + interval '1 month - 1 day')::date;
  v_prior_start  date := (date_trunc('month', p_month_start) - interval '1 month')::date;
  v_prior_end    date := (date_trunc('month', p_month_start) - interval '1 day')::date;
  a              record;
  v_upfront      numeric;
  v_pweekdays    numeric;
  v_pworked      numeric;
  v_missed       numeric;
  v_spiff        numeric;
  v_existing     uuid;
BEGIN
  SELECT i.id INTO v_existing FROM invoices i
   WHERE i.client_id = p_client_id AND i.week_start = v_m_start AND i.week_end = v_m_end
   LIMIT 1;

  FOR a IN
    SELECT DISTINCT e.id AS emp_id, e.full_name, e.daily_bill_rate, e.hire_date, e.last_worked_day,
      (SELECT c2.name FROM employee_campaign_assignments eca2
         JOIN campaigns c2 ON c2.id = eca2.campaign_id
        WHERE eca2.employee_id = e.id AND c2.client_id = p_client_id
        ORDER BY eca2.start_date DESC LIMIT 1) AS campaign_name
    FROM employees e
    JOIN employee_campaign_assignments eca ON eca.employee_id = e.id
    JOIN campaigns c ON c.id = eca.campaign_id
    WHERE c.client_id = p_client_id
      AND e.is_system_user = false
      AND eca.start_date <= v_m_end
      AND (eca.end_date IS NULL OR eca.end_date >= v_prior_start)
  LOOP
    v_upfront := (
      SELECT count(*)::numeric FROM generate_series(v_m_start, v_m_end, '1 day') g
      WHERE extract(isodow from g) < 6
        AND (a.hire_date IS NULL OR g::date >= a.hire_date)
        AND (a.last_worked_day IS NULL OR g::date <= a.last_worked_day)
        AND EXISTS (SELECT 1 FROM employee_campaign_assignments eca
                      JOIN campaigns c ON c.id = eca.campaign_id
                     WHERE eca.employee_id = a.emp_id AND c.client_id = p_client_id
                       AND g::date >= eca.start_date
                       AND g::date <= COALESCE(eca.end_date, '9999-12-31'::date)));

    v_pweekdays := (
      SELECT count(*)::numeric FROM generate_series(v_prior_start, v_prior_end, '1 day') g
      WHERE extract(isodow from g) < 6
        AND (a.hire_date IS NULL OR g::date >= a.hire_date)
        AND (a.last_worked_day IS NULL OR g::date <= a.last_worked_day)
        AND EXISTS (SELECT 1 FROM employee_campaign_assignments eca
                      JOIN campaigns c ON c.id = eca.campaign_id
                     WHERE eca.employee_id = a.emp_id AND c.client_id = p_client_id
                       AND g::date >= eca.start_date
                       AND g::date <= COALESCE(eca.end_date, '9999-12-31'::date)));

    v_pworked := (
      SELECT count(DISTINCT tc.date)::numeric FROM time_clock tc
      WHERE tc.employee_id = a.emp_id
        AND tc.date BETWEEN v_prior_start AND v_prior_end
        AND EXISTS (SELECT 1 FROM employee_campaign_assignments eca
                      JOIN campaigns c ON c.id = eca.campaign_id
                     WHERE eca.employee_id = a.emp_id AND c.client_id = p_client_id
                       AND tc.date >= eca.start_date
                       AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)));

    v_missed := GREATEST(v_pweekdays - v_pworked, 0);

    v_spiff := COALESCE((
      SELECT SUM(amount_usd) FROM spiffs
      WHERE spiffs.employee_id = a.emp_id AND spiffs.client_id = p_client_id
        AND spiff_date BETWEEN v_prior_start AND v_prior_end
        AND status = 'pending'), 0);

    employee_id        := a.emp_id;
    agent_name         := a.full_name;
    campaign_name      := a.campaign_name;
    daily_bill_rate    := COALESCE(a.daily_bill_rate, 0);
    upfront_days       := v_upfront;
    upfront_amount     := v_upfront * COALESCE(a.daily_bill_rate, 0);
    prior_missed_days  := v_missed;
    credit_amount      := -(v_missed * COALESCE(a.daily_bill_rate, 0));
    prior_spiff_amount := v_spiff;
    net_amount         := upfront_amount + credit_amount + prior_spiff_amount;
    existing_invoice_id := v_existing;
    RETURN NEXT;
  END LOOP;
END;
$function$;


-- ---------------------------------------------------------------------------
-- Generate: create the draft monthly invoice + lines, mark prior spiffs billed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_monthly_invoice(p_client_id uuid, p_month_start date)
 RETURNS TABLE(invoice_id uuid, invoice_number text, line_count integer, total_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m_start      date := date_trunc('month', p_month_start)::date;
  v_m_end        date := (date_trunc('month', p_month_start) + interval '1 month - 1 day')::date;
  v_prior_start  date := (date_trunc('month', p_month_start) - interval '1 month')::date;
  v_prior_end    date := (date_trunc('month', p_month_start) - interval '1 day')::date;
  v_month_names  text[] := ARRAY['January','February','March','April','May','June',
                                 'July','August','September','October','November','December'];
  v_prefix       text;
  v_cname        text;
  v_freq         text;
  v_month_label  text := v_month_names[extract(month from v_m_start)::int];
  v_prior_label  text := v_month_names[extract(month from v_prior_start)::int];
  v_invoice_no   text;
  v_invoice_id   uuid;
  v_lines        int := 0;
  v_total        numeric := 0;
  v_rate         numeric;
  a              record;
  v_upfront      numeric;
  v_pweekdays    numeric;
  v_pworked      numeric;
  v_missed       numeric;
  v_spiff        numeric;
  v_spiff_ids    uuid[];
  v_spiff_line   uuid;
BEGIN
  SELECT prefix, name, billing_frequency INTO v_prefix, v_cname, v_freq
    FROM clients WHERE id = p_client_id;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Client % not found', p_client_id;
  END IF;
  IF v_freq <> 'monthly' THEN
    RAISE EXCEPTION 'Client % is not a monthly-billed client (billing_frequency=%)', v_cname, v_freq;
  END IF;
  IF EXISTS (SELECT 1 FROM invoices i
             WHERE i.client_id = p_client_id AND i.week_start = v_m_start AND i.week_end = v_m_end) THEN
    RAISE EXCEPTION 'A % invoice already exists for % (%-%)', v_cname, v_month_label, v_m_start, v_m_end;
  END IF;

  v_invoice_no := v_prefix || '-' || v_month_label || '-' || extract(year from v_m_start)::text;

  INSERT INTO invoices (
    client_id, invoice_number, week_number, week_start, week_end,
    due_date, status, submitted_on, project_name
  ) VALUES (
    p_client_id, v_invoice_no, extract(month from v_m_start)::int, v_m_start, v_m_end,
    v_m_start + INTERVAL '4 days', 'draft', CURRENT_DATE, v_cname
  )
  RETURNING id INTO v_invoice_id;

  FOR a IN
    SELECT DISTINCT e.id AS emp_id, e.full_name, e.daily_bill_rate, e.hire_date, e.last_worked_day,
      (SELECT c2.name FROM employee_campaign_assignments eca2
         JOIN campaigns c2 ON c2.id = eca2.campaign_id
        WHERE eca2.employee_id = e.id AND c2.client_id = p_client_id
        ORDER BY eca2.start_date DESC LIMIT 1) AS campaign_name
    FROM employees e
    JOIN employee_campaign_assignments eca ON eca.employee_id = e.id
    JOIN campaigns c ON c.id = eca.campaign_id
    WHERE c.client_id = p_client_id
      AND e.is_system_user = false
      AND eca.start_date <= v_m_end
      AND (eca.end_date IS NULL OR eca.end_date >= v_prior_start)
  LOOP
    v_rate := COALESCE(a.daily_bill_rate, 0);

    v_upfront := (
      SELECT count(*)::numeric FROM generate_series(v_m_start, v_m_end, '1 day') g
      WHERE extract(isodow from g) < 6
        AND (a.hire_date IS NULL OR g::date >= a.hire_date)
        AND (a.last_worked_day IS NULL OR g::date <= a.last_worked_day)
        AND EXISTS (SELECT 1 FROM employee_campaign_assignments eca
                      JOIN campaigns c ON c.id = eca.campaign_id
                     WHERE eca.employee_id = a.emp_id AND c.client_id = p_client_id
                       AND g::date >= eca.start_date
                       AND g::date <= COALESCE(eca.end_date, '9999-12-31'::date)));

    v_pweekdays := (
      SELECT count(*)::numeric FROM generate_series(v_prior_start, v_prior_end, '1 day') g
      WHERE extract(isodow from g) < 6
        AND (a.hire_date IS NULL OR g::date >= a.hire_date)
        AND (a.last_worked_day IS NULL OR g::date <= a.last_worked_day)
        AND EXISTS (SELECT 1 FROM employee_campaign_assignments eca
                      JOIN campaigns c ON c.id = eca.campaign_id
                     WHERE eca.employee_id = a.emp_id AND c.client_id = p_client_id
                       AND g::date >= eca.start_date
                       AND g::date <= COALESCE(eca.end_date, '9999-12-31'::date)));

    v_pworked := (
      SELECT count(DISTINCT tc.date)::numeric FROM time_clock tc
      WHERE tc.employee_id = a.emp_id
        AND tc.date BETWEEN v_prior_start AND v_prior_end
        AND EXISTS (SELECT 1 FROM employee_campaign_assignments eca
                      JOIN campaigns c ON c.id = eca.campaign_id
                     WHERE eca.employee_id = a.emp_id AND c.client_id = p_client_id
                       AND tc.date >= eca.start_date
                       AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)));

    v_missed := GREATEST(v_pweekdays - v_pworked, 0);

    SELECT COALESCE(SUM(amount_usd), 0), ARRAY_AGG(id)
      INTO v_spiff, v_spiff_ids
      FROM spiffs
     WHERE spiffs.employee_id = a.emp_id AND spiffs.client_id = p_client_id
       AND spiff_date BETWEEN v_prior_start AND v_prior_end
       AND status = 'pending';

    -- Up-front line (this month)
    IF v_upfront > 0 THEN
      INSERT INTO invoice_lines (
        invoice_id, employee_id, agent_name, campaign_name,
        days_worked, holiday_days, unit_price, total, spiffs, total_price, is_flat_total
      ) VALUES (
        v_invoice_id, a.emp_id, a.full_name, a.campaign_name,
        v_upfront, 0, v_rate, v_upfront * v_rate, 0, v_upfront * v_rate, false
      );
      v_lines := v_lines + 1;
      v_total := v_total + v_upfront * v_rate;
    END IF;

    -- Prior-month missed-day credit (negative)
    IF v_missed > 0 AND v_rate > 0 THEN
      INSERT INTO invoice_lines (
        invoice_id, employee_id, agent_name, campaign_name,
        days_worked, holiday_days, unit_price, total, spiffs, total_price, is_flat_total
      ) VALUES (
        v_invoice_id, a.emp_id,
        a.full_name || ' — ' || v_prior_label || ' missed (' || v_missed || 'd)',
        '— credit —', 0, 0, 0, 0, 0, -(v_missed * v_rate), true
      );
      v_lines := v_lines + 1;
      v_total := v_total - v_missed * v_rate;
    END IF;

    -- Prior-month spiffs (positive); mark them billed
    IF v_spiff > 0 AND v_spiff_ids IS NOT NULL THEN
      INSERT INTO invoice_lines (
        invoice_id, employee_id, agent_name, campaign_name,
        days_worked, holiday_days, unit_price, total, spiffs, total_price, is_flat_total
      ) VALUES (
        v_invoice_id, a.emp_id,
        a.full_name || ' — ' || v_prior_label || ' spiffs',
        '— spiff —', 0, 0, 0, 0, 0, v_spiff, true
      )
      RETURNING id INTO v_spiff_line;

      UPDATE spiffs
         SET status = 'billed', invoice_line_id = v_spiff_line, billed_at = NOW()
       WHERE id = ANY(v_spiff_ids) AND status = 'pending';

      v_lines := v_lines + 1;
      v_total := v_total + v_spiff;
    END IF;
  END LOOP;

  invoice_id   := v_invoice_id;
  invoice_number := v_invoice_no;
  line_count   := v_lines;
  total_amount := v_total;
  RETURN NEXT;
END;
$function$;
