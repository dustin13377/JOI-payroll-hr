# Pre-Payroll: Close & Lock design (for D)

_Joe + Claude, 2026-06-19._

## Why
The new Pre-Payroll screen (`/admin/payroll/prepay`) computes pay per **quincena**
from the time clock (base = monthly/2, missed/makeup/overtime, Sunday, vacation,
spiff). To let Joe **close a finished period** so its numbers are frozen (a later
time-clock edit must not change a month already paid), we snapshot the computed
pay at lock time.

## Approach — additive, non-disruptive
New table **`prepay_lines`** (migration `20260619000001_prepay_lines_snapshot.sql`):
one row per (period, employee) holding the frozen inputs + amounts + net.
Owner/admin RLS, org-scoped. **Does not touch** `payroll_records`,
`payroll_weeks`, or the legacy calc — they keep working untouched.

## Lifecycle
- **Close & Lock** (owner action on Pre-Payroll): computes every active
  employee's pay for the period, inserts `prepay_lines`, sets the
  `payroll_periods` row to `LOCKED` (+ `locked_at`/`locked_by`), then ensures the
  next month's PP1/PP2 period rows exist so the screen rolls forward.
- **Previous Periods**: reads `prepay_lines` for LOCKED periods (read-only history).
- Unlock reuses the existing `pay_unlock_period` pattern if needed (would also
  clear that period's `prepay_lines`).

## Open questions for D
1. Long-term: do we migrate fully to quincena-level records (retire the weekly
   `payroll_records`) or keep both? This snapshot is a clean bridge either way.
2. Should `prepay_lines` also store the per-day calendar (jsonb) for audit, or is
   the aggregate enough? (Currently aggregate only.)
3. Period auto-creation: confirm the PP1/PP2 row-creation rules (period_code,
   period_type Q1/Q2) match your conventions.
