-- =============================================================================
-- LOCAL DEV SEED — fake data only, no real employee info
-- Gives a payroll run something to calculate against.
-- Safe to re-run: all inserts use ON CONFLICT DO NOTHING.
-- =============================================================================

-- Fixed UUIDs so the seed is idempotent across runs.
-- org → client → campaign → employees → assignments → shift → period → punches

DO $$
DECLARE
  v_org_id   uuid := 'a0000000-0000-0000-0000-000000000001';
  v_cli_id   uuid := 'b0000000-0000-0000-0000-000000000001';
  v_cam_id   uuid := 'c0000000-0000-0000-0000-000000000001';
  v_emp1     uuid := 'd0000000-0000-0000-0000-000000000001';
  v_emp2     uuid := 'd0000000-0000-0000-0000-000000000002';
  v_emp3     uuid := 'd0000000-0000-0000-0000-000000000003';
  v_emp4     uuid := 'd0000000-0000-0000-0000-000000000004';
  v_emp5     uuid := 'd0000000-0000-0000-0000-000000000005';
  v_shift_id uuid := 'e0000000-0000-0000-0000-000000000001';
  v_period   uuid := 'f0000000-0000-0000-0000-000000000001';
BEGIN

  -- -------------------------------------------------------------------------
  -- 1. Organization
  -- -------------------------------------------------------------------------
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org_id, 'JOI Dev Seed', 'joi-seed')
  ON CONFLICT (slug) DO UPDATE SET id = EXCLUDED.id
  RETURNING id INTO v_org_id;

  -- -------------------------------------------------------------------------
  -- 2. Client
  -- -------------------------------------------------------------------------
  INSERT INTO public.clients (id, name, prefix, bill_to_name, bill_to_address)
  VALUES (
    v_cli_id,
    'Servicios Contigo SA de CV',
    'SCT',
    'Servicios Contigo SA de CV',
    'Av. Insurgentes Sur 1234, CDMX'
  )
  ON CONFLICT (id) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- 3. Campaign
  -- -------------------------------------------------------------------------
  INSERT INTO public.campaigns (id, client_id, name)
  VALUES (v_cam_id, v_cli_id, 'Servicio al Cliente — Seed')
  ON CONFLICT (id) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- 4. Five fake employees
  --    shift_type L-V = Lunes a Viernes (Mon–Fri), matches shift below
  -- -------------------------------------------------------------------------
  INSERT INTO public.employees
    (id, employee_id, full_name, campaign_id, shift_type,
     monthly_base_salary, daily_discount_rate, kpi_bonus_amount,
     hire_date, organization_id, is_active)
  VALUES
    (v_emp1, 'SCT-001', 'Valentina Torres Ríos',      v_cam_id, 'L-V', 9200.00, 433.33, 800.00, '2025-03-10', v_org_id, true),
    (v_emp2, 'SCT-002', 'Rodrigo Mendoza Vega',        v_cam_id, 'L-V', 8800.00, 413.33, 800.00, '2025-06-01', v_org_id, true),
    (v_emp3, 'SCT-003', 'Camila Reyes Fuentes',        v_cam_id, 'L-V', 9600.00, 453.33, 900.00, '2024-11-15', v_org_id, true),
    (v_emp4, 'SCT-004', 'Alejandro Gutiérrez Luna',    v_cam_id, 'L-V', 8500.00, 400.00, 750.00, '2025-09-22', v_org_id, true),
    (v_emp5, 'SCT-005', 'Sofía Morales Castillo',      v_cam_id, 'L-V', 9000.00, 423.33, 800.00, '2026-01-05', v_org_id, true)
  ON CONFLICT (id) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- 5. Employee → campaign assignments (current, no end_date)
  -- -------------------------------------------------------------------------
  INSERT INTO public.employee_campaign_assignments
    (employee_id, campaign_id, start_date, organization_id)
  VALUES
    (v_emp1, v_cam_id, '2025-03-10', v_org_id),
    (v_emp2, v_cam_id, '2025-06-01', v_org_id),
    (v_emp3, v_cam_id, '2024-11-15', v_org_id),
    (v_emp4, v_cam_id, '2025-09-22', v_org_id),
    (v_emp5, v_cam_id, '2026-01-05', v_org_id)
  ON CONFLICT (employee_id) WHERE end_date IS NULL DO NOTHING;

  -- -------------------------------------------------------------------------
  -- 6. Shift settings — Mon–Fri 08:00–17:00, 10-min grace
  --    days_of_week: 1=Mon … 5=Fri (ISO week, matches app convention)
  -- -------------------------------------------------------------------------
  INSERT INTO public.shift_settings
    (id, campaign_id, shift_name, start_time, end_time, grace_minutes, days_of_week)
  VALUES
    (v_shift_id, v_cam_id, 'Turno L-V 08:00', '08:00', '17:00', 10, ARRAY[1,2,3,4,5])
  ON CONFLICT (id) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- 7. Payroll period — June 1–15 2026 (primera quincena, Q1)
  -- -------------------------------------------------------------------------
  INSERT INTO public.payroll_periods (id, start_date, end_date, period_type, status)
  VALUES (v_period, '2026-06-01', '2026-06-15', 'Q1', 'open')
  ON CONFLICT (id) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- 8. Mexican holiday inside the period
  --    Día del Medio Ambiente (Jun 5) — observed as puente by this company
  -- -------------------------------------------------------------------------
  INSERT INTO public.company_holidays (date, name, is_statutory)
  VALUES ('2026-06-05', 'Día Mundial del Medio Ambiente (puente)', false)
  ON CONFLICT (date) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- 9. Time-clock punches — Mon Jun 2, Tue Jun 3, Wed Jun 4 (Thu Jun 5 = holiday)
  --    All five employees clock in; emp4 is 12 min late on Jun 3.
  -- -------------------------------------------------------------------------
  INSERT INTO public.time_clock
    (employee_id, clock_in, clock_out, date, total_hours, is_late, late_minutes)
  VALUES
    -- Jun 2
    (v_emp1, '2026-06-02 08:05:00-06', '2026-06-02 17:02:00-06', '2026-06-02', 8.95, false, 0),
    (v_emp2, '2026-06-02 07:58:00-06', '2026-06-02 17:00:00-06', '2026-06-02', 9.03, false, 0),
    (v_emp3, '2026-06-02 08:00:00-06', '2026-06-02 17:00:00-06', '2026-06-02', 9.00, false, 0),
    (v_emp4, '2026-06-02 08:03:00-06', '2026-06-02 17:00:00-06', '2026-06-02', 8.95, false, 0),
    (v_emp5, '2026-06-02 08:09:00-06', '2026-06-02 17:05:00-06', '2026-06-02', 8.93, false, 0),
    -- Jun 3 (emp4 late)
    (v_emp1, '2026-06-03 08:04:00-06', '2026-06-03 17:00:00-06', '2026-06-03', 8.93, false, 0),
    (v_emp2, '2026-06-03 08:00:00-06', '2026-06-03 17:00:00-06', '2026-06-03', 9.00, false, 0),
    (v_emp3, '2026-06-03 08:02:00-06', '2026-06-03 17:00:00-06', '2026-06-03', 8.97, false, 0),
    (v_emp4, '2026-06-03 08:22:00-06', '2026-06-03 17:00:00-06', '2026-06-03', 8.63, true,  12),
    (v_emp5, '2026-06-03 07:55:00-06', '2026-06-03 17:00:00-06', '2026-06-03', 9.08, false, 0),
    -- Jun 4
    (v_emp1, '2026-06-04 08:01:00-06', '2026-06-04 17:00:00-06', '2026-06-04', 8.98, false, 0),
    (v_emp2, '2026-06-04 08:00:00-06', '2026-06-04 17:00:00-06', '2026-06-04', 9.00, false, 0),
    (v_emp3, '2026-06-04 08:00:00-06', '2026-06-04 17:00:00-06', '2026-06-04', 9.00, false, 0),
    (v_emp4, '2026-06-04 08:05:00-06', '2026-06-04 17:00:00-06', '2026-06-04', 8.92, false, 0),
    (v_emp5, '2026-06-04 08:08:00-06', '2026-06-04 17:00:00-06', '2026-06-04', 8.87, false, 0);

END $$;
