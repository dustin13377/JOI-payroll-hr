-- Proof script for invoice generator vacation billing + gap detection.
-- All operations are inside BEGIN / ROLLBACK — no permanent changes.
-- Run via Supabase MCP execute_sql against project jpaihltkrohdqkqlbqkf.
-- Expected: 'All assertions passed ✅' then ROLLBACK.

BEGIN;

DO $$
DECLARE
  v_org_id     uuid := (SELECT id FROM organizations LIMIT 1);
  -- Test week far in the future — no real data should exist here.
  v_monday     date := '2030-01-07';
  v_sunday     date := '2030-01-13';
  v_tuesday    date := '2030-01-08';
  v_wednesday  date := '2030-01-09';

  -- Shared employee (used in Tests A and B)
  v_emp        uuid := gen_random_uuid();

  -- Test A fixtures: bill_vacation = true
  v_client_vac  uuid := gen_random_uuid();
  v_camp_vac    uuid := gen_random_uuid();

  -- Test B fixtures: bill_vacation = false
  v_client_novac uuid := gen_random_uuid();
  v_camp_novac   uuid := gen_random_uuid();

  -- Test C fixtures: gap warning
  v_emp_c       uuid := gen_random_uuid();
  v_client_c    uuid := gen_random_uuid();
  v_camp_c      uuid := gen_random_uuid();

  v_row  RECORD;
BEGIN

  -- ─────────────────────────────────────────────────────────────────────────
  -- Shared employee
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO employees (id, organization_id, full_name, employee_id,
                         is_active, is_system_user, daily_bill_rate)
  VALUES (v_emp, v_org_id, 'Vac Test Agent', 'TEST-VAC-001', true, false, 100);

  -- ─────────────────────────────────────────────────────────────────────────
  -- TEST A: bill_vacation = true → 1 punch + 1 vacation day = 2 billed days
  -- ─────────────────────────────────────────────────────────────────────────

  INSERT INTO clients (id, organization_id, name, prefix, is_billable, bill_vacation)
  VALUES (v_client_vac, v_org_id, 'VacBillClient_TEST', 'VBC', true, true);

  INSERT INTO campaigns (id, organization_id, client_id, name, is_active)
  VALUES (v_camp_vac, v_org_id, v_client_vac, 'VacBillCampaign', true);

  -- Assignment for the full test week (closed so Test B can add its own open-ended assignment)
  INSERT INTO employee_campaign_assignments
    (employee_id, campaign_id, start_date, end_date, organization_id)
  VALUES (v_emp, v_camp_vac, v_monday, v_sunday, v_org_id);

  -- 1 punch on Monday
  INSERT INTO time_clock (employee_id, date, clock_in)
  VALUES (v_emp, v_monday, v_monday + interval '8 hours');

  -- 1 approved paid vacation on Tuesday (not already punched)
  INSERT INTO vacation_requests
    (employee_id, campaign_id, start_date, end_date, days_requested, status, is_paid)
  VALUES (v_emp, v_camp_vac, v_tuesday, v_tuesday, 1, 'approved', true);

  SELECT days_worked INTO v_row
  FROM weekly_invoice_preview(v_monday, v_sunday)
  WHERE employee_id   = v_emp
    AND client_id     = v_client_vac
    AND is_gap_warning = false;

  ASSERT FOUND, 'Test A: no preview row found for bill_vacation client';
  ASSERT v_row.days_worked = 2,
    'Test A: expected days_worked=2 on bill_vacation client, got ' || v_row.days_worked;

  -- ─────────────────────────────────────────────────────────────────────────
  -- TEST B: bill_vacation = false → same employee + same vacation = 1 day only
  -- ─────────────────────────────────────────────────────────────────────────

  INSERT INTO clients (id, organization_id, name, prefix, is_billable, bill_vacation)
  VALUES (v_client_novac, v_org_id, 'NoVacBillClient_TEST', 'NVC', true, false);

  INSERT INTO campaigns (id, organization_id, client_id, name, is_active)
  VALUES (v_camp_novac, v_org_id, v_client_novac, 'NoVacBillCampaign', true);

  INSERT INTO employee_campaign_assignments
    (employee_id, campaign_id, start_date, organization_id)
  VALUES (v_emp, v_camp_novac, v_monday, v_org_id);

  -- NOTE: The punch and vacation request from Test A still exist —
  -- they apply regardless of client because vacation_requests.employee_id is shared.
  -- But this client has bill_vacation=false, so vacation days are NOT added.
  -- Only the Monday punch counts (within this client's assignment window).
  SELECT days_worked INTO v_row
  FROM weekly_invoice_preview(v_monday, v_sunday)
  WHERE employee_id    = v_emp
    AND client_id      = v_client_novac
    AND is_gap_warning = false;

  ASSERT FOUND, 'Test B: no preview row found for non-bill_vacation client';
  ASSERT v_row.days_worked = 1,
    'Test B: expected days_worked=1 on non-bill_vacation client, got ' || v_row.days_worked;

  -- ─────────────────────────────────────────────────────────────────────────
  -- TEST C: punch outside assignment window → gap warning row
  -- ─────────────────────────────────────────────────────────────────────────

  INSERT INTO employees (id, organization_id, full_name, employee_id,
                         is_active, is_system_user, daily_bill_rate)
  VALUES (v_emp_c, v_org_id, 'Gap Test Agent', 'TEST-GAP-001', true, false, 100);

  INSERT INTO clients (id, organization_id, name, prefix, is_billable, bill_vacation)
  VALUES (v_client_c, v_org_id, 'GapClient_TEST', 'GPC', true, false);

  INSERT INTO campaigns (id, organization_id, client_id, name, is_active)
  VALUES (v_camp_c, v_org_id, v_client_c, 'GapCampaign', true);

  -- Assignment: only Mon–Tue (window ends before Wednesday)
  INSERT INTO employee_campaign_assignments
    (employee_id, campaign_id, start_date, end_date, organization_id)
  VALUES (v_emp_c, v_camp_c, v_monday, v_tuesday, v_org_id);

  -- Punch on Wednesday — outside the assignment window
  INSERT INTO time_clock (employee_id, date, clock_in)
  VALUES (v_emp_c, v_wednesday, v_wednesday + interval '8 hours');

  SELECT * INTO v_row
  FROM weekly_invoice_preview(v_monday, v_sunday)
  WHERE employee_id    = v_emp_c
    AND client_id      = v_client_c
    AND is_gap_warning = true;

  ASSERT FOUND,
    'Test C: expected a gap warning row for the out-of-window punch on Wednesday';
  ASSERT v_wednesday::text = ANY(v_row.gap_dates),
    'Test C: expected ' || v_wednesday::text || ' in gap_dates, got: '
    || COALESCE(array_to_string(v_row.gap_dates, ', '), 'NULL');

  -- Also confirm Wednesday does NOT appear as a billed day
  SELECT days_worked INTO v_row
  FROM weekly_invoice_preview(v_monday, v_sunday)
  WHERE employee_id    = v_emp_c
    AND client_id      = v_client_c
    AND is_gap_warning = false;

  -- No normal row should exist because the agent has 0 punches within the window
  -- (Mon-Tue window, but no punches Mon or Tue)
  IF FOUND THEN
    ASSERT v_row.days_worked = 0,
      'Test C: gap day should not be in billed days, got days_worked=' || v_row.days_worked;
  END IF;

  RAISE NOTICE 'All assertions passed ✅';
END;
$$;

ROLLBACK;
