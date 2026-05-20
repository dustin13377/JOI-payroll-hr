# Phase 2 Calc Engine — Code Review for Joe

**Reviewer:** Claude (automated port review)  
**Date:** 2026-05-19  
**Source compared:** `JOI_PAYROLL_CLEAN.js` `calcAgentPay_()` (line 885) vs. `20260519000005_payroll_phase2_calc_engine.sql`  
**Status:** 2 findings require Joe's decision before closing.

---

## Summary

The port is faithful to `calcAgentPay_()`. All four branches (PAID guard, include=false,
partial week, full week), all eight output components, the rounding policy, and the
audit log are implemented as specified.

Two divergences were discovered during the review. Both are flagged as first-class
findings below — not footnotes — because each has a real-world impact on employee pay.

---

## Finding 1 — `calcPartialWeekPay_` omits `holiday_pay` (possible underpay bug)

**File:** `JOI_PAYROLL_CLEAN.js`  
**Line:** 3099 (`calcPartialWeekPay_` helper)  
**Severity:** ⚠️ Possible bug — affects new hires who work a holiday during their first partial week

`calcPartialWeekPay_` (line 3099) computes the total as:

```js
total = weeklyBase + kpiBonus + overtimePay + sundayBonus + spiffs
// holiday_pay is NOT included
```

`calcAgentPay_()` (line 920–925), the canonical function called by every recalc,
includes `holiday_pay` in the partial-week total:

```js
total = weeklyBase + kpiBonus + overtimePay + sundayBonus + holidayPay + spiffs
// holiday_pay IS included
```

Your `JOE_PAYROLL_HANDOFF.md §4.2` also documents `holiday_pay` as included in the
partial-week total.

**What the port does:** Follows `calcAgentPay_()` and the HANDOFF — `holiday_pay` is
included. This is almost certainly the correct behavior: a new hire who worked a
holiday during their first three days should receive the Art. 75 premium.

**Impact of the bug in `calcPartialWeekPay_`:** Any partial week that coincided with
a public holiday would underpay the employee by `daily_salary × 2`. For example, at
a daily rate of $500 MXN, that is a $1,000 underpayment per holiday per partial week.

**Action needed from Joe:**  
Confirm that `calcAgentPay_()` is the intended behavior (holiday_pay included).
If so, `calcPartialWeekPay_` at line 3099 needs a one-line fix to add `holidayPay`
to its total. It is also worth checking the Payroll Run sheet for any historical
partial-week rows that landed on a public holiday — those employees may be owed a
retroactive correction.

---

## Finding 2 — Rounded vs. unrounded intermediate for partial-week `weekly_base`

**File:** `JOI_PAYROLL_CLEAN.js`  
**Line:** ~922 (`calcAgentPay_()` partial-week branch)  
**Severity:** ⚠️ Spec-vs-code divergence — no financial impact at current rates, but creates ambiguity

`HANDOFF.md §4.2` documents the partial-week base as a **rounded intermediate**:

```
weeklyBase = round(dailySalary × daysWorked, 2)
```

The actual JS code at line ~922 does **not** round `weeklyBase` before summing it into
the total — only the final total is rounded:

```js
const weeklyBase = dailySalary * daysWorked;  // NOT rounded here
total = round(weeklyBase + kpiBonus + ...);   // rounded at the total level only
```

**What the port does:** Follows the HANDOFF (each intermediate is rounded), forced by
Postgres `numeric(12,2)` column storage — any intermediate assigned to `c.weekly_base`
is automatically stored at two decimal places. For JOI's current rates (integer daily
salaries), `round(500 × 3, 2) = 1500.00` and `500 × 3 = 1500`, so there is no
observable difference today.

**Why this matters anyway:** If a non-integer daily rate is ever entered (e.g.,
$733.33/day), the two approaches produce different intermediate values, which can
compound into a $0.01–$0.02 difference in the final total depending on the other
components. The HANDOFF is the authoritative spec the port was written against;
if Joe's intent is the unrounded-intermediate version, the HANDOFF needs a correction.

**Action needed from Joe:**  
Pick a winner:  
- If **HANDOFF is correct** (rounded intermediates): add `Math.round(dailySalary * daysWorked * 100) / 100` at line ~922 in the JS.  
- If **JS is correct** (unrounded intermediate, total only): update HANDOFF §4.2 to remove the `round()` wrapper from `weeklyBase`. The Postgres port will remain consistent with `numeric(12,2)` storage rounding, but the intent will be documented.

---

## Line-by-line comparison — no other divergences

| calcAgentPay_() behavior | Port behavior | Match? |
|---|---|---|
| `include_in_payroll = false` → zero all calc columns | Branch B zeros all 8 columns, `extra_bonus` untouched in input column | ✅ |
| `kpi_bonus = kpiBonus if kpiAchieved else 0` | `CASE WHEN r.kpi_achieved THEN e.kpi_bonus_amount ELSE 0` | ✅ |
| `overtime_pay = overtimeDays × overtimePay` | `round((r.overtime_days * e.overtime_day_pay)::numeric, 2)` | ✅ |
| `sunday_pay = sundays × sundayBonus` | `round((r.sundays_worked * e.sunday_bonus_amount)::numeric, 2)` | ✅ |
| `holiday_pay = holidays × dailySalary × 2` (Art. 75 extra only) | `round((r.holiday_days * e.daily_salary * 2)::numeric, 2)` | ✅ |
| Partial: `weekly_base = dailySalary × daysWorked` | `round((e.daily_salary * r.partial_week_days)::numeric, 2)` — see Finding 2 | ✅ (with caveat) |
| Partial: `missed_deduction = 0` | `c.missed_deduction := 0` | ✅ |
| Partial: `vacation_pay = 0` | `c.vacation_pay := 0` | ✅ |
| Partial: `total = weeklyBase + kpi + overtime + sunday + holiday + spiffs` | Same — includes `holiday_pay` per `calcAgentPay_` (not `calcPartialWeekPay_`) | ✅ (see Finding 1) |
| Full: `weekly_base = weeklyBaseSalary` (flat) | `c.weekly_base := e.weekly_base_salary` | ✅ |
| Full: `missed_deduction = missedDays × dailyDiscount` | `round((r.missed_days * e.daily_discount_rate)::numeric, 2)` | ✅ |
| Full: `vacation_pay = vacDays × dailySalary × (1 + vacationPct)` | `round((r.vacation_days * e.daily_salary * (1 + e.vacation_premium_pct))::numeric, 2)` | ✅ |
| Full: `total = weeklyBase - missed + kpi + overtime + sunday + vacation + holiday + spiffs` | Same | ✅ |
| PAID row (RPC): raise exception | `RAISE EXCEPTION ... USING ERRCODE = '23514'` | ✅ |
| PAID row (trigger): return OLD silently | `IF OLD.status = 'PAID' THEN RETURN OLD` | ✅ |
| Every recalc → audit log row | INSERT into `payroll_audit_log` with before/after jsonb | ✅ |
| Rounding policy: each intermediate rounded | `round(x::numeric, 2)` on every component | ✅ |
