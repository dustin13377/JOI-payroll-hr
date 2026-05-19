# Payroll Phase 1 — Schema Review for Joe

**Date:** 2026-05-19
**Reviewer:** Joe Renteria (requested)
**Review window:** 48 hours from receipt. Flag anything missing for `calcAgentPay_` and we'll add a nullable column in Phase 2. If nothing heard, we proceed.

This doc covers the new database schema for Phase 1. Phase 2 is the port of your `calcAgentPay_` function into a Supabase RPC called `pay_calc_record`. That's where you have a hard sign-off gate — nothing goes live on the calc engine without your OK.

---

## What Phase 1 does

- Adds 5 pay-rate columns to the existing `employees` table (the inputs your formula reads from `rule.*`).
- Creates `payroll_periods`, `payroll_weeks`, and `payroll_records` — the three-level ledger that replaces Joe's Payroll Run sheet.
- Creates `payroll_archive` for the historical March + April 2026 Sheets data (import in Phase 5).
- Creates `payroll_audit_log` for an append-only change trail.
- Extends `mexican_holidays` with the full LFT Art. 74 columns and seeds 2026 + 2027 dates.

---

## employees — new pay-rate columns

These map directly to your `rule.*` inputs in `calcAgentPay_`.

| New column | Your field | Notes |
|---|---|---|
| `weekly_base_salary numeric(12,2)` | `rule.weeklyBase` | Backfilled from `monthly / 4` for all seeded employees |
| `daily_salary numeric(12,2)` | `rule.dailySalary` | **Stored explicitly.** Backfilled from `daily_discount_rate`. NOT derived as `weekly / 5` at calc time — this matters for weekend-only workers (3 scheduled days, not 5). |
| `overtime_day_pay numeric(12,2)` | `rule.overtimePay` | Defaults to 0 — set per employee via Phase 4 UI |
| `sunday_bonus_amount numeric(12,2)` | `rule.sundayBonus` | Defaults to 0 |
| `vacation_premium_pct numeric(5,4)` | `rule.vacationPct` | Defaults to 0.25 (25%). DB-level CHECK enforces >= 0.25 per LFT Art. 80 |

**Key decision:** We're moving from your rule-key system (`CAMPAIGN|DEPT|SHIFT`) to per-employee rates stored directly on each employee record. The per-employee model is more flexible for negotiated rates, and the Phase 4 Pay Rates editor will support bulk-edit by group. The `calcAgentPay_` formula itself is unchanged — it just reads from employee columns instead of a rule lookup table.

---

## payroll_records — per-employee per-week ledger row

One row per employee per week. This is the equivalent of a single agent row in your Payroll Run sheet.

### Input fields (auto-derived in Phase 3, manually overridable)

| Column | Your col | Type |
|---|---|---|
| `include_in_payroll` | col 4 (Include In Payroll) | boolean, default true |
| `missed_days` | col 5 | int, default 0 |
| `overtime_days` | col 6 | int, default 0 |
| `sundays_worked` | col 7 | int, default 0 |
| `vacation_days` | col 8 | int, default 0 |
| `holiday_days` | col 9 | int, default 0 |
| `kpi_achieved` | col 10 | boolean, default true |
| `extra_bonus` | col 18 (Spiffs) | numeric(12,2), default 0 |
| `partial_week_days` | col 20 | int, NULL = full week |

`partial_week_days` is NULL for a full week, positive integer for a partial week (mid-week hire start). The Phase 2 calc engine branches on this: if not null, uses `weeklyBase = dailySalary × daysWorked` with no missed deduction and no vacation pay, matching your HANDOFF §4.2.

### Calculated fields (written by Phase 2 `pay_calc_record` RPC)

| Column | Your col | Type |
|---|---|---|
| `weekly_base` | col 11 | numeric(12,2) |
| `kpi_bonus` | col 12 | numeric(12,2) |
| `missed_deduction` | col 13 | numeric(12,2) |
| `overtime_pay` | col 14 | numeric(12,2) |
| `sunday_pay` | col 15 | numeric(12,2) |
| `vacation_pay` | col 16 | numeric(12,2) |
| `holiday_pay` | col 17 | numeric(12,2) |
| `total_pay` | col 19 | numeric(12,2) |

**Holiday pay interpretation (LFT Art. 75):** `holiday_pay = holidayDays × dailySalary × 2`. This is the *extra* premium only. `weekly_base` already covers the regular day's pay. This matches your HANDOFF §3.4 comment.

**Vacation pay interpretation (LFT Art. 80):** `vacation_pay = vacationDays × dailySalary × (1 + vacationPct)`. This is added to `weekly_base` (you still get your regular daily pay for vacation days, plus the prima vacacional on top). Matches your HANDOFF §4.1.

All money columns are `numeric(12,2)`. No floats anywhere.

---

## payroll_periods — bi-monthly pay periods

| Column | Notes |
|---|---|
| `period_code text UNIQUE` | e.g. `'APRIL26PP1'` — matches your `payPeriodCode_()` output exactly |
| `year int`, `month int` | 1–12 |
| `half text` | `'PP1'` or `'PP2'` |
| `start_date`, `end_date` | Week boundaries |
| `status` | `'OPEN'` → `'COMPLETE'` → `'LOCKED'` |

PP1 = weeks whose end-date falls on or before the 15th. PP2 = the rest. This matches your current Sheets structure.

---

## payroll_weeks — one row per week-block per period

Bridge between a period and the employee ledger rows. `week_start = Monday`, `week_end = Sunday`. `week_number` is 1–5 (up to 5 weeks per period in a long month).

Status: `'UNPAID'` → `'COMPLETE'` → `'PAID'`. Once a week is PAID, the records under it are locked (DB trigger blocks updates on PAID records). To correct a PAID record, leadership must run the "Unlock PAID Period" flow first.

---

## mexican_holidays — LFT Art. 74 seed data

7 official holidays for 2026 and 7 for 2027. Moving-Monday dates per the 2006 LFT reform:

| Holiday | 2026 | 2027 |
|---|---|---|
| Año Nuevo | Jan 1 | Jan 1 |
| Día de la Constitución (1st Mon of Feb) | Feb 2 | Feb 1 |
| Natalicio de Benito Juárez (3rd Mon of Mar) | Mar 16 | Mar 15 |
| Día del Trabajo | May 1 | May 1 |
| Día de la Independencia | Sep 16 | Sep 16 |
| Día de la Revolución (3rd Mon of Nov) | Nov 16 | Nov 15 |
| Navidad | Dec 25 | Dec 25 |

`pays_premium = true` on all of these, which triggers the Art. 75 2× premium in `holiday_pay`.

Dec 1 presidential transition: last was 2024 (Sheinbaum). Next is 2030. Not included.

---

## What Phase 2 will need from you

Phase 2 is the `pay_calc_record` Supabase RPC — the port of `calcAgentPay_` into SQL/plpgsql. Before that goes live you'll get a full formula review doc with the exact SQL translation of every branch (full week, partial week, kpi bonus, missed deduction, overtime, sunday, vacation, holiday). That's your sign-off gate.

**Questions for you now (flag within 48 hours):**

1. Is there any input field that `calcAgentPay_` reads that is NOT listed in the `payroll_records` input columns above?
2. Is there any calculated output that is NOT listed above?
3. Is the `holiday_pay = holidayDays × dailySalary × 2` (extra premium only, weeklyBase covers the base day) interpretation correct?
4. Is the `vacation_pay = vacationDays × dailySalary × (1 + vacationPct)` interpretation correct?
5. The `partial_week_days` branch: `weeklyBase = dailySalary × daysWorked`, no missedDed, no vacationPay — is that right?

If nothing, we proceed. If you spot something, one extra nullable column in Phase 2 is not catastrophic.
