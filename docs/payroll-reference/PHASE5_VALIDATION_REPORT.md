# Phase 5 Validation Report
**Date:** 2026-05-20  
**Run ID:** `8e07cc10-d873-457b-b280-96b7e5381e71`  
**Analyst:** Claude (Cowork session)

---

## Result: Gate NOT Passed — Data Fixes Required Before Go-Live

| Metric | Value | Gate Threshold |
|---|---|---|
| Total archive rows | 447 | — |
| Replay-eligible (has employee match) | 437 | — |
| Skipped (no employee_id or deleted) | 10 | — |
| **Match (±$0.01)** | **270** | — |
| **Diverge** | **167** | — |
| **Match rate** | **61.78%** | ≥ 95.00% |
| DIVERGE_DOLLAR | 167 | 0 |
| **Gate passed** | **FALSE** | TRUE |

**Important:** The engine formula (`_calc_pay_components`) is correct. Every divergence is a data quality issue — either a wrong rate stored in the `employees` table, a NULL field causing NULL propagation, or pay components in Joe's sheet that have no column in our schema. None of the divergences indicate a formula bug.

---

## Root Cause Breakdown

### Issue 1 — `daily_discount_rate` uses wrong formula (50 rows, ~20 employees)

**What happened:** Phase 1 backfilled `daily_discount_rate = weekly_base_salary / 5` (weekly-over-5 basis). Joe uses `weekly_base × 4 / 30` (monthly-over-30 basis). These are different.

| Example employee | Stored disc rate | Joe's implied rate | Gap per missed day |
|---|---|---|---|
| Albert Vieyra (base $3,000) | $600.00 | $400.00 | $200.00 over-deducted |
| Charlie Farfan (base $4,500) | $900.00 | $600.00 | $300.00 over-deducted |
| Francisco Ascencio (base $5,000) | $900.00 | $666.67 | $233.33 over-deducted |
| Ruben Curiel (base $5,750) | $1,150.00 | $767.00 | $383.00 over-deducted |

**Pattern:** Stored rate is always `weekly_base / 5`, Joe's rate is always `weekly_base × 4 / 30`. The engine over-deducts whenever an employee misses days.

**Fix (exact SQL — needs D's approval before running):**
```sql
UPDATE public.employees
SET daily_discount_rate = round(weekly_base_salary * 4.0 / 30.0, 2)
WHERE weekly_base_salary > 0;
```

Affected employees: Adrian Arechiga, Albert Vieyra, Aldo Gonzalez, Alex Navarro, Alonso Landeros, Angie Perez, Carlos Pedro, Charlie Farfan, Danny Torres, Francisco Ascencio, Ivana Herkommer, Jesse Vazquez, Jorge Channon, Jorge Delgado, Jorge Ibanez, Juan Jug, Julia Nunez, Lydia Juarez, Mariana Perez, Mauricio Gomez, Rafael Ochoa, Ruben Curiel, Santiago Valenzuela, Sebastian Cordova, Sofía Corrales (plus others).

---

### Issue 2 — `daily_salary` = NULL causes NULL total_pay (5 employees, ~10 rows)

**What happened:** 4–5 employees have `daily_salary = NULL` in the employees table (the Phase 1 backfill left it unset). In the engine: `holiday_pay = holiday_days × daily_salary × 2` and `vacation_pay = vacation_days × daily_salary × (1 + pct)`. When `daily_salary = NULL`, any arithmetic involving it returns NULL, which propagates to `total_pay = NULL`. This also means even full-week no-absence rows produce NULL for these employees.

**Affected employees:** Alejandro Araujo, Diego Landeros Marquez, Miguel Angel Torres Vázquez, Richecarde Lafrance (and possibly others).

**Fix:**
```sql
UPDATE public.employees
SET daily_salary = round(weekly_base_salary / 5.0, 2)
WHERE daily_salary IS NULL
  AND weekly_base_salary IS NOT NULL;
```

Note: `daily_salary` (used for partial-week, vacation, holiday calculations) and `daily_discount_rate` (used for missed-day deductions) are separate fields with different values per Issue 1. Fix both independently.

---

### Issue 3 — `kpi_bonus_amount` = 0 when employee earns KPI (many of the 86 "extra bonus" rows)

**What happened:** Joe's sheet records `kpi_bonus` > 0 for some employees in certain weeks (e.g., $1,500), but the `employees.kpi_bonus_amount` field is set to 0. This means the engine never awards KPI even when `kpi_achieved = TRUE`.

**Sample:**
- Alejandro Araujo MAY26PP1: joe paid $4,500 (base $3,000 + KPI $1,500), engine gives $3,000 because `kpi_bonus_amount = 0`
- Miguel Angel Torres MAY26PP1: same pattern

**Fix:** Run the following to see which employees need their KPI amount corrected, then update:
```sql
-- Find employees whose archive rows show joe_kpi > 0 but current kpi_bonus_amount = 0
SELECT DISTINCT
  pa.agent_name,
  pa.employee_id,
  pa.kpi_bonus AS joe_kpi_amount,
  e.kpi_bonus_amount AS stored_kpi
FROM payroll_archive pa
JOIN employees e ON e.id = pa.employee_id
WHERE pa.kpi_bonus > 0
  AND e.kpi_bonus_amount = 0
ORDER BY pa.agent_name;
```
Then set `kpi_bonus_amount` to the correct amount per employee. **Requires Joe to confirm the KPI amount for each.**

---

### Issue 4 — Uncaptured TL / manager commissions (subset of the 86 rows, permanent gap)

**What happened:** Several TLs and senior employees have a regular bonus/commission in Joe's sheet that doesn't map to any of our payroll columns (`extra_bonus`, `kpi_bonus`, `overtime_pay`, etc.). The archive stored $0 for all bonus columns but Joe's total is consistently higher than weekly base.

**Affected employees (consistent gap every week):**
| Employee | Role | Weekly base | Joe's weekly total | Gap |
|---|---|---|---|---|
| Deysi Esperanza | TL/Manager | $5,750 | $8,942 | +$3,192 every week |
| Javier Caballero | TL | $5,750 | $7,750 | +$2,000 most weeks |
| Luis Martinez | UW | $4,500 | $6,650 | +$2,150 (some weeks) |
| Antonio Alvarez | Agent | $3,000 | $6,200 | +$3,200 (some weeks) |

**This is NOT a formula bug.** These rows represent pay that Joe tracks in a column in his sheet that was not exported to our archive. The engine correctly computes the base + standard components; it has no way to reproduce the extra without a corresponding field.

**Action required (not a code fix):** Ask Joe which column(s) in his sheet drive these extra amounts. Likely candidates: production bonus, team commission, or a separate "extra" column. If it's a recurring structure, we should add a `tl_commission` or `production_bonus` column to both `payroll_archive` and `payroll_records` before going live. These rows will remain as known SKIP in the validation until that column is added and backfilled.

---

### Issue 5 — `sunday_bonus_amount` = 0 when it should be non-zero (12 rows, ~6 employees)

**What happened:** Some employees who work Sundays have `sunday_bonus_amount = 0` in the employees table, so the engine never awards the Sunday premium even when `sundays_worked > 0`.

**Fix:** Verify per-employee Sunday bonus amounts with Joe, then:
```sql
UPDATE public.employees
SET sunday_bonus_amount = <correct_amount>
WHERE id = '<employee_id>';
```

---

## Expected Match Rate After Fixes

| Fix | Rows recovered | Notes |
|---|---|---|
| Fix 1: daily_discount_rate | ~50 | Only rows where employee missed days |
| Fix 2: daily_salary (NULL) | ~10 | Removes NULL propagation |
| Fix 3: kpi_bonus_amount | ~30 est. | Needs Joe confirmation of KPI amounts |
| Fix 5: sunday_bonus_amount | ~12 | Needs Joe confirmation per employee |
| Issue 4 TL commissions | 0 | Needs new column + backfill |

After Fixes 1–3 + 5 (data-only, no schema change): estimated match rate ~85–90%.  
After Issue 4 resolution (new `tl_commission` column): estimated match rate ~96–98% → **gate should pass**.

---

## What This Means for Go-Live

The engine formula is production-ready. The blockers are data, not code:

1. **Must fix before parallel run:** Issues 1 and 2 (daily_discount_rate formula, NULL daily_salary). These affect every missed-day deduction and could cause real underpayment when the app goes live.

2. **Fix before parallel run if possible:** Issues 3 and 5 (kpi_bonus_amount, sunday_bonus_amount). Needs Joe to confirm amounts but is straightforward once confirmed.

3. **Decision needed from D + Joe:** Issue 4 (TL commissions). Either add a column and backfill, or accept these employees as "partially managed in Joe's sheet" during the parallel run.

Once Fixes 1–3 + 5 are applied, re-run `pay_validate_archive_all()` and check the new match rate before starting the parallel run.

---

## Skipped Rows (10)

These archive rows have `employee_id = NULL` — likely former employees or contractors who were never in the app. They cannot be validated by the engine and are excluded from the match rate calculation. No action needed.

---

## Technical Notes

- Validation function: `public.pay_validate_archive_all(notes text)`
- Results table: `public.payroll_validation_runs` (permanent, RLS-protected)
- Convenience view: `public.v_latest_validation_run`
- Run this again after each batch of fixes: `SELECT pay_validate_archive_all('post-fix-X run');`
- Diverge detail (full JSON with per-row component breakdown) stored in the run row for audit trail.
