# Invoice Generator: Vacation Billing + Gap Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two invoice-generation accuracy gaps: (A) approved paid vacation days now count as billable days on clients with `bill_vacation = true`; (B) punch-days outside any assignment window are surfaced as per-agent warnings in the preview UI instead of being silently dropped.

**Architecture:** Two new Supabase migrations: one adds `clients.bill_vacation` (with Torro set to true), another rewrites both `generate_weekly_invoices` and `weekly_invoice_preview` using a LATERAL subquery to compute `days_worked` once (punches + vacation days minus double-counts) and adds a third UNION branch to `weekly_invoice_preview` that emits `is_gap_warning = true` rows for out-of-window punches. TypeScript updates extend `WeeklyPreviewRow` with two new columns (`is_gap_warning`, `gap_dates`) and derive `gap_warnings` per `ClientPreview` in `useWeeklyPreview`. The `ClientPreviewCard` UI renders an amber warning panel when gap warnings exist. Phase 3 spiff attach/detach is untouched.

**Tech Stack:** PostgreSQL PL/pgSQL, Supabase MCP (`execute_sql`, `apply_migration`), TypeScript, React 18, TanStack Query v5, shadcn/ui, sonner toasts, lucide-react.

---

## Key facts (do not re-derive)

- `generate_weekly_invoices` and `weekly_invoice_preview` live in `supabase/migrations/20260619172906_spiffs_invoicing_rpcs.sql` (and fix in `...180000_fix...`). Both are replaced via `CREATE OR REPLACE`.
- `time_clock`: columns `employee_id uuid NOT NULL`, `date date NOT NULL`, `clock_in timestamptz NOT NULL`, `clock_out timestamptz`. No `organization_id`.
- `vacation_requests`: columns `employee_id uuid NOT NULL`, `campaign_id uuid NOT NULL`, `start_date date NOT NULL`, `end_date date NOT NULL`, `days_requested int NOT NULL`, `status text NOT NULL` (values: `pending_tl|pending_hr|approved|denied|cancelled`), `is_paid boolean NOT NULL DEFAULT true`. No `organization_id`.
- `clients`: `id, name, prefix, bill_to_name, bill_to_address, subtitle, organization_id, is_billable boolean NOT NULL DEFAULT true, aliases text[], is_active boolean NOT NULL DEFAULT true`. **No `bill_vacation` yet.**
- `employees`: `employee_id text NOT NULL`, `full_name text NOT NULL`, `is_system_user boolean NOT NULL DEFAULT false`, `daily_bill_rate numeric DEFAULT 0`, `organization_id uuid NOT NULL DEFAULT my_org_id()`.
- `employee_campaign_assignments`: needs `employee_id, campaign_id, start_date, organization_id` at minimum.
- `generate_weekly_invoices` is `SECURITY DEFINER`; `weekly_invoice_preview` is NOT (uses caller's RLS).
- Current `weekly_invoice_preview` returns 13 columns. After this change: 15 (adds `is_gap_warning boolean`, `gap_dates text[]`).
- `useWeeklyPreview` in `useInvoices.ts` already filters DEV_MOCK campaigns. It must also filter gap rows from the normal lines array.
- `ClientPreviewCard` in `FacturaNueva.tsx` receives `preview: ClientPreview` and renders lines. We add a warning panel without touching skip/generate logic.
- Supabase project ref: `jpaihltkrohdqkqlbqkf`. Branch: `fix/invoice-generator-vacation-and-gaps`.

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create migration | `supabase/migrations/<ts>_clients_bill_vacation.sql` | Add `clients.bill_vacation`; set Torro=true |
| Create migration | `supabase/migrations/<ts>_invoice_generator_vacation_gaps.sql` | Rewrite `generate_weekly_invoices` + `weekly_invoice_preview` |
| Create | `supabase/tests/test_invoice_generator_vacation_gaps.sql` | 3 proof assertions (vacation x2, gap x1) |
| Modify | `src/hooks/useInvoices.ts` | `WeeklyPreviewRow` + `ClientPreview` + `useWeeklyPreview` |
| Modify | `src/pages/FacturaNueva.tsx` | Gap warning panel in `ClientPreviewCard` |

---

## Task 1: Migration — `clients.bill_vacation` column

**Files:**
- Create: `supabase/migrations/<ts>_clients_bill_vacation.sql`

- [ ] **Step 1: Create the migration file**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr"
supabase migration new clients_bill_vacation
```

Note the exact filename printed (e.g. `supabase/migrations/20260619XXXXXX_clients_bill_vacation.sql`).

- [ ] **Step 2: Write the migration SQL**

Write this exact content to the file created in Step 1. Use the Supabase MCP `apply_migration` tool to apply it (do NOT use `supabase db push` — local history is out of sync with remote).

```sql
-- Add per-client flag controlling whether approved paid vacation days count
-- as billable days in invoice generation.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS bill_vacation boolean NOT NULL DEFAULT false;

-- Torro billets vacation days. Update by name — verify spelling in production
-- before or after applying this migration.
UPDATE public.clients
  SET bill_vacation = true
  WHERE name ILIKE '%torro%';

COMMENT ON COLUMN public.clients.bill_vacation IS
  'When true, approved paid vacation days (vacation_requests.is_paid=true, status=approved)
   overlapping the invoice week are added to days_worked for per-day-billed lines.
   Days already covered by a time_clock punch are not double-counted.';
```

- [ ] **Step 3: Apply the migration via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with:
- `project_id`: `jpaihltkrohdqkqlbqkf`
- `name`: `clients_bill_vacation`
- `query`: the full SQL above

- [ ] **Step 4: Smoke-test**

Use `mcp__claude_ai_Supabase__execute_sql` with:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'clients'
  AND column_name = 'bill_vacation';
```

Expected: one row with `column_name = bill_vacation`, `data_type = boolean`, `column_default = false`.

- [ ] **Step 5: Commit**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr"
git add supabase/migrations/
git commit -m "feat(invoices): add clients.bill_vacation flag; set Torro=true"
```

---

## Task 2: Migration — rewrite `generate_weekly_invoices` + `weekly_invoice_preview`

**Files:**
- Create: `supabase/migrations/<ts>_invoice_generator_vacation_gaps.sql`

- [ ] **Step 1: Create the migration file**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr"
supabase migration new invoice_generator_vacation_gaps
```

- [ ] **Step 2: Write the migration SQL**

Write this **exact** content to the migration file. Every line matters — do not paraphrase.

```sql
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
```

- [ ] **Step 3: Apply the migration via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with:
- `project_id`: `jpaihltkrohdqkqlbqkf`
- `name`: `invoice_generator_vacation_gaps`
- `query`: the full SQL above

- [ ] **Step 4: Smoke-test both functions exist with the right column count**

```sql
-- Check weekly_invoice_preview returns 15 columns
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'weekly_invoice_preview'
ORDER BY ordinal_position;
```

Expected columns (in order): `client_id, client_prefix, client_name, employee_id, employee_code, employee_name, campaign_id, campaign_name, daily_bill_rate, days_worked, existing_invoice_id, is_flat_bill, flat_amount, is_gap_warning, gap_dates`.

```sql
-- Check generate_weekly_invoices is present
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('generate_weekly_invoices', 'weekly_invoice_preview')
ORDER BY 1;
```

Expected: two rows.

- [ ] **Step 5: Commit**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr"
git add supabase/migrations/
git commit -m "feat(invoices): vacation billing + gap detection in generator and preview RPCs"
```

---

## Task 3: DB test script — three proof assertions

**Files:**
- Create: `supabase/tests/test_invoice_generator_vacation_gaps.sql`

- [ ] **Step 1: Create the test file**

Create `supabase/tests/test_invoice_generator_vacation_gaps.sql`:

```sql
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

  -- Open-ended assignment starting at week start
  INSERT INTO employee_campaign_assignments
    (employee_id, campaign_id, start_date, organization_id)
  VALUES (v_emp, v_camp_vac, v_monday, v_org_id);

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
```

- [ ] **Step 2: Run the test via Supabase MCP**

Use `mcp__claude_ai_Supabase__execute_sql` with the full SQL above (the entire BEGIN...ROLLBACK block) against project `jpaihltkrohdqkqlbqkf`.

Expected: notice `All assertions passed ✅` followed by `ROLLBACK`. If any ASSERT fails, read the error, diagnose whether it's a test data issue or an RPC logic bug, fix the RPC migration and re-apply, then re-run.

- [ ] **Step 3: Commit**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr"
git add supabase/tests/test_invoice_generator_vacation_gaps.sql
git commit -m "test(invoices): vacation billing + gap detection proof script"
```

---

## Task 4: TypeScript — update `WeeklyPreviewRow`, `ClientPreview`, `useWeeklyPreview`

**Files:**
- Modify: `src/hooks/useInvoices.ts`

The RPC now returns 15 columns (added `is_gap_warning`, `gap_dates`). The TypeScript interface, aggregation hook, and `ClientPreview` type must all be updated.

- [ ] **Step 1: Read the current file**

Read `src/hooks/useInvoices.ts` — focus on:
- The `WeeklyPreviewRow` interface definition
- The `ClientPreview` interface definition
- The `useWeeklyPreview` function body (aggregation logic)

This is required before editing to understand the exact current structure.

- [ ] **Step 2: Update `WeeklyPreviewRow` interface**

Find the current `WeeklyPreviewRow` interface. Add two new fields at the end:

**Before (last two fields of the interface, approximately):**
```ts
  is_flat_bill: boolean;
  flat_amount: number;
}
```

**After:**
```ts
  is_flat_bill: boolean;
  flat_amount: number;
  is_gap_warning: boolean;
  gap_dates: string[] | null;
}
```

- [ ] **Step 3: Add `GapWarning` interface and update `ClientPreview`**

After the `WeeklyPreviewRow` interface, add a new interface:

```ts
export interface GapWarning {
  employee_id: string;
  employee_name: string;
  gap_dates: string[];
}
```

Then find the `ClientPreview` interface and add `gap_warnings` at the end:

**Before (last field of `ClientPreview`):**
```ts
  missing_rate_count: number;
}
```

**After:**
```ts
  missing_rate_count: number;
  gap_warnings: GapWarning[];
}
```

- [ ] **Step 4: Update `useWeeklyPreview` aggregation**

Find the `useWeeklyPreview` function. Inside the `queryFn`, after the DEV_MOCK filter, update the code to:
1. Separate gap rows from normal rows
2. Build `gap_warnings` per client in the aggregation

The current code filters DEV_MOCK and then groups rows into a Map keyed by `client_id`. Find that grouping logic and update it:

**Current pattern (find and replace this block):**
```ts
const rows = rawRows.filter(
  (r) => !(r.campaign_name ?? "").toUpperCase().startsWith("DEV_MOCK"),
);
// ... then groups all `rows` into clientMap
```

**Replace with:**
```ts
const allRows = (rawRows as WeeklyPreviewRow[]).filter(
  (r) => !(r.campaign_name ?? "").toUpperCase().startsWith("DEV_MOCK"),
);
const gapRows = allRows.filter((r) => r.is_gap_warning);
const rows = allRows.filter((r) => !r.is_gap_warning);
```

Then, inside the part where each `ClientPreview` is assembled (where `line_count`, `total_days`, `total_amount`, `missing_rate_count` are computed), add the `gap_warnings` field.

Find the object literal where `ClientPreview` is built (it has `lines`, `line_count`, etc.) and add:

```ts
gap_warnings: gapRows
  .filter((r) => r.client_id === client_id)
  .map((r) => ({
    employee_id: r.employee_id,
    employee_name: r.employee_name,
    gap_dates: r.gap_dates ?? [],
  })),
```

(Replace `client_id` with whatever variable holds the current client's id in that scope — it could be a key from the Map or a field from the first row.)

- [ ] **Step 5: TypeScript check**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. Fix any remaining references to the old interface shape if TypeScript flags them.

- [ ] **Step 6: Commit**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr"
git add src/hooks/useInvoices.ts
git commit -m "feat(invoices): extend WeeklyPreviewRow with gap warning fields; derive gap_warnings in useWeeklyPreview"
```

---

## Task 5: UI — gap warning panel in `ClientPreviewCard`

**Files:**
- Modify: `src/pages/FacturaNueva.tsx`

Add an amber warning panel at the top of `ClientPreviewCard` that appears when `preview.gap_warnings.length > 0`. Each warning lists the agent name and the specific dates outside their assignment window.

- [ ] **Step 1: Read the file**

Read `src/pages/FacturaNueva.tsx` fully, focusing on:
- The lucide-react import line (to know what icons are already imported)
- The `ClientPreviewCard` component — its props signature and the JSX structure (specifically where the card body starts, before the table)

This is required before editing.

- [ ] **Step 2: Add `AlertTriangle` to the lucide-react import (if not already there)**

Find the lucide import line. If `AlertTriangle` is not already imported, add it:

```tsx
import { ..., AlertTriangle } from "lucide-react";
```

- [ ] **Step 3: Add the gap warning panel inside `ClientPreviewCard`**

Inside `ClientPreviewCard`, find where the card content starts (just before the invoice lines table or the table container). Add this JSX block **before** the table:

```tsx
{preview.gap_warnings.length > 0 && (
  <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3">
    <div className="flex items-center gap-2 mb-1.5 text-amber-800 font-medium text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      Unmatched punches — fix assignments before generating
    </div>
    <ul className="space-y-0.5 pl-6 text-xs text-amber-700 list-disc">
      {preview.gap_warnings.map((w) => (
        <li key={w.employee_id}>
          <span className="font-medium">{w.employee_name}</span> punched on{" "}
          {w.gap_dates.join(", ")} but has no assignment covering{" "}
          {w.gap_dates.length === 1 ? "that day" : "those days"} — these will be{" "}
          <span className="font-semibold">silently dropped</span> if you generate now.
        </li>
      ))}
    </ul>
  </div>
)}
```

- [ ] **Step 4: TypeScript check**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr"
git add src/pages/FacturaNueva.tsx
git commit -m "feat(invoices): show gap warning panel in ClientPreviewCard for out-of-window punches"
```

---

## Task 6: Push branch and open PR

- [ ] **Step 1: Verify branch and auth**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr"
git branch --show-current
gh auth status
```

Expected: branch `fix/invoice-generator-vacation-and-gaps`, auth logged in. If auth fails, STOP.

- [ ] **Step 2: Show recent commits**

```bash
git log --oneline -8
```

Expected: all 5 feature commits visible.

- [ ] **Step 3: Push**

```bash
git push -u origin fix/invoice-generator-vacation-and-gaps
```

- [ ] **Step 4: Confirm push**

```bash
git log origin/fix/invoice-generator-vacation-and-gaps..HEAD --oneline
```

Expected: empty output (all commits on remote).

- [ ] **Step 5: Open PR**

```bash
gh pr create \
  --base main \
  --title "fix: invoice generator — paid vacation billing + gap detection" \
  --body "$(cat <<'EOF'
## ⚠️ Coordinate with Joe before merging — this changes invoice generation

## Summary

- **`clients.bill_vacation` flag** (default `false`): Torro set to `true`. When true, approved paid vacation days (`vacation_requests` where `status='approved'` AND `is_paid=true`) overlapping the invoice week are added to `days_worked` for per-day-billed lines. Days already covered by a time-clock punch are not double-counted.
- **`generate_weekly_invoices`**: per-day INSERT now uses a `CROSS JOIN LATERAL` to compute `days_worked` once (punches + vacation), replacing three repeated correlated subqueries. Spiff attach logic unchanged.
- **`weekly_invoice_preview`**: same vacation logic in Branch 1. New Branch 3 emits `is_gap_warning = true` rows (one per employee×client) for punch-days that fall outside ALL assignment windows — so operators can fix assignments before generating instead of silently losing those days.
- **UI (`FacturaNueva`)**: amber warning panel appears in `ClientPreviewCard` when gap warnings exist, listing the agent and specific out-of-window dates.

## What's NOT in this PR

- Retroactive fix of invoices already generated with the wrong day count
- UI for setting `bill_vacation` on the Clients admin screen (currently DB-only)

## Test plan

- [ ] Run `supabase/tests/test_invoice_generator_vacation_gaps.sql` → `All assertions passed ✅`
- [ ] Generate invoices for a week where a Torro agent has an approved paid vacation day but no punch → line shows `days_worked = N+1`
- [ ] Generate invoices for a non-bill_vacation client with the same setup → line unchanged
- [ ] Create an agent with assignment ending Tuesday, punch them on Wednesday → preview shows amber gap warning panel before generation
- [ ] Generate from a week with no gaps and no vacation → output identical to previous behavior (regression check)
- [ ] Open FacturaNueva for a normal week → no gap warnings visible (no regressions)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| `clients.bill_vacation boolean not null default false` | Task 1 |
| Set Torro = true | Task 1 (UPDATE by name ILIKE '%torro%') |
| Vacation days count for `bill_vacation` clients, within assignment window | Task 2 (`generate_weekly_invoices` LATERAL) |
| No double-counting: vacation day with a punch is not counted twice | Task 2 (`NOT EXISTS (SELECT 1 FROM time_clock tc2 ...)`) |
| Same vacation logic in preview | Task 2 (`weekly_invoice_preview` Branch 1 LATERAL) |
| Punch days outside assignment windows surfaced in preview | Task 2 (`weekly_invoice_preview` Branch 3) |
| Gap warning in `FacturaNueva` UI per-agent listing dates | Task 5 |
| Spiff handling from Phase 3 intact | Task 2 (PERFORM attach_pending_spiffs unchanged) |
| Test: bill_vacation client → 2 days | Task 3 (Test A) |
| Test: non-bill_vacation client → 1 day | Task 3 (Test B) |
| Test: out-of-window punch → gap warning | Task 3 (Test C) |
| Ship on `fix/invoice-generator-vacation-and-gaps` + PR | Task 6 |

### Type Consistency

- `GapWarning.employee_id / employee_name / gap_dates` used in Task 4 (definition) and Task 5 (JSX: `w.employee_id`, `w.employee_name`, `w.gap_dates`) — consistent.
- `ClientPreview.gap_warnings: GapWarning[]` defined in Task 4, accessed in Task 5 as `preview.gap_warnings` — consistent.
- `WeeklyPreviewRow.is_gap_warning: boolean` and `gap_dates: string[] | null` match the SQL RETURNS TABLE columns `is_gap_warning boolean` and `gap_dates text[]` — consistent.
- `is_gap_warning` filter in Task 4 uses `r.is_gap_warning` — consistent with `WeeklyPreviewRow.is_gap_warning`.

### Placeholder Scan

No TBD, no "add appropriate handling", no "similar to above" — all steps contain complete SQL and code.
