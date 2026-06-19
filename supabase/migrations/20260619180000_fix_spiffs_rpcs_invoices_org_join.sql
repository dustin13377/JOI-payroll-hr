-- Fix: invoices has no organization_id column; both spiff RPCs were referencing it.
-- Scope org access via clients.organization_id join instead.

CREATE OR REPLACE FUNCTION public.attach_pending_spiffs(p_invoice_id uuid)
RETURNS TABLE (
  attached_count     int,
  attached_total_usd numeric,
  orphan_count       int
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
