# Payroll calc — TS ⇄ SQL alignment (Task 1 follow-up)

_Joe + Claude, 2026-06-18. Corrected after reading the real prod schema
(`supabase/baseline_schema.sql`)._

The brief says `previewPay` (TS) and `_calc_pay_components` (SQL) must always
agree. Verified against the **live** function (prod is ahead of the repo's
committed migrations — D applies some directly). Good news: they already
match on almost everything.

## What Task 1 changed (this PR)
Cadence only. Full-period base `monthly / 4` → **`monthly / 2`** (quincenal), in:
- `src/types/payroll.ts` → `previewPay()` Branch D.
- `supabase/migrations/20260618000001_payroll_quincenal_base.sql` → faithful
  `CREATE OR REPLACE` of the live `_calc_pay_components`, changing only the
  Branch D base line. (Replaces an earlier stale version that would have
  reverted live logic — caught in review.)
- `src/pages/admin/PayrollRates.tsx` → derived display + copy.
- `src/types/payroll.test.ts` → 7 unit tests.

## Current alignment (after this PR)
Both engines now use the same monthly-derived model:
`daily = monthly/30`, base = `monthly/2`, missed = `missed × daily`,
sunday = `25% × daily`, holiday = `2 × daily`, overtime via `extra_bonus`
(overtime_pay = 0), vacation deferred (0), `custom_deduction` subtracted.

## Remaining difference → Task 2
**Commission.** The SQL includes `commission` (`COALESCE(r.commission, 0)`);
`previewPay` does not. Add commission to `previewPay` so the client preview
matches the authoritative DB calc exactly.

(The earlier draft of this note also listed overtime/vacation/daily-rate-source
divergences — those were read off a stale committed migration and do **not**
exist in the live function. Disregard.)
