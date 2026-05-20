# Sonnet Prompt — JOI Payroll Phase 3 (Auto-Derive from time_clock + eod_logs)

> **How D uses this:** Open a fresh Cowork session. Paste this entire file as the first message.

---

You are building Phase 3 of the JOI payroll port. **Phase 3 is the killer feature** that motivated the whole migration from Joe's Sheets: instead of Joe hand-typing missed-days / overtime / Sundays for 45 agents every week, the app reads `time_clock` + `eod_logs` and auto-populates the input columns on `payroll_records`. Owner/manager reviews + can override before locking.

Phase 5 (historical archive) was deliberately skipped — see PAYROLL_PLAN.md for rationale. Engine validation will happen via parallel-run on a live pay period once Phase 4 (UI) is built.

## Read These First

1. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/PAYROLL_PLAN.md` — Section 7 (Auto-Derivation) is your spec.
2. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/CLAUDE.md` — destructive-ops rule, todayLocal, no git push.
3. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/HANDOFF.md` — Phase 1 + 2 done state.
4. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/JOE_PAYROLL_HANDOFF.md` — §4.2 (partial-week / scheduled-day count), §5.2 (week boundaries Mon-Sun).
5. Phase 1 + 2 migration files in `supabase/migrations/`.
6. **Existing tables you'll read from:**
   - `time_clock` — columns: `employee_id, date, clock_in, clock_out, lunch_start, lunch_end, break1_start, break1_end, break2_start, break2_end`
   - `eod_logs` — daily KPI submissions per agent per campaign
   - `mexican_holidays` (seeded in Phase 1) — `date, name_es, name_en, type, pays_premium`
7. **Existing employee fields you'll read:**
   - `shift_type` enum: `L-J` (Mon-Thu), `L-V` (Mon-Fri), `V-D` (Fri-Sun), `V-L` (Fri-Mon)
   - `hire_date` — drives partial-week-days for mid-week hires
   - `last_worked_day` — terminated agents

Auto-memory has the JOI context, including [[project_campaign_kpis]] (per-campaign KPI rules) and [[project_tl_submit_eod_for_no_login_agent]] (TL-submit-EOD covers no-login agents during their first 30 days).

## Hard Rules

1. **Auto-derive runs once when a `payroll_week` is created.** It populates `payroll_records.auto_derived jsonb` with a snapshot of what time_clock said. It does NOT overwrite a row that already exists — that protects manually-edited inputs.
2. **Re-derive is a deliberate, explicit action.** Owner/manager calls `pay_redrive_week(week_id, p_confirm boolean)` only after seeing a diff. Never silent.
3. **Manually-overridden inputs survive re-derive.** If `payroll_records.X != auto_derived.X` for any input field, that field was manually changed — preserve it on re-derive. Compare against the snapshot, not against new auto-derived values.
4. **PAID rows are immutable.** Auto-derive and re-derive both refuse to touch any record with `status = 'PAID'`. Same protection as Phase 2.
5. **No destructive SQL without explicit yes.** Same global rule.
6. **No `git push` from sandbox.** Hand D terminal commands.
7. **Local dates only.** Week boundaries are calendar dates in America/Mexico_City. Use `todayLocal()` for any default. No UTC drift.

## Decisions Already Made

- Per-employee scheduled days driven by `shift_type` (v1). v2 = per-employee schedule table.
- Mexican holidays seeded from LFT Article 74 in Phase 1.
- Auto-derive runs against active employees only (`is_active = true AND is_system_user = false`).
- The function reads `time_clock` directly — no edge function, no network call.

## Decisions Pending — Ask D in a Single Batch

Batch all four into one `AskUserQuestion` call. Block on answers before writing the function.

1. **Overtime day threshold** — at what worked-hours-in-a-day does a clock-in count as an "overtime day"? Recommend: **9 hours of net worked time** (clock_out − clock_in − lunch − breaks > 9 hours). Joe's Sheets uses a simpler "Joe types in the count," so there's no existing convention to inherit. 9 hours = LFT standard 8-hour day + the typical 1-hour lunch already deducted. Confirm or pick a different threshold.

2. **Agents with ZERO time_clock rows for the whole week** — assume "all scheduled days missed" or flag for manual review (auto-derive `missed_days = NULL`, owner must fill in)? Recommend: **flag for manual review** (NULL not 0, with a note in the auto_derived snapshot like `{ status: 'NO_DATA', scheduled_days: 5 }`). Reason: "all days missed" might be wrong — they could be on vacation, on medical leave, or a no-login TL-managed agent. Better to surface and let the owner decide.

3. **TL-submit-EOD path for no-login agents** — for agents during their first 30 days, time_clock data comes from the `edit-time-clock` edge function (TL fills in punches). Should auto-derive treat those punches identically to self-submitted ones? Recommend: **yes, identical** — once the row is in `time_clock`, it's data. The source doesn't matter.

4. **Partial-week handling on hire** — if `employees.hire_date` falls within the week being derived, should auto-derive set `partial_week_days` = (scheduled days from hire_date to week_end)? Recommend: **yes** — this is exactly the mid-week-hire case from Joe's HANDOFF §4.2. Same logic for `last_worked_day` (mid-week termination) → set `missed_days` for the days after last_worked_day, not `partial_week_days` (per the decision locked in Phase 2).

## Deliverables (in order)

### 1. Pre-flight checks

Use Supabase MCP `execute_sql` to gather and report:

```sql
-- Total active employees
SELECT count(*) FROM employees
WHERE is_active = true AND is_system_user = false;

-- Employees missing shift_type (will break scheduled-day calc)
SELECT employee_id, full_name, hire_date FROM employees
WHERE is_active = true AND is_system_user = false
  AND (shift_type IS NULL OR shift_type NOT IN ('L-J','L-V','V-D','V-L'));

-- Employees missing hire_date (can't compute partial-week-on-hire)
SELECT count(*) FROM employees
WHERE is_active = true AND is_system_user = false AND hire_date IS NULL;

-- Latest time_clock row + earliest (date range of data we have)
SELECT min(date), max(date), count(*) FROM time_clock;

-- Holiday count seeded
SELECT count(*) FROM mexican_holidays WHERE type = 'LFT_OFICIAL';
```

Report to D. If anything looks wrong (e.g., 10 employees missing shift_type), pause and ask before continuing.

### 2. Scheduled-day mapping function `_scheduled_days_for_shift(shift_type)`

A tiny pure function that returns the array of DOW integers for a shift_type:
- `L-J` → `ARRAY[1,2,3,4]` (Mon-Thu)
- `L-V` → `ARRAY[1,2,3,4,5]` (Mon-Fri)
- `V-D` → `ARRAY[5,6,0]` (Fri,Sat,Sun — note Sun = 0 in Postgres `extract(dow ...)`)
- `V-L` → `ARRAY[5,6,0,1]` (Fri-Mon)
- NULL or unknown → empty array (caller decides what to do)

### 3. Per-employee per-week derive function `_derive_inputs_for_employee_week(employee_id uuid, week_start date, week_end date)`

Returns a record (or jsonb) with the derived input values. Pure function — no writes.

Logic:

```
e = SELECT * FROM employees WHERE id = employee_id
scheduled_dow = _scheduled_days_for_shift(e.shift_type)

-- Effective week range, capped by hire_date and last_worked_day
effective_start = greatest(week_start, e.hire_date)
effective_end   = least(week_end, coalesce(e.last_worked_day, week_end))

-- Scheduled days within effective range
scheduled_days = count of dates d in [effective_start..effective_end]
                 where extract(dow from d) = ANY(scheduled_dow)

-- Time_clock rows for this employee in the week
tc = SELECT * FROM time_clock
     WHERE employee_id = e.id
       AND date BETWEEN week_start AND week_end
       AND clock_in IS NOT NULL

IF count(tc) = 0:
   RETURN jsonb {
     status: 'NO_DATA',
     scheduled_days: <scheduled_days>,
     missed_days: NULL,    -- flag for manual review per Decision #2
     overtime_days: 0, sundays_worked: 0, holiday_days: 0,
     partial_week_days: NULL,
     kpi_achieved: NULL    -- can't derive without time_clock context
   }

-- Days actually clocked in (distinct dates)
clocked_dates = distinct date from tc

-- Missed days = scheduled days not clocked
missed_days = count of d in scheduled_dow where d in effective range AND d NOT IN clocked_dates

-- Overtime days = tc rows where net worked > threshold (default 9hr, see Decision #1)
overtime_days = count(tc) where
  extract(epoch from clock_out - clock_in
          - coalesce(lunch_end - lunch_start, '0')
          - coalesce(break1_end - break1_start, '0')
          - coalesce(break2_end - break2_start, '0')) / 3600 > 9

-- Sundays worked = tc rows where dow = 0
sundays_worked = count(tc) where extract(dow from date) = 0

-- Holiday days = tc rows where date in mexican_holidays.pays_premium
holiday_days = count(tc) where date IN (
  SELECT date FROM mexican_holidays WHERE pays_premium = true
)

-- KPI achieved = derived from eod_logs per [[project_campaign_kpis]]
-- For v1, default to NULL (manual review) UNLESS we have a clear rule:
--   * For Torro SLOC: count eod_logs.calls_made >= threshold for that campaign
--   * For other campaigns: check the rules per [[project_campaign_kpis]]
-- If campaign rules are ambiguous, return NULL and let owner decide.

-- Partial week on hire
partial_week_days = NULL
IF e.hire_date IS NOT NULL AND e.hire_date BETWEEN week_start AND week_end:
   partial_week_days = count of scheduled days from e.hire_date to week_end

RETURN jsonb {
  status: 'DERIVED',
  scheduled_days, missed_days, overtime_days, sundays_worked,
  holiday_days, partial_week_days, kpi_achieved,
  notes: array of any flags (e.g., 'mid_week_hire', 'mid_week_termination')
}
```

### 4. Driver function `pay_derive_week(p_week_id uuid)`

For a given `payroll_weeks` row:
1. SELECT week_start, week_end.
2. For each active employee where:
   - `is_active = true AND is_system_user = false`
   - `coalesce(last_worked_day, '9999-12-31') >= week_start` (skip employees terminated before this week)
   - `coalesce(hire_date, '1900-01-01') <= week_end` (skip employees hired after this week)
3. Check if a `payroll_records` row already exists for `(week_id, employee_id)`:
   - **If yes:** do nothing. Auto-derive never overwrites existing records.
   - **If no:** INSERT a new `payroll_records` row with the derived inputs + `auto_derived jsonb` snapshot. Status = `UNPAID`. The Phase 2 trigger will fire and compute the calc columns automatically.

Return a summary: `{ inserted: N, skipped_existing: M, no_data_flags: K, mid_week_hires: J }`.

### 5. Re-derive function `pay_redrive_week(p_week_id uuid, p_confirm boolean)`

For owner/manager use, with safety:
- If `p_confirm = false`: return a DIFF — what would change if re-derived? Do not write.
- If `p_confirm = true`: for each non-PAID row in the week:
  - Compute fresh auto-derived values
  - Compare with `auto_derived` snapshot stored on the record
  - For each input field, if `current_value = snapshot_value`, that field hasn't been manually overridden → overwrite with fresh value
  - If `current_value != snapshot_value`, field WAS manually overridden → preserve user's value, log to the diff
  - Update `auto_derived` snapshot to the fresh values
  - The Phase 2 trigger fires on input changes → calc columns recompute
- Returns the diff (what changed, what was preserved as manual override).

### 6. RLS + permissions

- `pay_derive_week` and `pay_redrive_week`: `SECURITY DEFINER`, executable by owner + manager roles only (check via existing role helpers).
- Agents cannot call either function.

### 7. Tests `<ts>_payroll_phase3_tests.sql`

Use synthetic employees + time_clock rows. Cover:

| Test | Scenario | Expected |
|---|---|---|
| T3.1 | L-V employee, clocked in Mon-Fri all 5 days | missed=0, ot=0, sundays=0, holidays=0 |
| T3.2 | L-V employee, missed Wednesday | missed=1 |
| T3.3 | L-V employee, worked Sunday (overtime?) | sundays_worked=1 |
| T3.4 | V-D employee (Fri/Sat/Sun), clocked Fri+Sat+Sun | missed=0, sundays_worked=1 |
| T3.5 | L-V employee, worked Sept 16 2026 (LFT holiday) | holiday_days=1 |
| T3.6 | Employee with clock_in 8am, clock_out 7pm, 1hr lunch | net 10hr → overtime=1 |
| T3.7 | Employee with hire_date mid-week (e.g., Wednesday) | partial_week_days=3 (Wed+Thu+Fri for L-V) |
| T3.8 | Employee with last_worked_day mid-week | missed_days=remaining scheduled days; partial=NULL |
| T3.9 | Employee with zero time_clock rows for whole week | status=NO_DATA, missed_days=NULL |
| T3.10 | Re-derive after manual override of missed_days | Manual value preserved; other fields refresh |
| T3.11 | pay_derive_week on a week with one PAID and one UNPAID row | Only UNPAID row touched if it's a new insert; PAID untouched |
| T3.12 | Active employee terminated 2 weeks ago | Skipped (not included in derive) |

Each test sets up data, calls the function, asserts, cleans up. Use `RAISE NOTICE 'T3.X passed'` for success or `RAISE EXCEPTION` on failure.

### 8. Code-review pass

Sub-agent reviews:
- The `_scheduled_days_for_shift` mapping is correct for all 4 shift_type values
- The dow extraction uses `extract(dow ...)` consistently (Postgres Sunday = 0)
- The time interval math handles NULL lunch/break columns (use `coalesce` everywhere)
- Re-derive correctly distinguishes "manually overridden" from "unchanged since auto-derive"
- PAID rows are protected in both functions
- RLS / SECURITY DEFINER are set correctly so agents can't trigger derive

### 9. Update HANDOFF.md + PAYROLL_DECISIONS.md

### 10. Deploy commands for D

Same pattern as Phases 1, 2.

## Acceptance Checks (Phase 3)

| # | Check | How |
|---|---|---|
| P3.1 | Both functions exist | `SELECT proname FROM pg_proc WHERE proname IN ('pay_derive_week','pay_redrive_week','_derive_inputs_for_employee_week','_scheduled_days_for_shift')` returns 4 |
| P3.2 | All 12 T3 tests pass | Each test has its own assertion |
| P3.3 | Test create: a `payroll_weeks` row for a current week, then `pay_derive_week()` it | New `payroll_records` rows appear with auto_derived populated; the Phase 2 trigger has already filled in calc columns; total_pay > 0 for clocked-in employees |
| P3.4 | Re-derive on a week with a manually-overridden missed_days | DIFF shows the manual value preserved; other inputs refreshed |
| P3.5 | Re-derive with p_confirm=false | Returns diff, no writes |
| P3.6 | Agent role tries to call `pay_derive_week` | RLS rejects |

## What This Phase Does NOT Do

- ❌ No React UI. Phase 4.
- ❌ No imports from Joe's archive (Phase 5 deliberately deferred).
- ❌ No paystub generation.
- ❌ No tax withholding or aguinaldo — deferred to "new entity" project per D.

## Done Looks Like

D pastes deploy commands. Migrations apply. All T3 tests pass. D creates a test `payroll_weeks` row for last week (May 11-17), runs `pay_derive_week`, and sees ~45 `payroll_records` rows appear, each with calc columns auto-populated by the Phase 2 trigger. HANDOFF.md ends with `Payroll Phase 3 — DONE — auto-derive working`.

## If Stuck

If `time_clock` data quality is bad for a chunk of employees (e.g., 20% of active employees have zero rows for the last week), pause and tell D before claiming P3.3 — that's a data hygiene issue, not a function bug, but it changes how Phase 4 (UI) should surface "needs review" states. Better to surface it now.
