-- Idempotency + detach proof for spiffs invoicing link.
-- Safe to run: everything is in a BEGIN / ROLLBACK block.
-- Run via Supabase MCP execute_sql against project jpaihltkrohdqkqlbqkf.
-- Expected output: all ASSERT lines pass, final ROLLBACK printed.
--
-- NOTE: my_org_id() reads auth.uid() from request.jwt.claims.
-- When running as postgres superuser (e.g. via MCP execute_sql), auth.uid()
-- returns NULL. We inject a real user's sub + org so the RPCs can scope
-- correctly. Replace the UUIDs below if the user/org is ever removed.
--
--   user profile id : 64d3c041-bc19-450f-bd5b-caf5347fe270
--   organization id : 1d15e900-ccc8-4616-ae0a-179fb27cbf27

BEGIN;

-- Simulate an authenticated Supabase session so my_org_id() resolves
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"64d3c041-bc19-450f-bd5b-caf5347fe270","role":"authenticated"}',
  true   -- local to this transaction
);

DO $$
DECLARE
  v_org_id   uuid := '1d15e900-ccc8-4616-ae0a-179fb27cbf27';
  v_client   uuid := gen_random_uuid();
  v_emp      uuid := gen_random_uuid();
  v_camp     uuid := gen_random_uuid();
  v_inv      uuid;
  v_line     uuid;
  v_spiff1   uuid := gen_random_uuid();
  v_spiff2   uuid := gen_random_uuid();
  v_res      RECORD;
BEGIN
  -- ── Fixtures ─────────────────────────────────────────────────────────────

  -- Minimal client (prefix is NOT NULL)
  INSERT INTO clients (id, organization_id, name, prefix, is_billable)
  VALUES (v_client, v_org_id, 'TEST_CLIENT_SPIFF_PROOF', 'TST', true);

  -- Minimal employee (no auth login needed)
  INSERT INTO employees (id, organization_id, full_name, employee_id, is_active, is_system_user, daily_bill_rate)
  VALUES (v_emp, v_org_id, 'Test Spiff Agent', 'TST-999', true, false, 100);

  -- Campaign linking employee to client
  INSERT INTO campaigns (id, organization_id, client_id, name, is_active)
  VALUES (v_camp, v_org_id, v_client, 'TST Campaign', true);

  INSERT INTO employee_campaign_assignments (employee_id, campaign_id, start_date, organization_id)
  VALUES (v_emp, v_camp, '2026-01-01', v_org_id);

  -- Draft invoice for week 2026-06-16 → 2026-06-22
  -- invoices has no organization_id; org is scoped via client_id → clients
  INSERT INTO invoices (id, client_id, invoice_number, week_number, week_start, week_end, due_date, status)
  VALUES (gen_random_uuid(), v_client, 'TST-001', 25, '2026-06-16', '2026-06-22', '2026-06-26', 'draft')
  RETURNING id INTO v_inv;

  -- One non-flat invoice line for the test employee
  INSERT INTO invoice_lines (id, invoice_id, employee_id, agent_name, days_worked, unit_price, total, spiffs, total_price, is_flat_total, holiday_days)
  VALUES (gen_random_uuid(), v_inv, v_emp, 'Test Spiff Agent', 5, 100, 500, 0, 500, false, 0)
  RETURNING id INTO v_line;

  -- Two pending spiffs for that employee/client within the invoice week
  INSERT INTO spiffs (id, organization_id, employee_id, client_id, spiff_date, amount_usd, reason, status, source, created_at)
  VALUES
    (v_spiff1, v_org_id, v_emp, v_client, '2026-06-17', 25.00, 'PB 6',      'pending', 'app', NOW()),
    (v_spiff2, v_org_id, v_emp, v_client, '2026-06-18', 15.00, '1ST PLACE', 'pending', 'app', NOW());

  -- ── TEST 1: attach marks spiffs billed, updates line ─────────────────────
  SELECT * INTO v_res FROM attach_pending_spiffs(v_inv);

  ASSERT v_res.attached_count = 2,
    'attach: expected 2 attached, got ' || v_res.attached_count;
  ASSERT v_res.attached_total_usd = 40,
    'attach: expected total $40, got ' || v_res.attached_total_usd;
  ASSERT v_res.orphan_count = 0,
    'attach: expected 0 orphans, got ' || v_res.orphan_count;

  -- Line should now have spiffs = 40, total_price = 540
  ASSERT (SELECT spiffs FROM invoice_lines WHERE id = v_line) = 40,
    'line.spiffs should be 40 after attach';
  ASSERT (SELECT total_price FROM invoice_lines WHERE id = v_line) = 540,
    'line.total_price should be 540 after attach';

  -- Both spiffs should be billed and linked to the line
  ASSERT (SELECT COUNT(*) FROM spiffs WHERE id IN (v_spiff1, v_spiff2) AND status = 'billed') = 2,
    'both spiffs should be billed';
  ASSERT (SELECT COUNT(*) FROM spiffs WHERE id IN (v_spiff1, v_spiff2) AND invoice_line_id = v_line) = 2,
    'both spiffs should link to the line';

  -- ── TEST 2: re-attach is a no-op (idempotency) ───────────────────────────
  SELECT * INTO v_res FROM attach_pending_spiffs(v_inv);

  ASSERT v_res.attached_count = 0,
    'idempotency: second attach should find 0 pending, got ' || v_res.attached_count;
  ASSERT (SELECT spiffs FROM invoice_lines WHERE id = v_line) = 40,
    'idempotency: line.spiffs should still be 40';

  -- ── TEST 3: detach restores spiffs to pending ─────────────────────────────
  SELECT * INTO v_res FROM detach_invoice_spiffs(v_inv);

  ASSERT v_res.detached_count = 2,
    'detach: expected 2 detached, got ' || v_res.detached_count;
  ASSERT v_res.detached_total_usd = 40,
    'detach: expected $40, got ' || v_res.detached_total_usd;

  ASSERT (SELECT COUNT(*) FROM spiffs WHERE id IN (v_spiff1, v_spiff2) AND status = 'pending') = 2,
    'after detach: both spiffs should be pending';
  ASSERT (SELECT COUNT(*) FROM spiffs WHERE id IN (v_spiff1, v_spiff2) AND invoice_line_id IS NULL) = 2,
    'after detach: invoice_line_id should be NULL';
  ASSERT (SELECT spiffs FROM invoice_lines WHERE id = v_line) = 0,
    'after detach: line.spiffs should be 0';
  ASSERT (SELECT total_price FROM invoice_lines WHERE id = v_line) = 500,
    'after detach: line.total_price should be 500 (days only)';

  RAISE NOTICE 'All assertions passed ✅';
END;
$$;

ROLLBACK;
