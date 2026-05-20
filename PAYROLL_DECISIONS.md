# Payroll Decisions Log

Locked decisions made during payroll build-out. Read this before changing any payroll calc logic.

---

## Phase 3 — Auto-Derive (2026-05-20)

These decisions govern how `_derive_inputs_for_employee_week` reads `time_clock` and fills in the input columns on `payroll_records`.

### D1 — Overtime threshold: 9 net hours

A day counts as an overtime day when net worked time > 9 hours.

**Net = (clock_out − clock_in) − lunch − break1 − break2.**

NULL lunch/break intervals are treated as zero (COALESCE to `0 seconds`). Only rows with both `clock_in` and `clock_out` non-NULL are counted.

_Why 9:_ Joe's existing `calcAgentPay_` sheet uses 9 hours as the OT cutoff, not the LFT standard 8. Compliance alignment is deferred to the new business entity (see `PAYROLL_PHASE1_DECISIONS.md`).

---

### D2 — Zero clock-in rows → `NO_DATA`, column gets `0`

If an employee has no `clock_in` rows for the entire week, the function returns `status='NO_DATA'`. All input columns (`missed_days`, `overtime_days`, etc.) are set to `0` in the DB row (the NOT NULL column default). The `auto_derived.status` key carries `'NO_DATA'` so the Phase 4 UI can flag these rows for owner review.

_Why 0 not NULL:_ `payroll_records.missed_days` is `NOT NULL`. Setting it to 0 allows the PAID-lock trigger and recalc trigger to fire cleanly. The review flag lives in the jsonb snapshot, not the column.

---

### D3 — NULL shift_type → `NO_SHIFT_TYPE`, same treatment as NO_DATA

If `employees.shift_type` is NULL or not one of the four known values (L-J, L-V, V-D, V-L), we can't compute which days are "scheduled." Returns `status='NO_SHIFT_TYPE'`, all columns to `0`, flagged for review.

---

### D4 — TL-submitted punches count the same as self-submitted

`time_clock` rows inserted by the `edit-time-clock` edge function (TL submitting for a no-login agent) have no special flag. The derive function counts them identically to agent self-clock rows.

---

### D5 — Mid-week hire: set `partial_week_days`

When `employees.hire_date` is strictly inside the week (`hire_date > week_start AND hire_date <= week_end`), the function sets `partial_week_days` = number of scheduled days from `hire_date` to `week_end`. This lets the Phase 2 calc engine prorate correctly.

`partial_week_days` is NULL for a full week. NULL means full week — the pay formula divides by `scheduled_days` only when `partial_week_days IS NULL`.

Note: `v_eff_start = GREATEST(week_start, hire_date)` so days before hire_date are excluded from both `scheduled_days` and `missed_days` counts.

---

### D6 — Mid-week termination: use `missed_days`, not `partial_week_days`

When `employees.last_worked_day` is inside the week (`last_worked_day >= week_start AND last_worked_day < week_end`), scheduled days after `last_worked_day` with no clock-in count as **missed days** (not partial week days). `partial_week_days` stays NULL.

**Key implementation detail:** The missed_days `generate_series` uses `p_week_end` as the upper bound (not `v_eff_end`). This is intentional — `v_eff_end = LEAST(week_end, last_worked_day)` caps `scheduled_days` correctly, but for missed_days we need the full scheduled range to `week_end` so that days after the last punch count as missed.

Example: L-V employee, `last_worked_day = Thu Jan 8`, clocked Mon–Thu.
- `v_eff_end = Jan 8`
- `scheduled_days` = 4 (Mon–Thu within effective range)
- `missed_days` = 1 (Fri Jan 9 is a scheduled day, no punch → missed)
- `partial_week_days` = NULL

The `mid_week_termination` note is added to `auto_derived.notes` for the Phase 4 UI to surface.

---

## Phase 4a — UI (2026-05-20)

### UI-D1 — Sidebar placement
"Payroll" nav entry replaces "Payroll Run" in the leadership main sidebar, positioned after "Employees." Points to `/admin/payroll`. Old `/payroll-run` route (Phase 0 page) still accessible by URL until Phase 4c cleanup.

### UI-D2 — Manager campaign scope
No `manager_campaigns` join table exists in the DB. Managers see all campaigns via RLS (server enforces per-employee_id). If per-manager campaign filtering is needed, create a `manager_campaigns` table matching the `team_lead_campaigns` shape and update `useWeekRecords`.

### UI-D3 — KPI achieved UX
Inline toggle (shadcn Switch) in the expanded row. Auto-derive populates it; manager/owner can flip it. Most-edited cell after extra_bonus.

### UI-D4 — Add Next Week: owner only
Creating a payroll week is a pay-cadence decision. Only owner can trigger "Add Next Week". Managers can view but not create weeks.

### UI-D5 — extra_bonus permission matrix
- PAID → nobody can edit
- COMPLETE → owner only
- UNPAID → owner + any manager (no per-campaign filter)

### UI-D6 — PAID row behavior
PAID rows: greyed background (`bg-muted/50`), lock icon instead of chevron, click handler is no-op, expanded row never renders. DB trigger blocks UPDATE on PAID rows as defense in depth.

### UI-D7 — Re-derive button is a stub in 4a
Button exists and opens a dialog explaining it's coming in Phase 4c. Backend RPC `pay_redrive_week` is live but the diff UX is Phase 4c.

### UI-D8 — No new DB migrations in Phase 4a
4a is UI-only. The only change to the table name convention: hooks use `payroll_periods` (correct) not `pay_periods` (the name used in the original prompt spec, which was wrong).

---

## Phase 1 — Schema + Rates (2026-05-19)

See `PAYROLL_PHASE1_DECISIONS.md` for the full set of Phase 1 decisions (column choices, archive design, bi-monthly period format, etc.).

---

## Phase 2 — Calc Engine (2026-05-19)

See `JOE_PAYROLL_HANDOFF.md` for Joe's original `calcAgentPay_` formula. Phase 2 is a direct port — no business rule changes. Acceptance test: Javier Garcia's record produces $73,987.50 total pay matching Joe's Sheet exactly.

Key formula:

```
weekly_base       = daily_salary × scheduled_days          (or partial_week_days if set)
missed_deduction  = daily_discount_rate × missed_days
kpi_bonus         = kpi_bonus_amount if kpi_achieved else 0
overtime_pay      = overtime_day_pay × overtime_days
sunday_pay        = sunday_bonus_amount × sundays_worked
vacation_pay      = weekly_base × vacation_premium_pct     (only when vacation_days > 0)
holiday_pay       = daily_salary × 2 × holiday_days        (double pay for worked holidays)
total_pay         = weekly_base - missed_deduction + kpi_bonus + overtime_pay
                  + sunday_pay + vacation_pay + holiday_pay
```

---

## Deferred to new business entity

- Mexican LFT minimum wage compliance
- Art. 123 / 127 profit sharing (PTU)
- ISR / IMSS withholding
- Aguinaldo calculation
- Prima vacacional auto-accrual

These are tracked in `PAYROLL_PLAN.md` under "out of scope v1."
