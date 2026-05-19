# Payroll Phase 1 — Decisions Log

**Session:** 2026-05-19 (Cowork, Sonnet)
**Rule:** Re-read this file at the start of every session before asking D anything.

---

## Decision 1 — `daily_salary` column on `employees`

**Verdict:** STORED explicitly. Do NOT derive at calc time.

**New column:** `daily_salary numeric(12,2)` added to `employees` (5th new Phase 1 column alongside weekly_base_salary, overtime_day_pay, sunday_bonus_amount, vacation_premium_pct).

**Backfill:** `UPDATE employees SET daily_salary = daily_discount_rate WHERE daily_salary IS NULL AND daily_discount_rate > 0` — these coincide on the current JOI seed but are conceptually distinct (one is per-day pay, one is per-missed-day penalty).

**Reason:** (a) Joe's `calcAgentPay_` reads `rule.dailySalary` directly — we committed to porting his math byte-for-byte; (b) supports custom rates that aren't a clean `weekly / N` (Joe's Sheets has negotiated daily rates for some employees); (c) keeps the calc engine readable without hidden shift_type→scheduled_days lookup tables.

**Phase 4 UI note:** Bulk Pay Rates editor will auto-fill `daily_salary` when `weekly_base_salary` changes (checkbox pattern). No DB trigger needed in v1.

---

## Decision 2 — `weekly_base_salary` backfill math

**Verdict:** `monthly_base_salary / 4` is correct for all current JOI employees. RUN the backfill — but only after Q1/Q2 safety queries confirm zero violations.

**Safety queries to run first:**
```sql
-- Q1: active employees with NULL/0 monthly (excluding system users)
SELECT count(*), array_agg(employee_id) FROM employees
WHERE is_active = true AND is_system_user = false
  AND (monthly_base_salary IS NULL OR monthly_base_salary <= 0);

-- Q2: active employees whose monthly is NOT a clean multiple of 4
SELECT employee_id, full_name, monthly_base_salary, monthly_base_salary % 4 AS remainder
FROM employees
WHERE is_active = true AND is_system_user = false
  AND monthly_base_salary > 0 AND (monthly_base_salary::numeric % 4) != 0;
```

- If Q1 > 0: list those employees in this file — they'll need manual setup later, doesn't block Phase 1.
- If Q2 > 0: STOP, pause for D — fractional weekly rate is a data error.
- If both zero: backfill is green-lit.

**Q1/Q2 results (run 2026-05-19):**
- Q1: 15 employees with NULL/0 monthly — `EMP-120, EMP-108, EMP-112, EMP-114, EMP-117, sandoval028, sandoval801, EMP-104, EMP-110, EMP-106, sandovalagent, EMP-105, EMP-103, EMP-101, JOI-001`. These are test accounts and employees not yet salary-seeded. Backfill skips them (WHERE monthly > 0). Will need manual rates via Phase 4 Pay Rates editor.
- Q2: **0 rows** — all seeded employees are clean ×4 multiples. ✅ BACKFILL GREENLIT.

---

## Decision 3 — `payroll_records` rework approach

**Verdict:** DROP + recreate (Option A).

**`payroll_records`:** 0 rows confirmed — empty scaffolding, nothing to protect.

**`payroll_periods`:** 3 open rows confirmed — all test/scaffold rows with no records attached. Shown to D before dropping.

**The destructive-ops hard rule exists to guard real data, not empty scaffolding.** D has pre-approved Option A given the 0-row confirmation.

**Still required by rule:** Show exact DROP statements in chat. Wait for D's explicit "yes" in that message before writing migration 3 to disk.

---

## Decision 4 — Joe's sign-off

**Verdict:** Courtesy review, don't block on it.

**Process:**
1. Write all 4 migration files.
2. Concatenate into `docs/payroll-reference/PHASE1_SCHEMA_REVIEW.md` with inline comments.
3. Tell D to send it to Joe with: *"Spot anything missing for `calcAgentPay_`? Flag in 48 hours or we proceed."*
4. Apply Phase 1 schema (D runs `supabase db push`) without waiting.
5. If Joe flags a missing field → one extra nullable-column migration in Phase 2. Not catastrophic.

**Hard gate for Joe:** Phase 2 (calc engine port). That's where his math gets translated and he must sign off before `pay_calc_record` goes live.

---

## Schema decisions captured here (not in PAYROLL_PLAN.md yet)

- **`payroll_weeks` moves to migration 3** (not migration 2) due to FK dependency ordering: `payroll_weeks.period_id → payroll_periods`. If created in migration 2, migration 3's `DROP TABLE payroll_periods CASCADE` would silently cascade-drop it. Co-locating with the rework is cleaner.

- **`organization_id` on all new payroll tables:** `payroll_periods`, `payroll_weeks`, `payroll_records`, `payroll_archive` all carry `organization_id NOT NULL REFERENCES organizations(id)`. Consistent with multi-tenancy Phase 2 pattern.

- **Phase 1 RLS:** All new payroll tables use `is_leadership()` for now (owner + admin + manager — the only roles in the system today). Manager-scoped campaign-filtered policies come in Phase 4. A comment on each policy marks it for Phase 4 replacement.

- **PAID-lock trigger on `payroll_records`:** Added in Phase 1 since the table is being created fresh. Simple BEFORE UPDATE trigger that raises if `OLD.status = 'PAID'`.

- **`updated_at` auto-trigger on `payroll_records`:** Added in Phase 1 — sets `NEW.updated_at = now()` on every UPDATE.

---

## Migration file timestamps

| File | Contents |
|---|---|
| `20260519000001_payroll_phase1_employees.sql` | ALTER employees + backfill + index |
| `20260519000002_payroll_phase1_new_tables.sql` | mexican_holidays, payroll_archive, payroll_audit_log |
| `20260519000003_payroll_phase1_rework.sql` | DROP old + CREATE new payroll_periods + payroll_weeks + payroll_records |
| `20260519000004_payroll_phase1_seed_holidays.sql` | LFT Art. 74 holidays 2026 + 2027 |
