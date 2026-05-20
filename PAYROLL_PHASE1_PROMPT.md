# Sonnet Prompt — JOI Payroll Phase 1 (Schema + RLS Foundation)

> **How D uses this:** Open a fresh Cowork session. Paste this entire file as the first message.

---

You are starting Phase 1 of the JOI payroll port from Google Sheets to the JOI Supabase app. **Phase 1 is database schema, RLS, seed data, and a deploy plan ONLY.** No UI. No calc engine. No imports from the Sheet. No edge functions.

## Read these first (in this order)

1. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/PAYROLL_PLAN.md` — the full plan. Section 5 (Schema Plan) is your spec.
2. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/CLAUDE.md` — project rules. Pay attention to the destructive-ops rule, the `todayLocal()` rule, and the `no git push from sandbox` rule.
3. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/HANDOFF.md` — current session state.
4. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/JOE_PAYROLL_HANDOFF.md` — Joe's payroll handoff, source of truth for pay calculations. Skim §3 (column maps), §4 (formulas), §5 (pay-period derivation).
5. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/docs/payroll-reference/` — Joe's canonical Apps Script (`JOI_PAYROLL_CLEAN.js` — `calcAgentPay_` at line 885), the 21-bug analysis report, and the v8 rebuild spec. You won't touch these in Phase 1 but Phase 2 (calc engine) will read them.
5. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/src/types/payroll.ts` — the existing `calcularNomina` you're eventually replacing (Phase 2, not now).
6. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/src/hooks/useSupabasePayroll.ts` — existing payroll hooks; understand what's there before you alter it.
7. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/supabase/migrations/20260413000001_full_setup.sql` — confirm current `employees` + `payroll_periods` + `payroll_records` shape.

Your auto-memory already has the JOI project context (Supabase project `jpaihltkrohdqkqlbqkf`, the destructive-ops rule, RLS conventions, etc). Use it.

## Hard Rules (read twice)

1. **Show all SQL in chat before writing files. Wait for D's explicit `yes` for anything destructive.** `DROP`, `DELETE`, `TRUNCATE` are forbidden without it. ALTER TABLE that drops columns or changes types of populated columns is destructive. This is in CLAUDE.md as a global rule.
2. **No `git push` from this sandbox.** When done, hand D the exact terminal commands he runs from his laptop.
3. **`ENABLE ROW LEVEL SECURITY` on every new `payroll_*` table.** Phase 1 only writes policies for owner + service role; manager/employee policies wait for Phase 4. A table with RLS enabled and zero policies locks everyone out — that's fine here.
4. **Currency = MXN.** All money columns `numeric(12,2)`. Never `float`.
5. **Local dates only** — `date` columns are calendar dates in America/Mexico City local time. Use `todayLocal()` semantics for any default values. No UTC drift.
6. **Snapshot vs. reference:** `payroll_records.campaign_id` snapshots at line creation; do not foreign-key it to live employee state for the calc fields. Use FKs only for traceability, not for live lookups of pay rates.

## Decisions Already Made (do NOT re-ask)

- Per-employee rates (not rule-based). Add columns to `employees`, no `pay_rules` table.
- Auto-derive from `time_clock` (Phase 3 — for now just include `auto_derived jsonb` on `payroll_records`).
- Import Joe's history as read-only archive (Phase 5 — for now just create the `payroll_archive` table).
- Owner + Manager edit. Owner-only PAID lock.
- Match Joe's `calcAgentPay_` formula exactly (Phase 2).
- Aguinaldo + paystub PDFs deferred to v2.
- Existing `payroll_periods` and `payroll_records` tables are abandoned scaffolding — rework them.

## Pending Decisions to Ask D (block on these before SQL)

Use `AskUserQuestion`. Wait for answers before proceeding.

1. **`payroll_records` rework — drop and recreate, or in-place ALTER + rename existing rows?** Existing rows may exist as scaffolding-test data. Show D `SELECT count(*), max(created_at) FROM payroll_records` first so he can decide.
2. **Backfill `weekly_base_salary` = `monthly_base_salary / 4` for all active employees** — confirm this is the correct math for current JOI employees (all current rates are clean multiples of 4 per Joe's seed file `dev-seed/04_joi_salaries.sql`).
3. **Joe's review** — does Joe need to see the schema before we apply? Recommend yes; he wrote 8 versions of this calc engine and his eyes will catch a missing field.

## Deliverables (in this order)

### 1. Probe the current DB
Use the Supabase MCP tools to confirm:
- `SELECT count(*), max(created_at) FROM payroll_records` (is this used at all?)
- `SELECT count(*) FROM payroll_periods WHERE status = 'open'` (any active period?)
- Current `employees` column list — confirm `monthly_base_salary`, `daily_discount_rate`, `kpi_bonus_amount`, `shift_type`, `department_id` all exist as expected.

Show D the results. Then ask the Pending Decisions.

### 2. Write migration `supabase/migrations/<ts>_payroll_phase1_employees.sql`

ALTER `employees` to add:
```sql
ALTER TABLE public.employees
  ADD COLUMN weekly_base_salary    numeric(12,2),
  ADD COLUMN overtime_day_pay      numeric(12,2) DEFAULT 0,
  ADD COLUMN sunday_bonus_amount   numeric(12,2) DEFAULT 0,
  ADD COLUMN vacation_premium_pct  numeric(5,4)  DEFAULT 0.25
    CHECK (vacation_premium_pct >= 0.25);

-- Backfill weekly from monthly. Only writes where NULL.
UPDATE public.employees
   SET weekly_base_salary = monthly_base_salary / 4
 WHERE weekly_base_salary IS NULL
   AND monthly_base_salary IS NOT NULL;
```

After D approves, also add an index on `(department_id, shift_type, campaign_id)` for the future bulk-rate-editor UI.

### 3. Write migration `<ts+1>_payroll_phase1_new_tables.sql`

Create:
- `mexican_holidays` (columns per PAYROLL_PLAN.md §5.2)
- `payroll_weeks` (per §5.4) with `UNIQUE(period_id, week_number)`
- `payroll_archive` (per §5.6) — owner can SELECT, everyone else nothing
- `payroll_audit_log` (per §5.7) with trigger blocking UPDATE/DELETE

`ENABLE ROW LEVEL SECURITY` on every table. Add owner-only policies for now.

### 4. Write migration `<ts+2>_payroll_phase1_rework.sql`

The rework of `payroll_periods` + `payroll_records`. **This is the destructive bit.** Generate the SQL, show it to D in chat, wait for `yes`, then write the file. Two approaches per PAYROLL_PLAN.md §5.5 — propose Option B (ALTER + rename existing data as legacy) unless D says otherwise.

For `payroll_periods`: add `period_code text UNIQUE`, `year int`, `month int`, `half text`, `locked_at timestamptz`, `locked_by uuid REFERENCES auth.users`.

For `payroll_records`: this needs significant new columns AND a new FK to `payroll_weeks`. Show the full ALTER TABLE in chat first.

### 5. Write migration `<ts+3>_payroll_phase1_seed_holidays.sql`

Seed `mexican_holidays` for **2026 and 2027**, LFT Article 74 dates. **Do not invent dates.** Use WebSearch to confirm:
- Search: `Mexico LFT Article 74 official holidays 2026`
- Search: `Mexico LFT Article 74 official holidays 2027`

Include name in Spanish and English. Set `pays_premium = true` for all `LFT_OFICIAL` rows.

The 8 standard LFT Art. 74 days are roughly: Jan 1, Feb first Monday (Día de la Constitución), Mar third Monday (Natalicio de Benito Juárez), May 1 (Día del Trabajo), Sep 16 (Independencia), Nov third Monday (Revolución), Dec 25, plus presidential transition years (Dec 1 every six years — 2024/2030). Verify dates from a primary source.

### 6. Regenerate TypeScript types

Hand D the command:
```
cd ~/path/to/JOI-app
supabase gen types typescript --project-id jpaihltkrohdqkqlbqkf > src/integrations/supabase/types.ts
```

### 7. Update `HANDOFF.md`

Add a `## Payroll Phase 1 — DONE` section with:
- list of migration files
- new columns on `employees`
- new tables
- holiday count seeded
- pointer to `PAYROLL_PHASE2_PROMPT.md` (which is the next step — you don't write it, just say it's the next thing)

### 8. Code-review pass (project standard)

Before declaring done, launch a sub-agent (`Plan` or `general-purpose`) to review the migrations as if it were code review. Pass it the migration filenames + PAYROLL_PLAN.md and ask it to verify:

- Every `payroll_*` table has RLS enabled.
- Every money column is `numeric(12,2)`, not `float`/`real`/`double precision`.
- Every status column has a CHECK constraint matching the allowed values.
- Every FK has an index on the referencing side.
- `payroll_audit_log` has the UPDATE/DELETE-blocking trigger.
- `vacation_premium_pct CHECK >= 0.25` is present (LFT Art. 80).
- No SQL is destructive without an explicit comment saying D approved it.
- No `git push` or `supabase db push` is hidden inside a script — D runs those manually.

### 9. Acceptance checks (run before declaring done)

Use Supabase MCP execute_sql to verify:

| # | Query | Expected |
|---|---|---|
| P1.1 | `SELECT relname FROM pg_class WHERE relname IN ('mexican_holidays','payroll_weeks','payroll_archive','payroll_audit_log') AND relrowsecurity = true` | 4 rows |
| P1.2 | `SELECT count(*) FROM mexican_holidays WHERE date BETWEEN '2026-01-01' AND '2026-12-31' AND type = 'LFT_OFICIAL'` | ≥ 7 (Art. 74) |
| P1.3 | `INSERT INTO employees (..., vacation_premium_pct) VALUES (..., 0.10)` | CHECK constraint violation |
| P1.4 | `UPDATE payroll_audit_log SET action = 'x' WHERE id = ...` (on a test row) | trigger blocks |
| P1.5 | `SELECT count(*) FROM employees WHERE weekly_base_salary IS NULL AND monthly_base_salary > 0` | 0 (backfill worked) |
| P1.6 | `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname LIKE '%vacation_premium_pct_check%'` | shows `>= 0.25` |
| P1.7 | Sign in as anon role, `SELECT * FROM payroll_weeks` | 0 rows (RLS) |

### 10. Hand D the deploy commands

```
cd ~/path/to/JOI-app
git pull
# Review each migration file
git diff main supabase/migrations/
# Apply
supabase db push
# Regen types
supabase gen types typescript --project-id jpaihltkrohdqkqlbqkf > src/integrations/supabase/types.ts
# Commit
git add supabase/migrations/ src/integrations/supabase/types.ts HANDOFF.md
git commit -m "payroll: phase 1 — schema + RLS foundation"
git push
```

D pastes those. You do not run them.

## What This Phase Does NOT Do

- ❌ No calc function. No `pay_calc_record`. That's Phase 2.
- ❌ No auto-derive from time_clock. That's Phase 3.
- ❌ No React routes. No UI. That's Phase 4.
- ❌ No importing Joe's history. That's Phase 5.
- ❌ No replacement of `calcularNomina` in `src/types/payroll.ts`. Phase 2.
- ❌ No paystub generation. Out of v1.

If you find yourself reaching for any of those, stop and re-read this section.

## Done Looks Like

D pastes the deploy commands. Migrations apply cleanly. Acceptance checks pass. Types regenerate. `HANDOFF.md` ends with `Payroll Phase 1 — DONE` and a pointer to Phase 2. Then we move on.

## If Anything Is Ambiguous

Ask D via `AskUserQuestion`. Don't guess pay logic — Joe spent 8 versions hardening it, and the v1 cutover hinges on the math matching to the cent. Better to wait for an answer than ship a wrong field.
