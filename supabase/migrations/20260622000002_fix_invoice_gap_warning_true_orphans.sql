-- =============================================================================
-- Fix weekly_invoice_preview gap warning (Branch 3).
--
-- Bug: the "unmatched punches" warning flagged a punch as unmatched for EVERY
-- client the employee was ever assigned to. So when an agent moved from client A
-- to client B, their new (correctly-billed) punches under B showed up as
-- "unmatched — will be silently dropped" under A. False alarm for every agent
-- who ever changed clients.
--
-- Fix: only flag a punch when NO assignment for ANY client covers it (a true
-- orphan that won't bill anywhere), attributed to the employee's CURRENT
-- campaign's client so the operator knows where to fix it. Branches 1 (per-day
-- billing) and 2 (flat bill) are unchanged.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.weekly_invoice_preview(p_monday date, p_sunday date)
 RETURNS TABLE(client_id uuid, client_prefix text, client_name text, employee_id uuid, employee_code text, employee_name text, campaign_id uuid, campaign_name text, daily_bill_rate numeric, days_worked numeric, existing_invoice_id uuid, is_flat_bill boolean, flat_amount numeric, is_gap_warning boolean, gap_dates text[])
 LANGUAGE plpgsql
AS $function$
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
      COALESCE((
        SELECT count(DISTINCT tc.date)::numeric
        FROM time_clock tc
        WHERE tc.employee_id = e.id
          AND tc.date BETWEEN p_monday AND p_sunday
          AND tc.date >= eca.start_date
          AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)
      ), 0)
      +
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

  -- ── Branch 3: gap warnings — TRUE orphans only ──────────────────────────
  -- A punch is flagged only when NO assignment (any client) covers it, so it
  -- won't bill anywhere. Attributed to the employee's current campaign's client.
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
  JOIN employees e  ON e.id = tc.employee_id
  JOIN campaigns c  ON c.id = e.campaign_id
  JOIN clients   cl ON cl.id = c.client_id
  WHERE tc.date BETWEEN p_monday AND p_sunday
    AND cl.is_billable   = true
    AND e.is_system_user = false
    AND NOT EXISTS (
      SELECT 1
      FROM employee_campaign_assignments eca_cov
      WHERE eca_cov.employee_id = e.id
        AND tc.date >= eca_cov.start_date
        AND tc.date <= COALESCE(eca_cov.end_date, '9999-12-31'::date)
    )
  GROUP BY cl.id, cl.prefix, cl.name, e.id, e.employee_id, e.full_name

  ORDER BY 3, 6;  -- client_name, employee_name
END;
$function$;
