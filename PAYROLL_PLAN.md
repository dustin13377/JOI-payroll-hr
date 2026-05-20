# JOI Payroll — Migration Plan (Sheets → App)

**Author:** Claude (planning session with D, 2026-05-19, revised after discovering existing payroll scaffolding)
**Status:** Draft, awaiting Joe sign-off before any code lands.
**Source spec:** Joe's HANDOFF.md (uploaded 2026-05-19) — pay formulas, status workflow, Mexican LFT logic.

---

## 0. TL;DR

We port Joe's Google Sheets payroll math into the JOI Supabase app. **Joe's pay-calculation formula is the source of truth.** We do not redesign the math.

What changes vs. Joe's Sheets:

1. **Storage:** Postgres tables in Supabase, RLS-enforced, audit trail, PAID rows immutable via DB triggers.
2. **Source data:** Instead of Joe typing missed-days every week, the app derives those from `time_clock` + `eod_logs` and surfaces them for owner/manager review.
3. **Rate model:** **Per-employee** (matches the app's existing `monthly_base_salary` etc. fields). NOT rule-based like Joe. Joe's rule system gets replaced by per-employee fields + the existing `department_id` FK.
4. **Access:** Owner + Managers view/edit. Owner-only locks a pay period to PAID.
5. **History:** Joe's March + April 2026 data imported as a read-only archive so YTD totals + paystub history survive the cutover.

Run side-by-side with Joe's Sheets for 1–2 pay periods. Acceptance test T1: Javier's YTD = **$73,987.50 MXN**. When the app matches the Sheet to the cent two periods running, we retire the Sheet.

---

## 1. What Already Exists in the App (Phase 0 audit)

Before I planned anything new, I checked the codebase. Here's what's already there.

### 1.1 Employee fields (already exist on `employees`)
| Column | Type | Maps to Joe's | Notes |
|---|---|---|---|
| `monthly_base_salary` | numeric(12,2) | weekly_base × 4 | Keep. Backfill weekly from this. |
| `daily_discount_rate` | numeric(12,2) | missed_day_ded | Keep. Same concept. |
| `kpi_bonus_amount` | numeric(12,2) | kpi_bonus | Keep. Same concept. |
| `shift_type` | enum `L-J`/`L-V`/`V-D`/`V-L` | shift (WEEKDAY/WEEKEND) | Keep. Used for auto-derive scheduled days. |
| `department_id` | uuid FK | the "department" slot of Joe's rule key | Already exists. **No `pay_category` needed.** |

### 1.2 Employee fields **MISSING** (must add for Joe's math)
| Column | Type | Maps to Joe's | Notes |
|---|---|---|---|
| `weekly_base_salary` | numeric(12,2) | weekly_base | Add. Backfill = monthly / 4 for current employees. |
| `daily_salary` | numeric(12,2) | daily_salary (Pay Rules Col 7) | **Add — stored, NOT derived.** Joe uses this directly in partial-week, vacation, and holiday pay. Deriving as `weekly/5` breaks weekend shifts (V-D = 3 scheduled days, daily = weekly/3). Backfill = `daily_discount_rate` (coincides on current JOI seed but conceptually distinct — daily_salary = per-day pay, daily_discount_rate = per-missed-day penalty). |
| `overtime_day_pay` | numeric(12,2) | overtime_day_pay | Add. Currently hardcoded `$1000` in `calcularNomina` — that's a bug. |
| `sunday_bonus_amount` | numeric(12,2) | sunday_bonus | Add. Joe uses flat per-Sunday amount; existing code uses 25% of daily — mismatch. |
| `vacation_premium_pct` | numeric(5,4) DEFAULT 0.25 | vacation_pct | Add. LFT Art. 80 requires ≥ 0.25. CHECK constraint. |

### 1.3 Tables that exist but are abandoned (rework with D's approval)
- `payroll_periods` (id, start_date, end_date, period_type, status) — keep, rework `period_type` to use Joe's `MARCH26PP1` codes.
- `payroll_records` (employee_id, period_id, days_absent, extra_days_count, kpi_achieved, sunday_premium_applied, holiday_worked, additional_bonuses, calculated_net_pay) — **rework**. Joe's model needs per-week granularity, not per-period; and we need calculated breakdown columns (weekly_base, kpi_bonus, missed_ded, etc.) not just net.

### 1.4 Functions that exist but need replacing
- `calcularNomina()` in `src/types/payroll.ts` — **replace with a port of Joe's `calcAgentPay_`**. The existing one has bugs (hardcoded $1000 overtime; uses monthly/30 for daily salary instead of weekly/5).

---

## 2. Decisions Made (from D, 2026-05-19)

| # | Question | Decision |
|---|---|---|
| 1 | Worked-days data source | **Auto-derive from `time_clock` + `eod_logs`.** Owner/manager reviews + overrides before locking. |
| 2 | Rate structure | **Per-employee** (matches existing app). Use `department_id` + `shift_type` for the conceptual "rule group." |
| 3 | Historical data | **Import as read-only archive.** Marked PAID + frozen. |
| 4 | Access | **Owner + Managers view/edit. Owner-only PAID lock.** |
| 5 | Existing tables | **Abandoned — free to rework** with explicit SQL shown for approval (no DROP without `yes`). |
| 6 | Calc formula | **Match Joe's `calcAgentPay_` exactly.** Replace existing `calcularNomina`. |

## 3. Open Decisions (need Joe's input)

| # | Question | My recommendation |
|---|---|---|
| A | Aguinaldo (LFT Art. 87 Christmas bonus, ≥ 15 days salary by Dec 20) — v1 or v2? | **v2.** First run is December 2026. Don't bloat v1. |
| B | Paystub PDFs + email — v1 or v2? | **v2.** v1 = in-app HTML paystub view. PDFs after math matches the Sheet 2 periods running. |
| C | Per-employee vs default schedule for auto-derive | **v1: use `shift_type` (L-V = Mon-Fri scheduled, V-D = Fri-Sun, etc.). v2: per-employee schedule table.** |
| D | Currency normalization | **Document MXN everywhere.** Add a `currency` constant, refuse to display "USD." |
| E | IMSS + ISR withholding | **Out of scope v1.** Calculation+reporting layer only. Joe's Sheets doesn't do withholding either. |

---

## 4. Mexican LFT Compliance Checklist

| Article | Requirement | Existing app | Joe | App plan |
|---|---|---|---|---|
| Art. 74 | Mandatory paid holidays (~8/year) | ❌ no holiday table | partial (manual marking) | **Seed `mexican_holidays`** table |
| Art. 75 | Holiday work = regular + 2× daily premium | partial (`daily × 3` for full day) | ✅ `holidayPay = days × daily × 2` (the extra premium) | Port Joe's math (cleaner separation) |
| Art. 76 | Vacation entitlement table | ❌ | ❌ | v2 — vacation balance tracker |
| Art. 80 | Prima vacacional ≥ 25% | ❌ no `vacation_pct` | ✅ stored per rule | Add `vacation_premium_pct` to employees, CHECK ≥ 0.25 |
| Art. 87 | Aguinaldo ≥ 15 days by Dec 20 | ❌ | ❌ | **v2 (gap)** |
| Art. 88 | Bi-monthly pay cadence OK | ✅ | ✅ PP1/PP2 | Keep |
| IMSS contributions | Social-security obligations | ❌ | ❌ | Out of scope |
| ISR withholding | Income tax | ❌ | ❌ | Out of scope |

---

## 5. Schema Plan (Phase 1)

### 5.1 `employees` — ALTER (add columns)
Add 5 columns, all nullable initially, backfill, then NOT NULL where appropriate.

```sql
ALTER TABLE employees
  ADD COLUMN weekly_base_salary    numeric(12,2),
  ADD COLUMN daily_salary          numeric(12,2),
  ADD COLUMN overtime_day_pay      numeric(12,2) DEFAULT 0,
  ADD COLUMN sunday_bonus_amount   numeric(12,2) DEFAULT 0,
  ADD COLUMN vacation_premium_pct  numeric(5,4)  DEFAULT 0.25
    CHECK (vacation_premium_pct >= 0.25);   -- LFT Art. 80

-- Backfill weekly from monthly for existing employees
UPDATE employees
  SET weekly_base_salary = monthly_base_salary / 4
  WHERE weekly_base_salary IS NULL AND monthly_base_salary IS NOT NULL;

-- Backfill daily_salary from daily_discount_rate (they coincide on current
-- JOI seed: SLOC Weekday daily = $600 = $3000/5; SLOC Weekend daily = $1000
-- = $3000/3). Conceptually distinct fields though — daily_salary is per-day
-- pay used in partial-week/vacation/holiday calcs; daily_discount_rate is
-- the per-missed-day penalty. Reviewer: confirm before applying.
UPDATE employees
  SET daily_salary = daily_discount_rate
  WHERE daily_salary IS NULL AND daily_discount_rate > 0;
```

### 5.2 `mexican_holidays` (new)
LFT Article 74 seed for 2026 + 2027.

| Column | Type | Notes |
|---|---|---|
| date | date PK | |
| name_es | text | `Año Nuevo` |
| name_en | text | `New Year's Day` |
| type | text CHECK IN (`LFT_OFICIAL`,`EMPRESA`,`OPCIONAL`) | |
| pays_premium | bool | true for `LFT_OFICIAL` — triggers 2× under Art. 75 |

### 5.3 `payroll_periods` — KEEP, light rework
Replace `period_type` with Joe's code format.

```sql
ALTER TABLE payroll_periods
  ADD COLUMN period_code text UNIQUE,        -- 'APRIL26PP1'
  ADD COLUMN year int,
  ADD COLUMN month int CHECK (month BETWEEN 1 AND 12),
  ADD COLUMN half text CHECK (half IN ('PP1','PP2')),
  ADD COLUMN locked_at timestamptz,
  ADD COLUMN locked_by uuid REFERENCES auth.users(id);

-- Migrate existing status enum
-- 'open' -> 'OPEN', 'closed' -> 'LOCKED' (need D's approval to convert)
```

### 5.4 `payroll_weeks` (new)
One row per week-block. Mirrors Joe's "week header row." The bridge between bi-monthly periods and per-week ledger rows.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| period_id | uuid FK payroll_periods | |
| week_number | int CHECK 1–5 | |
| week_start | date | Monday |
| week_end | date | Sunday (drives the PP assignment) |
| status | text CHECK IN (`UNPAID`,`COMPLETE`,`PAID`) | |
| status_changed_at | timestamptz | |
| status_changed_by | uuid FK auth.users | |
| created_at | timestamptz | |
| UNIQUE | (period_id, week_number) | |

### 5.5 `payroll_records` — REWORK (with D's approval)
Existing structure: one row per (employee, period). Joe's model needs per-week granularity AND breakdown columns. Two options to discuss with D:

**Option A:** Drop and recreate (cleaner, but destructive — needs explicit `yes`).
**Option B:** Add columns, rename existing rows to "legacy," start fresh for new periods.

Either way, the final shape:

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| week_id | uuid FK payroll_weeks | (new — replaces period_id linkage) |
| employee_id | uuid FK employees | (existing) |
| campaign_id | uuid FK campaigns | snapshot |
| include_in_payroll | bool DEFAULT true | |
| missed_days | int DEFAULT 0 | auto-derived, overridable |
| overtime_days | int DEFAULT 0 | auto-derived |
| sundays_worked | int DEFAULT 0 | auto-derived |
| vacation_days | int DEFAULT 0 | manual |
| holiday_days | int DEFAULT 0 | auto-derived (time_clock ∩ mexican_holidays) |
| kpi_achieved | bool DEFAULT true | derivable from eod_logs, manual override |
| extra_bonus | numeric(12,2) DEFAULT 0 | manual (spiffs) |
| partial_week_days | int | NULL = full week; int = days worked for mid-week start |
| weekly_base | numeric(12,2) | **calculated** (snapshot at calc time) |
| kpi_bonus | numeric(12,2) | calculated |
| missed_deduction | numeric(12,2) | calculated |
| overtime_pay | numeric(12,2) | calculated |
| sunday_pay | numeric(12,2) | calculated |
| vacation_pay | numeric(12,2) | calculated |
| holiday_pay | numeric(12,2) | calculated |
| total_pay | numeric(12,2) | calculated |
| status | text CHECK IN (`UNPAID`,`COMPLETE`,`PAID`) | mirrors week status |
| memo | text | |
| auto_derived | jsonb | snapshot of time_clock-derived values for audit |
| created_at / updated_at | timestamptz | |
| UNIQUE | (week_id, employee_id) | one line per agent per week |

**RLS:**
- Owner: full.
- Manager: SELECT/UPDATE where employee's `campaign_id` is one they manage (via existing `team_lead_campaigns` pattern — actually for managers we need a `manager_campaigns` map; check what exists).
- Employee: SELECT own only (future, v2 paystub view).
- Trigger: blocks UPDATE if `status = PAID`. Only owner can unlock via dedicated function.

### 5.6 `payroll_archive` (new, read-only after import)
Joe's March + April 2026 ledger preserved for YTD + paystub history.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| source | text | `JOE_SHEETS_2026_05_19` |
| period_code | text | `MARCH26PP1` |
| week_start / week_end | date | |
| legacy_agent_id | int | Joe's numeric ID (Javier = 1) |
| employee_id | uuid FK employees (nullable) | resolved by name match; null if alumni-only |
| rule_key | text | Joe's rule_key for traceability |
| all input + calc cols | numeric/int/bool | exactly as Joe stored |
| total_pay | numeric(12,2) | |
| paid_at | date | |

INSERT once via migration, then REVOKE INSERT/UPDATE/DELETE on all roles except service.

### 5.7 `payroll_audit_log` (new)
Append-only.

| Column | Type |
|---|---|
| id | uuid PK |
| record_id | uuid (nullable — also captures week/period actions) |
| action | text (`CREATE`,`EDIT_INPUT`,`RECALC`,`STATUS_CHANGE`,`OVERRIDE`,`UNLOCK_PAID`) |
| before | jsonb |
| after | jsonb |
| actor | uuid FK auth.users |
| at | timestamptz |

Trigger blocks UPDATE/DELETE.

---

## 6. Calc Engine (Phase 2) — Port of Joe's `calcAgentPay_`

Postgres function `pay_calc_record(record_id uuid)`. Pseudo-code (1:1 with Joe's CLEAN line 885):

```
function pay_calc_record(record_id):
  r = SELECT * FROM payroll_records WHERE id = record_id
  e = SELECT * FROM employees WHERE id = r.employee_id

  IF r.status = 'PAID':
    RAISE EXCEPTION 'PAID row, recalc refused'

  IF r.include_in_payroll = false:
    UPDATE r SET weekly_base=0, kpi_bonus=0, missed_deduction=0,
                 overtime_pay=0, sunday_pay=0, vacation_pay=0,
                 holiday_pay=0, total_pay=0
    RETURN

  -- daily_salary is STORED on employees (not derived) so weekend shifts
  -- (V-D = 3 scheduled days, daily = weekly/3) and weekday shifts (L-V = 5,
  -- daily = weekly/5) both work without branching on shift_type here.

  IF r.partial_week_days IS NOT NULL:
    base = round(e.daily_salary * r.partial_week_days, 2)
    missed_ded = 0
    vacation_pay = 0
  ELSE:
    base = e.weekly_base_salary
    missed_ded = round(r.missed_days * e.daily_discount_rate, 2)
    vacation_pay = round(r.vacation_days * e.daily_salary
                         * (1 + e.vacation_premium_pct), 2)

  kpi_bonus    = CASE WHEN r.kpi_achieved THEN e.kpi_bonus_amount ELSE 0 END
  overtime_pay = round(r.overtime_days * e.overtime_day_pay, 2)
  sunday_pay   = round(r.sundays_worked * e.sunday_bonus_amount, 2)
  holiday_pay  = round(r.holiday_days * e.daily_salary * 2, 2)   -- LFT Art. 75 extra

  total = round(base - missed_ded + kpi_bonus + overtime_pay
                + sunday_pay + vacation_pay + holiday_pay + r.extra_bonus, 2)

  UPDATE r SET ...
  INSERT INTO payroll_audit_log (action='RECALC', before, after, actor=auth.uid())
```

Trigger fires on INSERT/UPDATE of inputs, **unless `status = PAID`** (then refuses silently in trigger, errors in RPC).

Rounding: 2 decimals per component, 2 decimals on total.

**Replace `src/types/payroll.ts:calcularNomina`** with a TypeScript port that calls the Postgres function via RPC (or recomputes client-side for preview before save — but server-side is canonical).

---

## 7. Auto-Derivation (Phase 3) — The killer feature

Function `pay_derive_week(week_id uuid)` populates inputs from app data.

For each active employee on the week:
1. **Scheduled days** = derived from `shift_type`:
   - `L-V` → Mon, Tue, Wed, Thu, Fri
   - `L-J` → Mon, Tue, Wed, Thu
   - `V-D` → Fri, Sat, Sun
   - `V-L` → Fri, Sat, Sun, Mon
2. **Missed days** = scheduled days − (distinct dates with `time_clock` clock_in)
3. **Overtime days** = count of `time_clock` rows where (clock_out − clock_in − lunch − breaks) > 9 hours
4. **Sundays worked** = count of `time_clock` rows where day-of-week = Sunday
5. **Holiday days** = count of `time_clock` rows where date ∈ `mexican_holidays` WHERE `pays_premium = true`
6. **KPI achieved** = pre-filled from `eod_logs` campaign KPI rules (existing memory `project_campaign_kpis`), manual override

Auto-derive runs once when the week is created. Re-derive is a deliberate button (with diff + confirmation). Owner/manager edits override.

---

## 8. UI (Phase 4) — Owner + Manager only

Routes, all `RequireRole(['owner','admin','manager'])`:

| Route | Purpose |
|---|---|
| `/admin/payroll` | Landing: current pay period summary + week list + "Add Next Week" |
| `/admin/payroll/periods` | Pay period management; owner-only lock |
| `/admin/payroll/week/[id]` | Per-week table of agents with auto-derived + override inputs, status badges, "Mark Week Complete" + "Mark Period Paid" buttons |
| `/admin/payroll/agent/[id]` | Per-agent YTD breakdown by PP (Joe's `agentPayrollBreakdown` PDF equivalent) |
| `/admin/payroll/holidays` | LFT Article 74 list (read-only seeded; admin marks optional company holidays) |
| `/admin/payroll/rates` | Bulk rate editor — filter by campaign + department + shift, edit weekly_base for all matching employees at once (the closest equivalent to Joe's pay rules without the complexity) |

Status colors match Joe's: 🟡 UNPAID / 🔵 COMPLETE / ✅ PAID. PAID rows visually frozen.

---

## 9. Migration (Phase 5)

1. **Backup** Joe makes a copy of the Sheet.
2. **Schema** Phase 1 migrations apply.
3. **Seed `mexican_holidays`** for 2026 + 2027.
4. **Backfill `weekly_base_salary`** from `monthly_base_salary / 4`.
5. **Backfill `overtime_day_pay`, `sunday_bonus_amount`** from Joe's Pay Rules tab — match by employee's `(campaign, department, shift)` to Joe's rule key.
6. **Import `payroll_archive`** from Joe's Payroll Run for March + April 2026. Resolve agents by name. Joe sanity-checks the import.
7. **Acceptance tests** (Section 10). All pass before cutover.
8. **Parallel run** for 1–2 pay periods (Joe enters in Sheet, app auto-derives + Joe confirms; compare totals).
9. **Cutover** rename Sheet to `JOI PayRoll APP (archive)`, app becomes canonical.

---

## 10. Acceptance Tests (from Joe's spec)

| # | Test | Expected |
|---|---|---|
| T1 | `SELECT SUM(total_pay) FROM payroll_archive WHERE legacy_agent_id = 1` | $73,987.50 MXN |
| T2 | YTD on `/admin/payroll/agent/<Javier UUID>` | matches T1 |
| T3 | Sum of `payroll_archive.total_pay` Mar + Apr 2026 = Joe's grand totals | matches |
| T4 | Add new employee with weekly_base 3000 → create next week | line appears, auto-derive works |
| T5 | Edit an UNPAID week's missed_days | total_pay recalculates immediately via trigger |
| T6 | UPDATE a payroll_records row where status = PAID | DB rejects |
| T7 | Manager A edits a line for an employee on Campaign B | RLS rejects |
| T8 | Agent clocked in Sept 16 2026 | holiday_days auto-derives = 1, holiday_pay = daily × 2 |
| T9 | Insert employee with vacation_premium_pct = 0.10 | CHECK rejects (LFT Art. 80) |
| T10 | 5-week month | week appears, per-agent breakdown handles it |

---

## 11. Out of Scope for v1

- Aguinaldo (LFT Art. 87) — December 2026; build in Q4 2026
- IMSS contributions + filings
- ISR withholding
- Per-employee schedule (v1 uses `shift_type` only)
- PDF paystubs + email (Joe's `generateAllPaystubs`) — v2 once math matches the Sheet 2x
- Employee self-service paystub view — v3
- CFDI invoice integration

---

## 12. Phased Build (Sonnet Prompts)

Five prompts, each one a finishable chunk:

1. **Phase 1** (foundation): ALTER employees + new tables + RLS + seed holidays. **Prompt file: `PAYROLL_PHASE1_PROMPT.md`** (next door).
2. **Phase 2** (calc engine): `pay_calc_record` Postgres function + triggers + the TypeScript port of `calcAgentPay_`.
3. **Phase 3** (auto-derive): `pay_derive_week` reading time_clock + eod_logs.
4. **Phase 4** (UI): React routes + components, owner/manager guards.
5. **Phase 5** (migration): import Joe's archive + acceptance tests + parallel-run instructions.

Each prompt ends with a code-review pass (per JOI project standard) and a self-test.

---

## 13. Sign-Off Checklist

Before Phase 1 lands:

- [ ] D approves the ALTER on `employees` (4 new columns).
- [ ] D approves the rework of `payroll_periods` + `payroll_records` (show SQL, wait for `yes`).
- [ ] Joe confirms the calc-engine pseudo-code matches `calcAgentPay_` byte-for-byte.
- [ ] Joe confirms no agent currently has a non-standard schedule that breaks the `shift_type`-based scheduled-day mapping.
- [ ] D + Joe agree Aguinaldo + paystub PDFs are v2.
