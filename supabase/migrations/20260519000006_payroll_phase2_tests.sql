-- Migration: 20260519000006_payroll_phase2_tests.sql
-- Phase 2 synthetic tests — T2.1 through T2.12
--
-- These run as a DO $$ block that ASSERTs expected values.
-- Any failure raises an exception and rolls back the entire transaction,
-- leaving the DB clean.  Run these against a staging/branch DB, not prod.
--
-- Acceptance checks covered:
--   P2.3  12 synthetic tests pass
--   P2.4  PAID-row protection (T2.10)
--   P2.5  Audit log writes on recalc (T2.11)
--   P2.6  TS preview matches DB (see comments per test)
--
-- How to run manually:
--   supabase db push  (runs all pending migrations including this file)
-- or apply directly:
--   supabase migration up --db-url <url> --file 20260519000006_payroll_phase2_tests.sql

DO $$
DECLARE
  -- ── Fixture IDs
  v_org_id       uuid;
  v_period_id    uuid;
  v_week_id      uuid;
  v_emp_id       uuid;
  v_record_id    uuid;

  -- ── Helpers
  v_total        numeric(12,2);
  v_component    numeric(12,2);
  v_audit_count  int;
  v_status       text;

BEGIN
  RAISE NOTICE '=== Phase 2 synthetic tests starting ===';

  -- ── Fixture setup ────────────────────────────────────────────────────────

  -- Grab the dev/test org (assumes at least one org exists)
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found — cannot run tests.';
  END IF;

  -- Create a test pay period
  INSERT INTO public.payroll_periods
    (period_code, year, month, half, start_date, end_date, status, organization_id)
  VALUES
    ('TEST_P2_MAY26PP1', 2026, 5, 'PP1',
     '2026-05-01'::date, '2026-05-15'::date,
     'OPEN', v_org_id)
  RETURNING id INTO v_period_id;

  -- Create a test week
  INSERT INTO public.payroll_weeks
    (period_id, week_number, week_start, week_end, status, organization_id)
  VALUES
    (v_period_id, 1, '2026-05-04'::date, '2026-05-10'::date, 'UNPAID', v_org_id)
  RETURNING id INTO v_week_id;

  -- Create a test employee with known round rates
  --   weekly_base_salary    = 5000.00  (Mon–Fri standard week)
  --   daily_salary          = 1000.00  (5000 / 5)
  --   kpi_bonus_amount      =  500.00
  --   daily_discount_rate   = 1000.00  (full-day deduction)
  --   overtime_day_pay      =  700.00
  --   sunday_bonus_amount   =  250.00
  --   vacation_premium_pct  =    0.25  (LFT Art. 80 minimum)
  INSERT INTO public.employees
    (organization_id, full_name,
     weekly_base_salary, daily_salary, kpi_bonus_amount,
     daily_discount_rate, overtime_day_pay, sunday_bonus_amount,
     vacation_premium_pct)
  VALUES
    (v_org_id, 'TEST_AGENT_P2',
     5000.00, 1000.00, 500.00,
     1000.00, 700.00, 250.00,
     0.25)
  RETURNING id INTO v_emp_id;

  -- Helper: create a clean record, run pay_calc_record, return the record id
  -- (used inline per test below)

  -- ── T2.1: Full week, KPI achieved, no deductions ─────────────────────────
  -- Expected:
  --   weekly_base=5000, kpi_bonus=500, missed_deduction=0, overtime_pay=0,
  --   sunday_pay=0, vacation_pay=0, holiday_pay=0, total_pay=5500
  INSERT INTO public.payroll_records
    (week_id, employee_id, organization_id,
     include_in_payroll, missed_days, overtime_days, sundays_worked,
     vacation_days, holiday_days, kpi_achieved, extra_bonus, partial_week_days)
  VALUES
    (v_week_id, v_emp_id, v_org_id,
     true, 0, 0, 0, 0, 0, true, 0, NULL)
  RETURNING id INTO v_record_id;

  SELECT total_pay INTO v_total FROM public.payroll_records WHERE id = v_record_id;
  ASSERT v_total = 5500.00,
    FORMAT('T2.1 FAIL: expected total_pay=5500, got %s', v_total);
  RAISE NOTICE 'T2.1 PASS: full week KPI=true, no deductions → total_pay = %', v_total;

  DELETE FROM public.payroll_records WHERE id = v_record_id;

  -- ── T2.2: Full week, KPI NOT achieved ────────────────────────────────────
  -- Expected: total_pay = 5000 (no KPI)
  INSERT INTO public.payroll_records
    (week_id, employee_id, organization_id,
     include_in_payroll, missed_days, overtime_days, sundays_worked,
     vacation_days, holiday_days, kpi_achieved, extra_bonus, partial_week_days)
  VALUES
    (v_week_id, v_emp_id, v_org_id,
     true, 0, 0, 0, 0, 0, false, 0, NULL)
  RETURNING id INTO v_record_id;

  SELECT total_pay INTO v_total FROM public.payroll_records WHERE id = v_record_id;
  ASSERT v_total = 5000.00,
    FORMAT('T2.2 FAIL: expected 5000, got %s', v_total);
  RAISE NOTICE 'T2.2 PASS: full week KPI=false → total_pay = %', v_total;

  DELETE FROM public.payroll_records WHERE id = v_record_id;

  -- ── T2.3: Full week, 2 missed days ───────────────────────────────────────
  -- missed_deduction = 2 × 1000 = 2000
  -- Expected: total_pay = 5000 + 500 - 2000 = 3500
  INSERT INTO public.payroll_records
    (week_id, employee_id, organization_id,
     include_in_payroll, missed_days, overtime_days, sundays_worked,
     vacation_days, holiday_days, kpi_achieved, extra_bonus, partial_week_days)
  VALUES
    (v_week_id, v_emp_id, v_org_id,
     true, 2, 0, 0, 0, 0, true, 0, NULL)
  RETURNING id INTO v_record_id;

  SELECT total_pay, missed_deduction
    INTO v_total, v_component
    FROM public.payroll_records WHERE id = v_record_id;
  ASSERT v_component = 2000.00,
    FORMAT('T2.3 FAIL: missed_deduction expected 2000, got %s', v_component);
  ASSERT v_total = 3500.00,
    FORMAT('T2.3 FAIL: total_pay expected 3500, got %s', v_total);
  RAISE NOTICE 'T2.3 PASS: 2 missed days → missed_deduction=%, total_pay=%',
    v_component, v_total;

  DELETE FROM public.payroll_records WHERE id = v_record_id;

  -- ── T2.4: Full week, 1 overtime day ──────────────────────────────────────
  -- overtime_pay = 1 × 700 = 700
  -- Expected: total_pay = 5000 + 500 + 700 = 6200
  INSERT INTO public.payroll_records
    (week_id, employee_id, organization_id,
     include_in_payroll, missed_days, overtime_days, sundays_worked,
     vacation_days, holiday_days, kpi_achieved, extra_bonus, partial_week_days)
  VALUES
    (v_week_id, v_emp_id, v_org_id,
     true, 0, 1, 0, 0, 0, true, 0, NULL)
  RETURNING id INTO v_record_id;

  SELECT total_pay, overtime_pay
    INTO v_total, v_component
    FROM public.payroll_records WHERE id = v_record_id;
  ASSERT v_component = 700.00,
    FORMAT('T2.4 FAIL: overtime_pay expected 700, got %s', v_component);
  ASSERT v_total = 6200.00,
    FORMAT('T2.4 FAIL: total_pay expected 6200, got %s', v_total);
  RAISE NOTICE 'T2.4 PASS: 1 overtime day → overtime_pay=%, total_pay=%',
    v_component, v_total;

  DELETE FROM public.payroll_records WHERE id = v_record_id;

  -- ── T2.5: Full week, 1 Sunday worked ─────────────────────────────────────
  -- sunday_pay = 1 × 250 = 250
  -- Expected: total_pay = 5000 + 500 + 250 = 5750
  INSERT INTO public.payroll_records
    (week_id, employee_id, organization_id,
     include_in_payroll, missed_days, overtime_days, sundays_worked,
     vacation_days, holiday_days, kpi_achieved, extra_bonus, partial_week_days)
  VALUES
    (v_week_id, v_emp_id, v_org_id,
     true, 0, 0, 1, 0, 0, true, 0, NULL)
  RETURNING id INTO v_record_id;

  SELECT total_pay, sunday_pay
    INTO v_total, v_component
    FROM public.payroll_records WHERE id = v_record_id;
  ASSERT v_component = 250.00,
    FORMAT('T2.5 FAIL: sunday_pay expected 250, got %s', v_component);
  ASSERT v_total = 5750.00,
    FORMAT('T2.5 FAIL: total_pay expected 5750, got %s', v_total);
  RAISE NOTICE 'T2.5 PASS: 1 Sunday → sunday_pay=%, total_pay=%',
    v_component, v_total;

  DELETE FROM public.payroll_records WHERE id = v_record_id;

  -- ── T2.6: Full week, 1 vacation day (LFT Art. 80) ────────────────────────
  -- vacation_pay = 1 × 1000 × 1.25 = 1250
  -- Expected: total_pay = 5000 + 500 + 1250 = 6750
  INSERT INTO public.payroll_records
    (week_id, employee_id, organization_id,
     include_in_payroll, missed_days, overtime_days, sundays_worked,
     vacation_days, holiday_days, kpi_achieved, extra_bonus, partial_week_days)
  VALUES
    (v_week_id, v_emp_id, v_org_id,
     true, 0, 0, 0, 1, 0, true, 0, NULL)
  RETURNING id INTO v_record_id;

  SELECT total_pay, vacation_pay
    INTO v_total, v_component
    FROM public.payroll_records WHERE id = v_record_id;
  ASSERT v_component = 1250.00,
    FORMAT('T2.6 FAIL: vacation_pay expected 1250, got %s', v_component);
  ASSERT v_total = 6750.00,
    FORMAT('T2.6 FAIL: total_pay expected 6750, got %s', v_total);
  RAISE NOTICE 'T2.6 PASS: 1 vacation day → vacation_pay=%, total_pay=%',
    v_component, v_total;

  DELETE FROM public.payroll_records WHERE id = v_record_id;

  -- ── T2.7: Full week, 1 holiday day (LFT Art. 75 extra premium) ───────────
  -- holiday_pay = 1 × 1000 × 2 = 2000
  -- Expected: total_pay = 5000 + 500 + 2000 = 7500
  INSERT INTO public.payroll_records
    (week_id, employee_id, organization_id,
     include_in_payroll, missed_days, overtime_days, sundays_worked,
     vacation_days, holiday_days, kpi_achieved, extra_bonus, partial_week_days)
  VALUES
    (v_week_id, v_emp_id, v_org_id,
     true, 0, 0, 0, 0, 1, true, 0, NULL)
  RETURNING id INTO v_record_id;

  SELECT total_pay, holiday_pay
    INTO v_total, v_component
    FROM public.payroll_records WHERE id = v_record_id;
  ASSERT v_component = 2000.00,
    FORMAT('T2.7 FAIL: holiday_pay expected 2000, got %s', v_component);
  ASSERT v_total = 7500.00,
    FORMAT('T2.7 FAIL: total_pay expected 7500, got %s', v_total);
  RAISE NOTICE 'T2.7 PASS: 1 holiday → holiday_pay=%, total_pay=%',
    v_component, v_total;

  DELETE FROM public.payroll_records WHERE id = v_record_id;

  -- ── T2.8: include_in_payroll = false → all calc columns = 0 ──────────────
  INSERT INTO public.payroll_records
    (week_id, employee_id, organization_id,
     include_in_payroll, missed_days, overtime_days, sundays_worked,
     vacation_days, holiday_days, kpi_achieved, extra_bonus, partial_week_days)
  VALUES
    (v_week_id, v_emp_id, v_org_id,
     false, 1, 2, 1, 1, 1, true, 500.00, NULL)
  RETURNING id INTO v_record_id;

  SELECT total_pay INTO v_total FROM public.payroll_records WHERE id = v_record_id;
  ASSERT v_total = 0.00,
    FORMAT('T2.8 FAIL: include=false → expected total_pay=0, got %s', v_total);
  -- extra_bonus input column should still hold its value
  ASSERT (SELECT extra_bonus FROM public.payroll_records WHERE id = v_record_id) = 500.00,
    'T2.8 FAIL: extra_bonus input column was modified';
  RAISE NOTICE 'T2.8 PASS: include_in_payroll=false → total_pay=0, extra_bonus preserved';

  DELETE FROM public.payroll_records WHERE id = v_record_id;

  -- ── T2.9: Partial week, 3 days, KPI + holiday (Finding 1 scenario) ───────
  -- weekly_base = 3 × 1000 = 3000
  -- kpi_bonus   = 500
  -- holiday_pay = 1 × 1000 × 2 = 2000
  -- missed_deduction = 0, vacation_pay = 0
  -- total_pay   = 3000 + 500 + 2000 = 5500
  INSERT INTO public.payroll_records
    (week_id, employee_id, organization_id,
     include_in_payroll, missed_days, overtime_days, sundays_worked,
     vacation_days, holiday_days, kpi_achieved, extra_bonus, partial_week_days)
  VALUES
    (v_week_id, v_emp_id, v_org_id,
     true, 0, 0, 0, 0, 1, true, 0, 3)
  RETURNING id INTO v_record_id;

  SELECT total_pay, weekly_base, missed_deduction, vacation_pay
    INTO v_total, v_component, v_component, v_component
    FROM public.payroll_records WHERE id = v_record_id;

  -- verify each component
  ASSERT (SELECT weekly_base FROM public.payroll_records WHERE id = v_record_id) = 3000.00,
    FORMAT('T2.9 FAIL: weekly_base expected 3000, got %s',
      (SELECT weekly_base FROM public.payroll_records WHERE id = v_record_id));
  ASSERT (SELECT missed_deduction FROM public.payroll_records WHERE id = v_record_id) = 0.00,
    FORMAT('T2.9 FAIL: missed_deduction expected 0 in partial week, got %s',
      (SELECT missed_deduction FROM public.payroll_records WHERE id = v_record_id));
  ASSERT (SELECT vacation_pay FROM public.payroll_records WHERE id = v_record_id) = 0.00,
    FORMAT('T2.9 FAIL: vacation_pay expected 0 in partial week, got %s',
      (SELECT vacation_pay FROM public.payroll_records WHERE id = v_record_id));
  ASSERT (SELECT holiday_pay FROM public.payroll_records WHERE id = v_record_id) = 2000.00,
    FORMAT('T2.9 FAIL: holiday_pay expected 2000, got %s',
      (SELECT holiday_pay FROM public.payroll_records WHERE id = v_record_id));
  ASSERT (SELECT total_pay FROM public.payroll_records WHERE id = v_record_id) = 5500.00,
    FORMAT('T2.9 FAIL: total_pay expected 5500, got %s',
      (SELECT total_pay FROM public.payroll_records WHERE id = v_record_id));
  RAISE NOTICE 'T2.9 PASS: partial week (3 days + holiday) → total_pay=%',
    (SELECT total_pay FROM public.payroll_records WHERE id = v_record_id);

  DELETE FROM public.payroll_records WHERE id = v_record_id;

  -- ── T2.10: PAID row — trigger returns OLD silently ────────────────────────
  -- Insert a PAID row directly (bypass status constraint by inserting with PAID).
  -- Then attempt to UPDATE an input column.
  -- Expect: the UPDATE is blocked by trg_payroll_records_paid_lock (raises).
  --         If somehow it reaches recalc, recalc returns OLD.
  -- We test that the update raises the expected exception.
  BEGIN
    INSERT INTO public.payroll_records
      (week_id, employee_id, organization_id,
       include_in_payroll, missed_days, kpi_achieved, extra_bonus,
       weekly_base, kpi_bonus, missed_deduction, overtime_pay,
       sunday_pay, vacation_pay, holiday_pay, total_pay, status)
    VALUES
      (v_week_id, v_emp_id, v_org_id,
       true, 0, true, 0,
       5000.00, 500.00, 0.00, 0.00,
       0.00, 0.00, 0.00, 5500.00, 'PAID')
    RETURNING id INTO v_record_id;

    -- This UPDATE should raise — trg_payroll_records_paid_lock fires first
    UPDATE public.payroll_records SET missed_days = 1 WHERE id = v_record_id;

    -- If we get here, the lock didn't fire — fail
    RAISE EXCEPTION 'T2.10 FAIL: PAID row UPDATE was not blocked';

  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      RAISE NOTICE 'T2.10 PASS: PAID row UPDATE raised 23514 as expected';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'T2.10 FAIL: unexpected exception: % %', SQLSTATE, SQLERRM;
  END;

  DELETE FROM public.payroll_records WHERE id = v_record_id;

  -- ── T2.11: Audit log — one new row written per recalc ────────────────────
  SELECT COUNT(*) INTO v_audit_count FROM public.payroll_audit_log
  WHERE action = 'RECALC';

  INSERT INTO public.payroll_records
    (week_id, employee_id, organization_id,
     include_in_payroll, missed_days, kpi_achieved, extra_bonus, partial_week_days)
  VALUES
    (v_week_id, v_emp_id, v_org_id,
     true, 0, true, 0, NULL)
  RETURNING id INTO v_record_id;

  -- Trigger should have written one audit row on INSERT
  ASSERT (
    SELECT COUNT(*) FROM public.payroll_audit_log
    WHERE action = 'RECALC' AND record_id = v_record_id
  ) = 1,
    'T2.11 FAIL: expected 1 audit row after INSERT, got 0';

  -- Update an input → should write another audit row
  UPDATE public.payroll_records SET missed_days = 1 WHERE id = v_record_id;

  ASSERT (
    SELECT COUNT(*) FROM public.payroll_audit_log
    WHERE action = 'RECALC' AND record_id = v_record_id
  ) = 2,
    'T2.11 FAIL: expected 2 audit rows after UPDATE, got fewer';

  RAISE NOTICE 'T2.11 PASS: audit log wrote 2 rows (1 INSERT + 1 UPDATE)';
  DELETE FROM public.payroll_records WHERE id = v_record_id;

  -- ── T2.12: Extra bonus flows through correctly ────────────────────────────
  -- Full week, KPI=true, extra_bonus=1500
  -- Expected: total_pay = 5000 + 500 + 1500 = 7000
  INSERT INTO public.payroll_records
    (week_id, employee_id, organization_id,
     include_in_payroll, missed_days, kpi_achieved, extra_bonus, partial_week_days)
  VALUES
    (v_week_id, v_emp_id, v_org_id,
     true, 0, true, 1500.00, NULL)
  RETURNING id INTO v_record_id;

  SELECT total_pay INTO v_total FROM public.payroll_records WHERE id = v_record_id;
  ASSERT v_total = 7000.00,
    FORMAT('T2.12 FAIL: expected total_pay=7000, got %s', v_total);
  RAISE NOTICE 'T2.12 PASS: extra_bonus=1500 → total_pay=%', v_total;

  DELETE FROM public.payroll_records WHERE id = v_record_id;

  -- ── Teardown ──────────────────────────────────────────────────────────────
  DELETE FROM public.employees     WHERE id = v_emp_id;
  DELETE FROM public.payroll_weeks WHERE id = v_week_id;
  DELETE FROM public.payroll_periods WHERE id = v_period_id;

  RAISE NOTICE '=== All Phase 2 synthetic tests passed (T2.1–T2.12) ===';

END;
$$;
