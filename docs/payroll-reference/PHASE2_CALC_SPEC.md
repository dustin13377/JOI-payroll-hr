# Payroll Phase 2 — Calc Engine Spec

**Status:** Draft — awaiting D approval before PL/pgSQL is written.  
**Source of truth:** `JOI_PAYROLL_CLEAN.js` — `calcAgentPay_` at line 885.  
**This doc is the plain-English translation of that function into Postgres terms.**

---

## 1. What This Phase Does

Ports Joe's `calcAgentPay_(rule, inputs)` from Apps Script into a Postgres function
`pay_calc_record(p_record_id uuid)`. A `BEFORE INSERT OR UPDATE` trigger calls the
same calc logic inline so every time an input column is saved, the calculated columns
update atomically in the same transaction.

Phase 2 does NOT read from `time_clock` or `eod_logs` (that is Phase 3). It reads
inputs from the `payroll_records` columns only.

---

## 2. Inputs

The function reads from two rows joined together:

**From `payroll_records` (the row being calculated):**

| Column | Type | Maps to Joe's input |
|---|---|---|
| `include_in_payroll` | boolean | Col 4 — "Include In Payroll" YES/NO |
| `missed_days` | int | Col 5 |
| `overtime_days` | int | Col 6 |
| `sundays_worked` | int | Col 7 |
| `vacation_days` | int | Col 8 |
| `holiday_days` | int | Col 9 |
| `kpi_achieved` | boolean | Col 10 |
| `extra_bonus` | numeric(12,2) | Col 18 — Spiffs / one-off |
| `partial_week_days` | int or NULL | Col 20 — NULL = full week |
| `status` | text | Col 21 — UNPAID / COMPLETE / PAID |

**From `employees` (joined via `payroll_records.employee_id`):**

| Column | Type | Maps to Joe's rule object |
|---|---|---|
| `weekly_base_salary` | numeric(12,2) | `rule.weeklyBase` |
| `daily_salary` | numeric(12,2) | `rule.dailySalary` |
| `kpi_bonus_amount` | numeric(12,2) | `rule.kpiBonus` |
| `daily_discount_rate` | numeric(12,2) | `rule.missedDed` |
| `overtime_day_pay` | numeric(12,2) | `rule.overtimePay` |
| `sunday_bonus_amount` | numeric(12,2) | `rule.sundayBonus` |
| `vacation_premium_pct` | numeric(5,4) | `rule.vacationPct` — e.g. 0.25 |

---

## 3. Output Columns (written back to `payroll_records`)

| Column | Notes |
|---|---|
| `weekly_base` | Full weekly base — or `daily_salary × partial_week_days` for partial weeks |
| `kpi_bonus` | `kpi_bonus_amount` if kpi_achieved = true, else 0 |
| `missed_deduction` | `missed_days × daily_discount_rate` — 0 for partial weeks |
| `overtime_pay` | `overtime_days × overtime_day_pay` |
| `sunday_pay` | `sundays_worked × sunday_bonus_amount` |
| `vacation_pay` | `vacation_days × daily_salary × (1 + vacation_premium_pct)` — 0 for partial weeks |
| `holiday_pay` | `holiday_days × daily_salary × 2` — LFT Art. 75 extra premium only |
| `total_pay` | Sum of all above components (see formula per branch below) |

All columns are `numeric(12,2)`. All rounding uses `round(x::numeric, 2)` — cast to
numeric before rounding (never `round(double_precision, 2)` which has different
banker's rounding behavior).

---

## 4. The 4 Branches

### Branch A — PAID row (guard)

If the record's `status = 'PAID'`:
- The **RPC** (`pay_calc_record`) raises an exception. PAID rows are immutable.
  Caller must unlock the pay period first.
- The **trigger** returns `OLD` unchanged (silent no-op). This prevents a cascading
  failure if an UPDATE touches a non-input column (e.g. `memo`) on a PAID row.

### Branch B — include_in_payroll = false

Zero out every calculated column. Preserve `extra_bonus` in its input column
(it is data, not a calc output). This matches Joe's `joiRecalculatePayrollRunRow_`
line 8340:

```
weekly_base      = 0
kpi_bonus        = 0
missed_deduction = 0
overtime_pay     = 0
sunday_pay       = 0
vacation_pay     = 0
holiday_pay      = 0
total_pay        = 0
-- extra_bonus stays in its input column, untouched
```

### Branch C — Partial week (partial_week_days IS NOT NULL AND > 0)

Mid-week hire convention: the agent starts on Wednesday, for example, and only
earns pay for the days they actually worked. No missed-day deductions (they weren't
scheduled for the days they weren't there), no vacation accrual (can't take vacation
on a week they just started).

Source: `calcAgentPay_` line 920 (authoritative), cross-checked with
`calcPartialWeekPay_` line 3099 (helper, same math).

**Note:** `calcAgentPay_` includes `holiday_pay` in the partial-week total;
`calcPartialWeekPay_` omits it. We follow `calcAgentPay_` since it is the canonical
path called by every recalc. This divergence is flagged for Joe to confirm in the
code-review pass (Deliverable 8).

```
weekly_base      = round(daily_salary × partial_week_days, 2)
kpi_bonus        = kpi_achieved ? kpi_bonus_amount : 0
missed_deduction = 0
overtime_pay     = round(overtime_days × overtime_day_pay, 2)
sunday_pay       = round(sundays_worked × sunday_bonus_amount, 2)
vacation_pay     = 0
holiday_pay      = round(holiday_days × daily_salary × 2, 2)
total_pay        = round(weekly_base + kpi_bonus + overtime_pay
                         + sunday_pay + holiday_pay + extra_bonus, 2)
```

### Branch D — Full week (the normal case)

Source: `calcAgentPay_` line 923.

```
weekly_base      = weekly_base_salary              -- flat, no rounding needed
kpi_bonus        = kpi_achieved ? kpi_bonus_amount : 0
missed_deduction = round(missed_days × daily_discount_rate, 2)
overtime_pay     = round(overtime_days × overtime_day_pay, 2)
sunday_pay       = round(sundays_worked × sunday_bonus_amount, 2)
vacation_pay     = round(vacation_days × daily_salary × (1 + vacation_premium_pct), 2)
holiday_pay      = round(holiday_days × daily_salary × 2, 2)
total_pay        = round(weekly_base - missed_deduction + kpi_bonus
                         + overtime_pay + sunday_pay + vacation_pay
                         + holiday_pay + extra_bonus, 2)
```

---

## 5. Rounding Policy

**Per Joe's §4.4:** every per-component intermediate is rounded to 2 decimal places.
The total is then re-rounded. This prevents floating-point drift (the BUG-07
`666.666`/`833.333` daily-deduction bug).

In PL/pgSQL: use `round(x::numeric, 2)`. The cast to `numeric` is mandatory — `round`
applied to a `double precision` value uses a different rounding algorithm.

`weekly_base_salary` is a stored `numeric(12,2)` column, so it needs no additional
rounding.

---

## 6. Audit Logging

Every successful recalculation appends one row to `payroll_audit_log`:

| Column | Value |
|---|---|
| `record_id` | The payroll_records UUID that was recalculated |
| `action` | `'RECALC'` |
| `before` | jsonb snapshot of the 8 calc columns BEFORE this recalc |
| `after` | jsonb snapshot of the 8 calc columns AFTER this recalc |
| `actor` | `auth.uid()` — may be NULL in trigger context |
| `at` | `now()` |

The `payroll_audit_log` table is append-only (UPDATE/DELETE blocked by its own trigger
from Phase 1 migration 2).

---

## 7. Error Conditions

| Condition | Behavior |
|---|---|
| `status = 'PAID'` (in RPC) | RAISE EXCEPTION — caller must unlock first |
| `status = 'PAID'` (in trigger) | RETURN OLD — silent no-op |
| Employee record not found | RAISE EXCEPTION — data integrity error |
| `partial_week_days` < 0 | No special check; a negative days value would produce a negative total. Add a CHECK constraint on the column if this is a concern — can be added as a follow-up migration. |

---

## 8. Architecture — Why Two Functions, Not One

The Phase 2 spec requires the calc logic to live in a **shared helper function**
`_calc_pay_components` so the trigger and the RPC share exactly one implementation.
Without this, any bug fix would need to be applied in two places.

```
_calc_pay_components(e employees, r payroll_records)  → composite result type
    ↑ called by                    ↑ called by
pay_calc_record(p_record_id uuid)  payroll_records_recalc_trigger()
```

`_calc_pay_components` returns a composite type containing all 8 calculated columns
plus a flag indicating which branch was taken (for the trigger to decide whether to
skip the audit log on a PAID no-op).

---

## 9. What Phase 2 Explicitly Does NOT Do

- ❌ No reading from `time_clock` or `eod_logs` — Phase 3
- ❌ No React UI — Phase 4
- ❌ No import of historical data — Phase 5
- ❌ No aguinaldo, IMSS, ISR — v2

---

## 10. Acceptance Checks

| # | Check | How |
|---|---|---|
| P2.1 | `pay_calc_record` + `_calc_pay_components` exist | `SELECT proname FROM pg_proc WHERE proname IN ('pay_calc_record','_calc_pay_components')` returns 2 rows |
| P2.2 | Trigger is BEFORE INSERT OR UPDATE | `SELECT tgname, tgtype FROM pg_trigger WHERE tgname = 'payroll_records_recalc_trigger'` |
| P2.3 | 12 synthetic tests pass | Each has explicit ASSERT; failures raise exceptions |
| P2.4 | PAID-row protection | T2.10 — trigger no-ops, no audit log row |
| P2.5 | Audit log writes on recalc | T2.11 — one new row in payroll_audit_log |
| P2.6 | TS preview matches DB | Same inputs as T2.1–T2.9, identical totals |
| P2.7 | Code-review pass clean | Sub-agent reports zero divergence from calcAgentPay_ |
