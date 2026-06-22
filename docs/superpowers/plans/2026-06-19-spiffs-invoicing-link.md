# Spiffs Invoicing Link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `public.spiffs` into invoice generation so pending spiffs are automatically attached to invoice lines on generation/draft-open, detached on unlock, and the old CSV-upload path is retired.

**Architecture:** Two new SECURITY DEFINER RPCs (`attach_pending_spiffs`, `detach_invoice_spiffs`) handle all DB-side linkage; `generate_weekly_invoices` gains a single `PERFORM` call after each invoice is created; `FacturaDetalle` auto-attaches on draft load and detaches on unlock via two new tanstack-query mutations; `FacturaNueva` drops `stagedSpiffs`, `PreviewSpiffUploadDialog`, and `InlineSpiffEditor`; `BulkSpiffUploadDialog` is removed from its consumer.

**Tech Stack:** PostgreSQL PLPGSQL (SECURITY DEFINER), tanstack-query v5, React 18, shadcn/ui, Supabase PostgREST, sonner toasts.

---

## Key facts (do not re-derive)

- `generate_weekly_invoices(p_monday, p_sunday)` lives as a SQL PLPGSQL function (not an edge function). It inserts invoices then lines with `spiffs = 0`. We add one `PERFORM` call after each invoice is created.
- `invoice_lines` columns relevant here: `id, invoice_id, employee_id, days_worked, unit_price, holiday_days, spiffs, total, total_price, is_flat_total`.
- `total = days_worked * unit_price + holiday_days * unit_price * 2`
- `total_price = total + spiffs` (for non-flat lines)
- `spiffs` table: `id, organization_id, employee_id, client_id, spiff_date, amount_usd, status ('pending'|'billed'|'void'), invoice_line_id, billed_at, created_by, source, created_at`.
- Both new RPCs must be SECURITY DEFINER with explicit `organization_id = my_org_id()` guards (bypasses RLS, so org check is manual).
- Guard: `attach_pending_spiffs` only operates on `status = 'draft'` invoices; `detach_invoice_spiffs` rejects `status = 'paid'`.
- Idempotency: `attach_pending_spiffs` only selects `status = 'pending'` spiffs, so re-running never double-attaches.
- `invoices` has `organization_id` (from MT migrations) with `DEFAULT my_org_id()`.

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create migration | `supabase/migrations/<ts>_spiffs_invoicing_rpcs.sql` | `attach_pending_spiffs` + `detach_invoice_spiffs` + updated `generate_weekly_invoices` |
| Create | `supabase/tests/test_spiffs_invoicing.sql` | Idempotency + detach proof |
| Modify | `src/hooks/useInvoices.ts` | `AttachSpiffsResult` interface + `useAttachSpiffs` + `useDetachSpiffs` |
| Modify | `src/pages/FacturaDetalle.tsx` | Auto-attach on draft load; detach before unlock |
| Modify | `src/pages/FacturaNueva.tsx` | Remove `stagedSpiffs`, `PreviewSpiffUploadDialog`, `InlineSpiffEditor` |
| Delete consumer | wherever `BulkSpiffUploadDialog` is imported | Remove import + JSX |

---

## Task 1: Migration — `attach_pending_spiffs`, `detach_invoice_spiffs`, updated `generate_weekly_invoices`

**Files:**
- Create: `supabase/migrations/<ts>_spiffs_invoicing_rpcs.sql` (via `supabase migration new spiffs_invoicing_rpcs`)

- [ ] **Step 1: Create the migration file**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr"
supabase migration new spiffs_invoicing_rpcs
```

This prints a filename like `supabase/migrations/20260619XXXXXX_spiffs_invoicing_rpcs.sql`. Use that exact path for the next step.

- [ ] **Step 2: Write the migration SQL**

Replace the file's content:

```sql
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
  -- Org-scoped lookup (SECURITY DEFINER bypasses RLS — check manually)
  SELECT id, client_id, week_start, week_end, status, organization_id
    INTO v_inv
    FROM invoices
   WHERE id = p_invoice_id
     AND organization_id = my_org_id();

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
     WHERE id = ANY(v_spiff_ids);

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
  SELECT id, status, organization_id
    INTO v_inv
    FROM invoices
   WHERE id = p_invoice_id
     AND organization_id = my_org_id();

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
```

- [ ] **Step 3: Apply the migration**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr"
supabase db push --include-all 2>&1 | tail -20
```

Expected: migration applied successfully, no errors.

- [ ] **Step 4: Smoke-test both functions exist**

```bash
supabase db query --project-ref jpaihltkrohdqkqlbqkf \
  "SELECT routine_name FROM information_schema.routines WHERE routine_schema='public' AND routine_name IN ('attach_pending_spiffs','detach_invoice_spiffs') ORDER BY 1"
```

Expected: two rows returned.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(spiffs): attach_pending_spiffs + detach_invoice_spiffs RPCs; wire generate_weekly_invoices"
```

---

## Task 2: DB idempotency test script

**Files:**
- Create: `supabase/tests/test_spiffs_invoicing.sql`

This script proves: generate → attach → re-attach is a no-op, and unlock → detach restores pending. It creates isolated test data, runs assertions, then rolls back. Run with `supabase db query --file` (it's a manual verification tool, not a migration).

- [ ] **Step 1: Create the test script**

Create `supabase/tests/test_spiffs_invoicing.sql`:

```sql
-- Idempotency + detach proof for spiffs invoicing link.
-- Safe to run: everything is in a BEGIN / ROLLBACK block.
-- Run: supabase db query --project-ref jpaihltkrohdqkqlbqkf --file supabase/tests/test_spiffs_invoicing.sql
-- Expected output: all ASSERT lines pass, final ROLLBACK printed.

BEGIN;

-- ── Fixtures ───────────────────────────────────────────────────────────────

-- We need: org, client, employee, campaign, campaign_assignment,
--          invoice, invoice_line, and spiff rows.
-- Use gen_random_uuid() everywhere so we don't collide with real rows.

DO $$
DECLARE
  v_org_id   uuid := (SELECT id FROM organizations LIMIT 1);  -- real org
  v_client   uuid := gen_random_uuid();
  v_emp      uuid := gen_random_uuid();
  v_camp     uuid := gen_random_uuid();
  v_inv      uuid;
  v_line     uuid;
  v_spiff1   uuid := gen_random_uuid();
  v_spiff2   uuid := gen_random_uuid();
  v_res      RECORD;
BEGIN
  -- Minimal client
  INSERT INTO clients (id, organization_id, name, prefix, is_billable)
  VALUES (v_client, v_org_id, 'TEST_CLIENT_SPIFF_PROOF', 'TST', true);

  -- Minimal employee (no login needed)
  INSERT INTO employees (id, organization_id, full_name, employee_id, is_active, is_system_user, daily_bill_rate)
  VALUES (v_emp, v_org_id, 'Test Spiff Agent', 'TST-999', true, false, 100);

  -- Campaign linking employee to client
  INSERT INTO campaigns (id, organization_id, client_id, name, is_active)
  VALUES (v_camp, v_org_id, v_client, 'TST Campaign', true);

  INSERT INTO employee_campaign_assignments (employee_id, campaign_id, start_date, organization_id)
  VALUES (v_emp, v_camp, '2026-01-01', v_org_id);

  -- Draft invoice for week 2026-06-16 → 2026-06-22
  INSERT INTO invoices (id, organization_id, client_id, invoice_number, week_number, week_start, week_end, due_date, status, submitted_on)
  VALUES (gen_random_uuid(), v_org_id, v_client, 'TST-001', 25, '2026-06-16', '2026-06-22', '2026-06-26', 'draft', CURRENT_DATE)
  RETURNING id INTO v_inv;

  -- One non-flat line for the test employee
  INSERT INTO invoice_lines (id, invoice_id, employee_id, agent_name, days_worked, unit_price, total, spiffs, total_price, is_flat_total, holiday_days)
  VALUES (gen_random_uuid(), v_inv, v_emp, 'Test Spiff Agent', 5, 100, 500, 0, 500, false, 0)
  RETURNING id INTO v_line;

  -- Two pending spiffs
  INSERT INTO spiffs (id, organization_id, employee_id, client_id, spiff_date, amount_usd, reason, status, source, created_at)
  VALUES
    (v_spiff1, v_org_id, v_emp, v_client, '2026-06-17', 25.00, 'PB 6', 'pending', 'app', NOW()),
    (v_spiff2, v_org_id, v_emp, v_client, '2026-06-18', 15.00, '1ST PLACE', 'pending', 'app', NOW());

  -- ── TEST 1: attach marks spiffs billed, updates line ───────────────────
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

  -- Both spiffs should be billed
  ASSERT (SELECT COUNT(*) FROM spiffs WHERE id IN (v_spiff1, v_spiff2) AND status = 'billed') = 2,
    'both spiffs should be billed';
  ASSERT (SELECT COUNT(*) FROM spiffs WHERE id IN (v_spiff1, v_spiff2) AND invoice_line_id = v_line) = 2,
    'both spiffs should link to the line';

  -- ── TEST 2: re-attach is a no-op ───────────────────────────────────────
  SELECT * INTO v_res FROM attach_pending_spiffs(v_inv);

  ASSERT v_res.attached_count = 0,
    'idempotency: second attach should find 0 pending, got ' || v_res.attached_count;
  ASSERT (SELECT spiffs FROM invoice_lines WHERE id = v_line) = 40,
    'idempotency: line.spiffs should still be 40';

  -- ── TEST 3: detach restores pending ────────────────────────────────────
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
```

- [ ] **Step 2: Run the test**

```bash
supabase db query --project-ref jpaihltkrohdqkqlbqkf --file supabase/tests/test_spiffs_invoicing.sql 2>&1
```

Expected output contains: `All assertions passed ✅` and `ROLLBACK`.

If any ASSERT fails, read the error, fix the RPC in the migration, re-push, and re-run.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/test_spiffs_invoicing.sql
git commit -m "test(spiffs): idempotency + detach proof script"
```

---

## Task 3: Add `useAttachSpiffs` and `useDetachSpiffs` to `useInvoices.ts`

**Files:**
- Modify: `src/hooks/useInvoices.ts`

- [ ] **Step 1: Add the interface and two hooks at the bottom of `useInvoices.ts`**

Append after the last export in the file:

```ts
/* ----------------------------------------------------------------- */
/*  Spiff attachment / detachment                                      */
/* ----------------------------------------------------------------- */

export interface AttachSpiffsResult {
  attached_count: number;
  attached_total_usd: number;
  orphan_count: number;
}

export interface DetachSpiffsResult {
  detached_count: number;
  detached_total_usd: number;
}

/**
 * Attach pending spiffs for a draft invoice's client + week to
 * the matching agent lines. Idempotent — safe to call any time.
 * Invalidates ["invoice", invoiceId] on success.
 */
export function useAttachSpiffs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string): Promise<AttachSpiffsResult> => {
      const { data, error } = await supabase.rpc("attach_pending_spiffs", {
        p_invoice_id: invoiceId,
      });
      if (error) throw error;
      // RPC returns a set-returning function; result is an array with one row.
      return (data as AttachSpiffsResult[])[0] ?? { attached_count: 0, attached_total_usd: 0, orphan_count: 0 };
    },
    onSuccess: (_result, invoiceId) => {
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
  });
}

/**
 * Detach all billed spiffs from an invoice's lines, resetting them
 * to 'pending'. Called before unlocking a sent invoice to draft.
 * Guards server-side against paid invoices.
 */
export function useDetachSpiffs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string): Promise<DetachSpiffsResult> => {
      const { data, error } = await supabase.rpc("detach_invoice_spiffs", {
        p_invoice_id: invoiceId,
      });
      if (error) throw error;
      return (data as DetachSpiffsResult[])[0] ?? { detached_count: 0, detached_total_usd: 0 };
    },
    onSuccess: (_result, invoiceId) => {
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["spiffs-week"] });
    },
  });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useInvoices.ts
git commit -m "feat(spiffs): useAttachSpiffs + useDetachSpiffs hooks"
```

---

## Task 4: Wire `FacturaDetalle.tsx` — auto-attach on draft, detach on unlock

**Files:**
- Modify: `src/pages/FacturaDetalle.tsx`

Two wiring points:
1. **Auto-attach**: `useEffect` fires when invoice loads as 'draft', calls `attachSpiffs.mutate(invoice.id)`. Toast only if spiffs were actually attached.
2. **Detach on unlock**: in the AlertDialog confirm handler, `await detachSpiffs.mutateAsync(invoice.id)` before `handleStatusChange("draft")`.

- [ ] **Step 1: Add imports**

In `src/pages/FacturaDetalle.tsx`, add `useEffect` to the React import:

```tsx
import { useMemo, useRef, useState, useEffect } from "react";
```

Add the two new hooks to the `useInvoices` import:

```tsx
import {
  useInvoice,
  useInvoicePunches,
  useUpdateInvoiceStatus,
  useUpdateInvoiceLine,
  useDeleteInvoiceLine,
  useAddInvoiceLine,
  useAttachSpiffs,
  useDetachSpiffs,
  fmtUSD,
  type InvoiceLine,
} from "@/hooks/useInvoices";
```

- [ ] **Step 2: Add hook calls inside `FacturaDetalle`**

Inside the `FacturaDetalle` component function, after `const updateStatus = useUpdateInvoiceStatus();`, add:

```tsx
const attachSpiffs = useAttachSpiffs();
const detachSpiffs = useDetachSpiffs();

// Auto-attach pending spiffs whenever a draft invoice loads.
// Idempotent — re-running is safe. Only fires once per invoice.id.
const attachedForRef = useRef<string | null>(null);
useEffect(() => {
  if (!invoice || invoice.status !== "draft") return;
  if (attachedForRef.current === invoice.id) return;
  attachedForRef.current = invoice.id;
  attachSpiffs.mutate(invoice.id, {
    onSuccess: (result) => {
      if (result.attached_count > 0) {
        toast.success(
          `${result.attached_count} spiff${result.attached_count !== 1 ? "s" : ""} attached ($${Number(result.attached_total_usd).toFixed(2)})`
        );
      }
      if (result.orphan_count > 0) {
        toast.warning(
          `${result.orphan_count} pending spiff${result.orphan_count !== 1 ? "s" : ""} couldn't be matched — the agent may not have a line on this invoice`
        );
      }
    },
  });
}, [invoice?.id, invoice?.status]);
```

- [ ] **Step 3: Update the unlock confirm handler**

Find the AlertDialog unlock section (around line 328–349). Replace the `AlertDialogAction` onClick with an async handler:

**Current code:**
```tsx
<AlertDialogAction
  onClick={() => {
    handleStatusChange("draft");
    setShowUnlockConfirm(false);
  }}
>
  Unlock
</AlertDialogAction>
```

**Replace with:**
```tsx
<AlertDialogAction
  onClick={async () => {
    try {
      await detachSpiffs.mutateAsync(invoice.id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to detach spiffs");
      setShowUnlockConfirm(false);
      return;
    }
    handleStatusChange("draft");
    setShowUnlockConfirm(false);
  }}
  disabled={detachSpiffs.isPending}
>
  {detachSpiffs.isPending ? "Detaching…" : "Unlock"}
</AlertDialogAction>
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/FacturaDetalle.tsx
git commit -m "feat(spiffs): auto-attach on draft load; detach before unlock"
```

---

## Task 5: Remove CSV spiff upload from `FacturaNueva.tsx`

**Files:**
- Modify: `src/pages/FacturaNueva.tsx`

Remove: `stagedSpiffs` state, `InlineSpiffEditor` component, `PreviewSpiffUploadDialog` usage, all `stagedSpiffs` references in `handleGenerate`, spiff-related props in `ClientPreviewCard`, and the "Staged spiffs" summary chip. Keep: `skippedEmployeeIds` logic (unrelated).

- [ ] **Step 1: Remove the `PreviewSpiffUploadDialog` import**

In `src/pages/FacturaNueva.tsx`, delete this import line:

```tsx
import { PreviewSpiffUploadDialog } from "@/components/PreviewSpiffUploadDialog";
```

- [ ] **Step 2: Remove `stagedSpiffs` state and related handlers**

Find and delete these lines in the component body:

```tsx
// Spiffs staged in memory before generation. Keyed by employees.id (UUID).
// Applied to invoice lines AFTER the generate RPC creates them.
const [stagedSpiffs, setStagedSpiffs] = useState<Map<string, number>>(new Map());
```

Also delete `stagedSpiffsTotal` and `skippedAmount` computations that reference `stagedSpiffs`:

```tsx
const stagedSpiffsTotal = Array.from(stagedSpiffs.values()).reduce((s, v) => s + v, 0);
// Subtract the projected value of any rows the user has skipped ...
const skippedAmount = eligible.reduce((sum, c) => { ... }, 0);
const totalAcrossEligible = eligible.reduce((s, c) => s + c.total_amount, 0) + stagedSpiffsTotal - skippedAmount;
```

Replace `totalAcrossEligible` with a simpler version:

```tsx
const skippedAmount = eligible.reduce((sum, c) => {
  return sum + c.lines.reduce((s, l) => {
    if (!skippedEmployeeIds.has(l.employee_id)) return s;
    if (l.is_flat_bill) return s + Number(l.flat_amount);
    return s + Number(l.days_worked) * Number(l.daily_bill_rate);
  }, 0);
}, 0);
const totalAcrossEligible = eligible.reduce((s, c) => s + c.total_amount, 0) - skippedAmount;
```

- [ ] **Step 3: Remove `clearSpiffsOnWeekChange` and update callers**

Delete the entire `clearSpiffsOnWeekChange` function:

```tsx
// When the week changes, the staged spiffs no longer apply.
function clearSpiffsOnWeekChange() {
  if (stagedSpiffs.size > 0) {
    setStagedSpiffs(new Map());
    toast.info("Cleared staged spiffs (week changed).");
  }
  if (skippedEmployeeIds.size > 0) setSkippedEmployeeIds(new Set());
}
```

Update `shiftWeek`, `jumpToToday`, and `onPickDate` to only clear `skippedEmployeeIds`:

```tsx
function shiftWeek(direction: -1 | 1) {
  if (skippedEmployeeIds.size > 0) setSkippedEmployeeIds(new Set());
  const m = parseLocalDate(monday);
  m.setDate(m.getDate() + 7 * direction);
  setMonday(getWeekRange(m).monday);
}

function jumpToToday() {
  if (skippedEmployeeIds.size > 0) setSkippedEmployeeIds(new Set());
  setMonday(lastCompletedWeek().monday);
}

function onPickDate(d: string) {
  if (!d) return;
  if (skippedEmployeeIds.size > 0) setSkippedEmployeeIds(new Set());
  setMonday(getWeekRange(d).monday);
}
```

- [ ] **Step 4: Remove staged-spiffs block in `handleGenerate`**

Inside `handleGenerate`, delete the entire `// Apply any staged spiffs` block (lines 151–181):

```tsx
// Apply any staged spiffs to the newly-created invoice lines.
let spiffsApplied = 0;
if (result.length > 0 && stagedSpiffs.size > 0) {
  // ... entire block
  spiffsApplied++;
}
```

Also remove references in the toast:
- Remove `if (spiffsApplied > 0) extras.push(...)` line
- Remove `+ stagedSpiffsTotal` from `totalDollars`
- Remove `setStagedSpiffs(new Map())` from the success cleanup

The cleaned `handleGenerate` success section:
```tsx
const totalDollars = result.reduce((s, r) => s + Number(r.total_amount), 0) - skippedAmount;
const draftsRemaining = result.length - emptyInvoicesDeleted;
const extras: string[] = [];
if (skippedDeleted > 0) extras.push(`${skippedDeleted} line${skippedDeleted === 1 ? "" : "s"} skipped`);
if (emptyInvoicesDeleted > 0) extras.push(`${emptyInvoicesDeleted} empty draft${emptyInvoicesDeleted === 1 ? "" : "s"} removed`);
const extrasStr = extras.length > 0 ? `, ${extras.join(", ")}` : "";
toast.success(
  result.length === 0
    ? "Nothing to generate — all clients already have invoices for this week."
    : `Generated ${draftsRemaining} ${draftsRemaining === 1 ? "draft" : "drafts"} (${totalDollars.toLocaleString("en-US", { style: "currency", currency: "USD" })} total)${extrasStr}. Review and send.`
);
setSkippedEmployeeIds(new Set());
navigate("/facturas");
```

- [ ] **Step 5: Remove `PreviewSpiffUploadDialog` JSX and the "Staged spiffs" stat chip**

In the JSX, remove the `<PreviewSpiffUploadDialog ... />` button block:

```tsx
{preview.length > 0 && eligible.length > 0 && (
  <PreviewSpiffUploadDialog
    preview={preview}
    weekStart={monday}
    weekEnd={sunday}
    stagedSpiffs={stagedSpiffs}
    onApply={setStagedSpiffs}
  />
)}
```

In the Summary card, remove the "Staged spiffs" stat chip:

```tsx
<Stat
  label="Staged spiffs"
  value={stagedSpiffs.size > 0 ? `${stagedSpiffs.size} · ${fmtUSD(stagedSpiffsTotal)}` : "—"}
/>
```

- [ ] **Step 6: Update `ClientPreviewCard` props and internals**

Remove `stagedSpiffs` and `onUpdateSpiff` from the `ClientPreviewCard` interface and calls:

**Old call:**
```tsx
<ClientPreviewCard
  key={c.client_id}
  preview={c}
  stagedSpiffs={stagedSpiffs}
  onUpdateSpiff={(empId, amount) => { ... }}
  skippedEmployeeIds={skippedEmployeeIds}
  onToggleSkip={toggleSkip}
/>
```

**New call:**
```tsx
<ClientPreviewCard
  key={c.client_id}
  preview={c}
  skippedEmployeeIds={skippedEmployeeIds}
  onToggleSkip={toggleSkip}
/>
```

Update the `ClientPreviewCard` component signature — remove `stagedSpiffs` and `onUpdateSpiff` params, and remove the `clientSpiffs`, `clientSpiffsTotal`, and spiff-related subtotal/display logic.

Remove from the table: the `<InlineSpiffEditor>` cell and the "Spiff" column header. Remove `<TableHead className="text-right">Spiff</TableHead>` and the `<TableCell>` containing `<InlineSpiffEditor .../>`.

- [ ] **Step 7: Delete the `InlineSpiffEditor` component**

Delete the entire `InlineSpiffEditor` function (approximately lines 686–757).

- [ ] **Step 8: Remove unused lucide icons**

If `Sparkles` is no longer used elsewhere in the file after the cleanup, remove it from the lucide import. Check: it's used in the Generate button `<Sparkles className="mr-2 h-4 w-4" />` — keep it.

Remove `RotateCcw` from the lucide import if the only usage was in the spiff-related code. Check: it's used in the Skip button (`<RotateCcw className="h-3.5 w-3.5" />`  in `ClientPreviewCard`) — keep it.

- [ ] **Step 9: Verify TypeScript**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. Fix any remaining stagedSpiffs references if TypeScript flags them.

- [ ] **Step 10: Commit**

```bash
git add src/pages/FacturaNueva.tsx
git commit -m "feat(spiffs): retire stagedSpiffs / CSV upload path from FacturaNueva"
```

---

## Task 6: Remove `BulkSpiffUploadDialog` from its consumer

**Files:**
- Find consumer (grep first), then modify it and optionally the component file

`BulkSpiffUploadDialog` does bulk CSV spiff upload to existing invoices via the `import-spiffs` edge function. We stop calling it; the component file stays but its consumer is cleaned up. The edge function stays deployed (per spec).

- [ ] **Step 1: Find all consumers**

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr"
grep -rn "BulkSpiffUploadDialog" src/ --include="*.tsx" --include="*.ts"
```

Note every file that imports or renders `BulkSpiffUploadDialog`.

- [ ] **Step 2: Remove from each consumer**

For each file found:
- Remove the import line: `import { BulkSpiffUploadDialog } from "@/components/BulkSpiffUploadDialog";`
- Remove the JSX usage: `<BulkSpiffUploadDialog ... />`
- Remove any props/state that only existed to support it (e.g., a `showBulkSpiff` boolean)
- Run `npx tsc --noEmit` to confirm no leftover references

- [ ] **Step 3: Add deprecation comment to the component file**

At the top of `src/components/BulkSpiffUploadDialog.tsx`, add:

```tsx
/**
 * @deprecated No longer used. Spiffs are now entered via /spiffs (TL entry)
 * and attached to invoices automatically via attach_pending_spiffs().
 * The import-spiffs edge function this called is also retired (still deployed
 * but no longer invoked). Delete this file in a follow-up cleanup.
 */
```

At the top of `src/components/PreviewSpiffUploadDialog.tsx`, add:

```tsx
/**
 * @deprecated No longer used. See BulkSpiffUploadDialog for context.
 * Delete this file in a follow-up cleanup.
 */
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat(spiffs): remove BulkSpiffUploadDialog consumer; deprecate CSV upload components"
```

---

## Task 7: Push branch and open PR

- [ ] **Step 1: Create and switch to branch** (if not already on it)

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr"
git checkout -b feat/spiffs-invoicing-link
```

(If you've been committing to a detached or wrong branch, cherry-pick commits onto this branch before continuing.)

- [ ] **Step 2: Verify auth**

```bash
gh auth status
```

Expected: logged in. Stop and report if not.

- [ ] **Step 3: Push**

```bash
git push -u origin feat/spiffs-invoicing-link
```

- [ ] **Step 4: Confirm push**

```bash
git log origin/feat/spiffs-invoicing-link..HEAD --oneline
```

Expected: empty (all commits on remote).

- [ ] **Step 5: Open PR**

```bash
gh pr create \
  --base main \
  --title "feat: spiffs invoicing link (Phase 3)" \
  --body "$(cat <<'EOF'
## Summary

- **Two new SECURITY DEFINER RPCs** (`attach_pending_spiffs`, `detach_invoice_spiffs`) link `public.spiffs` rows to `invoice_lines`
- **`generate_weekly_invoices`** now calls `attach_pending_spiffs` after each invoice is created — pending spiffs auto-attach at generation time
- **`FacturaDetalle`** auto-attaches on every draft load (picks up spiffs entered after generation); detaches before "Unlock to Edit" so spiff state is cleanly reset
- **`FacturaNueva`** drops the in-memory `stagedSpiffs` map, `PreviewSpiffUploadDialog`, and `InlineSpiffEditor` — no more CSV upload at generation time
- **`BulkSpiffUploadDialog`** removed from its consumer; component files deprecated (not deleted — easy cleanup PR)
- **DB idempotency proof** script in `supabase/tests/test_spiffs_invoicing.sql`

## What's NOT in this PR

- Phase 4: seed historical spiffs from the Google Sheet (one-time migration)
- Deletion of `BulkSpiffUploadDialog.tsx` / `PreviewSpiffUploadDialog.tsx` files (deprecated inline, delete in follow-up)
- `import-spiffs` edge function deletion (stays deployed, no longer called)

## Guardrails implemented

- `attach_pending_spiffs` guards `status = 'draft'` — never touches sent/paid invoices
- `detach_invoice_spiffs` guards `status != 'paid'` — paid invoices locked
- Idempotency: only picks `status = 'pending'` spiffs; re-run attaches 0
- Orphan reporting: returns `orphan_count` when spiffs exist but agent has no line (shown as warning toast)

## Test plan

- [ ] Generate invoices for a week where pending spiffs exist in `public.spiffs` → lines show non-zero spiff amounts
- [ ] Open the generated draft → toast if additional spiffs were picked up since generation
- [ ] Unlock a sent invoice → spiffs reset to pending, invoice lines recomputed to 0 spiffs
- [ ] Re-lock (mark sent) → re-opening as draft re-attaches current pending spiffs
- [ ] Billed spiff: Void button absent on TL Spiffs page for billed row
- [ ] Run `supabase/tests/test_spiffs_invoicing.sql` → `All assertions passed ✅`
- [ ] `/facturas/nueva` — no CSV upload button, no Spiff column in preview table, no staged spiffs chip

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| `attach_pending_spiffs` RPC — find pending spiffs by client+week+line | Task 1 |
| Per-employee: `spiffs = SUM`, recompute `total` + `total_price` | Task 1 (SQL UPDATE) |
| Mark each attached spiff `status='billed'`, set `invoice_line_id`, `billed_at` | Task 1 |
| Idempotent — only touches `pending` spiffs | Task 1 (WHERE status='pending') |
| Return summary: attached count, total, orphans | Task 1 (RETURNS TABLE) |
| `detach_invoice_spiffs` RPC — reverse: reset to pending, zero line spiffs | Task 1 |
| `generate_weekly_invoices` calls `attach_pending_spiffs` after creation | Task 1 (PERFORM) |
| `FacturaDetalle`: call `attach_pending_spiffs` when opening draft | Task 4 (useEffect) |
| `FacturaDetalle`: call `detach_invoice_spiffs` on unlock | Task 4 (AlertDialogAction) |
| Remove `BulkSpiffUploadDialog` + `PreviewSpiffUploadDialog` from UI | Tasks 5–6 |
| Remove `stagedSpiffs` in-memory flow from `FacturaNueva` | Task 5 |
| Deprecate `import-spiffs` edge function (stop calling; leave deployed) | Task 6 (consumer removed) |
| A billed spiff is locked (TL entry UI already blocks non-pending) | ✅ Already done in Phase 2 |
| Do NOT modify paid/sent invoices | Task 1 (status guard) |
| DB test: generate→attach→re-attach=no-op, unlock→detach restores pending | Task 2 |
| Ship on `feat/spiffs-invoicing-link` + open PR | Task 7 |

### Type Consistency

- `AttachSpiffsResult.attached_count / attached_total_usd / orphan_count` matches the SQL `RETURNS TABLE` column names exactly.
- `DetachSpiffsResult.detached_count / detached_total_usd` matches.
- `useAttachSpiffs` returns `AttachSpiffsResult` (unwrapped from array); used in `FacturaDetalle` with `result.attached_count` — consistent.
- `detachSpiffs.mutateAsync(invoice.id)` — `invoice.id` is `string`; hook param type is `string` — consistent.
