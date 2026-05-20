# Sonnet Prompt — JOI Payroll Phase 2 (Calc Engine Port)

> **How D uses this:** Open a fresh Cowork session. Paste this entire file as the first message.

---

You are building Phase 2 of the JOI payroll port. **Phase 2 is the calc engine ONLY** — porting Joe's `calcAgentPay_` formula from Apps Script to a Postgres function `pay_calc_record`, plus the triggers that fire it, plus replacing the buggy `calcularNomina()` in `src/types/payroll.ts` with a thin client-side wrapper. No UI. No auto-derive from time_clock. No imports.

## Schema Review Status

✅ **Joe reviewed `docs/payroll-reference/PHASE1_SCHEMA_REVIEW.md` on 2026-05-19 and signed off with no changes.** Proceed.

Do NOT ask D whether Joe has reviewed — it's done. Go straight to the other 3 pending decisions in the "Decisions Pending" section below.

## Read These First (in this order)

1. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/PAYROLL_PLAN.md` — your spec. Section 6 (Calc Engine) is the contract.
2. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/CLAUDE.md` — project rules. Destructive-ops rule, no-git-push-from-sandbox, todayLocal().
3. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/HANDOFF.md` — current state, Phase 1 results.
4. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/PAYROLL_PHASE1_DECISIONS.md` — what D decided in Phase 1.
5. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/JOE_PAYROLL_HANDOFF.md` — Joe's calc handoff. §4 (the formulas) is your byte-for-byte spec.
6. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/docs/payroll-reference/JOI_PAYROLL_CLEAN.js` — Joe's canonical Apps Script. Start at line 885 (`calcAgentPay_`). Also read line 3099 (`calcPartialWeekPay_`) and line 8305 (`joiRecalculatePayrollRunRow_`).
7. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/src/types/payroll.ts` — the existing `calcularNomina` you're replacing.
8. The Phase 1 migration files in `supabase/migrations/` — know the actual column names that landed.

Your auto-memory has the JOI context already.

## Hard Rules

1. **The math is byte-for-byte.** Every component, every rounding step, every branch must match Joe's `calcAgentPay_`. The *plumbing* differs (column names instead of column letters; PL/pgSQL syntax instead of JS) — that's fine. The *arithmetic* doesn't.
2. **Show D the full PL/pgSQL in chat before writing the migration file.** This is the heart of the system; D needs to see it. Wait for `yes`.
3. **No destructive SQL without explicit approval.** Same rule as Phase 1.
4. **No `git push` from sandbox.** Hand D the terminal commands.
5. **Rounding: 2 decimals per component, then 2 decimals on the total.** Use `round(x::numeric, 2)` in PL/pgSQL — NOT `round(x, 2)` on `double precision` (which has different rounding behavior). Cast to `numeric` first.
6. **PAID rows are immutable.** The function must RAISE EXCEPTION if called on a `status = 'PAID'` record. The trigger version refuses silently (returns NEW unchanged) so external updates don't cascade-fail.
7. **MXN throughout.** All money outputs `numeric(12,2)`.

## Decisions Already Made

- Per-employee rates. The function reads from `employees`, not from any `pay_rules` table.
- `daily_salary` is a stored column on `employees`. Use it directly. Do NOT derive from weekly_base_salary.
- Replace the existing `calcularNomina()` in `src/types/payroll.ts` with a thin TypeScript wrapper that calls the Postgres RPC for the authoritative result. Optionally keep a client-side preview function for "as you type" UX (zero network), but mark it preview-only — the DB is canonical.
- PL/pgSQL function inside the DB, not a Supabase Edge Function. Reasons: runs in-transaction atomic with the row update; triggers can call it natively; no network roundtrip; no edge-function cold start. Drawback: harder to unit-test, which we address with synthetic data SQL tests.

## Decisions Pending — Ask D First

Batch these into a single `AskUserQuestion` call (3 questions in one shot, not three separate turns). Block on the answers before writing any function code.

1. **Trigger timing — BEFORE UPDATE or AFTER UPDATE?** Recommend BEFORE UPDATE: lets the function modify NEW directly, atomic with the input save, no recursion. AFTER UPDATE would require a second UPDATE statement and risks a loop.
2. **What happens on `include_in_payroll = false`?** Joe zeros out all calc columns but keeps `extra_bonus` as a stored input. Confirm we want the same behavior. (Joe's CLEAN line 8340.)
3. **`partial_week_days` semantics.** Joe: "When `partialWeek > 0` the employee gets `dailySalary × daysWorked` for base, and `missed_ded = 0`, `vacation_pay = 0`." That's a mid-week-start convention. Confirm we want this for the JOI app too (vs. e.g. mid-week-termination, which would be a different formula).

## Deliverables (in this order)

### 1. Spec the function in plain English first
Before writing any SQL, write a 1-page plain-English spec at `docs/payroll-reference/PHASE2_CALC_SPEC.md` that walks through each component:
- Inputs (from `payroll_records` + `employees`)
- Output columns
- The 4 branches: `status = PAID` (refuse), `include_in_payroll = false` (zero out), `partial_week_days > 0` (partial), else (full week)
- Rounding policy
- Error conditions

Show this to D in chat. Wait for `yes` before writing PL/pgSQL.

### 2. The PL/pgSQL function `pay_calc_record(p_record_id uuid)`
- `SECURITY DEFINER` so it can write to `payroll_audit_log` regardless of caller's RLS
- Parameter: `p_record_id uuid`
- Reads the record + the joined employee
- Implements the 4 branches per PAYROLL_PLAN.md §6
- Writes the computed columns + appends to `payroll_audit_log` with action `'RECALC'`
- Returns the updated record (or void — your call, document why)

### 3. The trigger `payroll_records_recalc_trigger`
- `BEFORE INSERT OR UPDATE` on `payroll_records`
- Fires only when an INPUT column changes (`include_in_payroll`, `missed_days`, `overtime_days`, `sundays_worked`, `vacation_days`, `holiday_days`, `kpi_achieved`, `extra_bonus`, `partial_week_days`) — use `OLD.* IS DISTINCT FROM NEW.*` on each
- Refuses silently if `OLD.status = 'PAID'`: `RETURN OLD` (no-op)
- Calls the calc logic inline (so we modify NEW directly without a recursive UPDATE)
- IMPORTANT: the calc logic needs to be duplicated between the trigger function and `pay_calc_record(uuid)` — extract it into a helper PL/pgSQL function `_calc_pay_components(employee_row, record_row)` that returns a record type, then both the trigger and the RPC call it. Avoids divergence.

### 4. Audit logging
Every recalculation appends one row to `payroll_audit_log`:
- `record_id` = NEW.id
- `action` = `'RECALC'`
- `before` = jsonb of OLD's calc columns
- `after` = jsonb of NEW's calc columns
- `actor` = `auth.uid()` if set, else null (trigger context may not have auth)
- `at` = `now()`

### 5. TypeScript port — `src/types/payroll.ts`
Replace `calcularNomina` with two functions:

```typescript
// Authoritative — calls the DB
export async function calculatePay(recordId: string): Promise<PayrollLineResult> {
  const { data, error } = await supabase.rpc('pay_calc_record', {
    p_record_id: recordId,
  });
  if (error) throw error;
  return data;
}

// Preview only — client-side, for "as you type" UI before save.
// MUST match the DB function's math exactly; tests below verify this.
export function previewPay(input: PayrollLineInputs, employee: PayrollEmployeeRates): PayrollLineResult {
  // ... same math, in TS
}
```

Keep the old `calcularNomina` signature as a deprecated alias that throws, so any leftover callers fail loudly during the migration.

### 6. Tests
Write `supabase/migrations/<ts>_payroll_phase2_tests.sql` with synthetic test cases that INSERT, then assert. Cover:

| Test | Scenario | Expected |
|---|---|---|
| T2.1 | Full week, all defaults (5 missed=0, kpi=true, no OT/Sun/vac/holiday) | total = weekly_base + kpi_bonus |
| T2.2 | Full week, 1 missed day | total = weekly_base - daily_discount_rate + kpi_bonus |
| T2.3 | Full week, kpi=false | total = weekly_base (no kpi) |
| T2.4 | Full week, 1 OT day | total = weekly_base + overtime_day_pay + kpi_bonus |
| T2.5 | Full week, 1 Sunday worked | total = weekly_base + sunday_bonus_amount + kpi_bonus |
| T2.6 | Full week, 1 holiday day | total = weekly_base + (daily_salary × 2) + kpi_bonus  (LFT Art. 75) |
| T2.7 | Full week, 5 vacation days at 25% premium | total = weekly_base + (5 × daily_salary × 1.25) + kpi_bonus |
| T2.8 | Partial week, 3 days worked | total = (daily_salary × 3) + kpi_bonus; missed_ded = 0; vacation_pay = 0 |
| T2.9 | `include_in_payroll = false` | total = 0 |
| T2.10 | Update an input on a PAID row | trigger no-ops; no row in audit_log for this action |
| T2.11 | Update an input on UNPAID row | trigger fires; total recalculates; audit_log has one new row |
| T2.12 | Rounding edge case: 1.005 daily × 1 missed → must round to 1.01 (banker's rounding will be wrong here; check Joe's behavior) | matches Joe |

Run these via `supabase db push` and verify each assertion passes (use `RAISE NOTICE` or a results table). Clean up test data at the end.

### 7. The Acceptance Test against the existing `dev-seed`
Create a synthetic `payroll_periods` + `payroll_weeks` + `payroll_records` row for a known employee (e.g., Javier Caballero, EMP-001, weekly $5,750, KPI $0, daily $1,150 from the seed file). Pick inputs that should yield a known total. Verify the function produces it. This is a smoke test, not the full T1 Javier $73,987.50 test (which is gated on Phase 5 import).

### 8. Code-review pass
Spawn a sub-agent (`general-purpose` or `Plan`) to review the PL/pgSQL by comparing it line-by-line to Joe's `calcAgentPay_` at line 885 of `JOI_PAYROLL_CLEAN.js`. Pass it:
- The PL/pgSQL function source
- Joe's `calcAgentPay_` source (lines 885–945-ish)
- Joe's `calcPartialWeekPay_` source (lines 3099+)

Ask it to verify:
- Every Joe formula line has a matching PL/pgSQL line
- Component order is identical (Joe computes base → kpi → missed_ded → overtime → sunday → vacation → holiday → extra → total in a specific order)
- Rounding happens per-component AND on the total
- The `partial_week` branch matches Joe's `calcPartialWeekPay_` math
- `include_in_payroll = false` zeros out the right columns and preserves `extra_bonus`

If the reviewer flags any divergence, fix it and re-run the reviewer.

### 9. Update `HANDOFF.md` and `PAYROLL_PHASE1_DECISIONS.md`
- HANDOFF.md gets a `## Payroll Phase 2 — DONE` section.
- PAYROLL_PHASE1_DECISIONS.md gets renamed to `PAYROLL_DECISIONS.md` (it's living across phases now) and Phase 2 decisions appended.

### 10. Hand D the deploy commands
```
cd ~/path/to/JOI-app
git pull
git diff main supabase/migrations/
supabase db push
supabase gen types typescript --project-id jpaihltkrohdqkqlbqkf > src/integrations/supabase/types.ts
npm test  # if there are TS tests for the preview function
git add -A
git commit -m "payroll: phase 2 — calc engine port (Joe's calcAgentPay_)"
git push
```

## Acceptance Checks (Phase 2)

| # | Check | How |
|---|---|---|
| P2.1 | Function exists | `SELECT proname FROM pg_proc WHERE proname IN ('pay_calc_record','_calc_pay_components')` returns 2 rows |
| P2.2 | Trigger exists and is BEFORE | `SELECT tgname, tgtype FROM pg_trigger WHERE tgname = 'payroll_records_recalc_trigger'` shows BEFORE |
| P2.3 | All 12 synthetic tests pass | Each test has explicit assert; failures raise exceptions |
| P2.4 | PAID-row protection | T2.10 passes |
| P2.5 | Audit log writes | T2.11 confirms log row appears |
| P2.6 | TypeScript preview matches DB | Run preview locally with same inputs as T2.1–T2.9, expect identical totals |
| P2.7 | Code-review pass clean | Sub-agent reports no divergence |

## What This Phase Does NOT Do

- ❌ No reading from `time_clock` or `eod_logs`. The function reads inputs from `payroll_records` columns only. Auto-derive is Phase 3.
- ❌ No React UI. No routes. Phase 4.
- ❌ No import of Joe's historical data. Phase 5.
- ❌ No paystub generation. v2 of the whole project.
- ❌ No aguinaldo logic. v2.

If you find yourself building any of those, stop.

## Done Looks Like

D pastes deploy commands. Migrations apply. All 12 synthetic tests pass. The TypeScript preview function matches the DB function. Code reviewer flags zero divergence from Joe's `calcAgentPay_`. HANDOFF.md ends with `Payroll Phase 2 — DONE` and a pointer to Phase 3 (auto-derive). Joe has signed off on the function (either before you started, or by reviewing the spec doc + a sample audit-log entry after).

## If Stuck

Don't guess the formula. Joe's Sheets is canonical — `docs/payroll-reference/JOI_PAYROLL_CLEAN.js` line 885 is the source-of-truth. If the spec is ambiguous, ask D to ping Joe. Adding a wrong formula now and fixing it in Phase 5 will silently corrupt the parallel-run comparison and we'll lose days chasing it.
