# Sonnet Prompt — JOI Payroll Phase 5 (Engine Validation via Joe's Payroll Run Archive)

> **How D uses this:** Open a fresh Cowork session. Paste this entire file as the first message.

---

You are running Phase 5 of the JOI payroll port. **Phase 5 has two missions:**

1. Import Joe's Jan + March + April + May 2026 Payroll Run history into `payroll_archive` as read-only data.
2. Replay every row through `pay_calc_record` and prove the new engine produces Joe's exact totals to the cent.

This is the engine-validation gate. If any agent's replay diverges by more than $0.01, the calc engine has a bug and Phase 3/4 should not proceed until it's fixed.

## CSV Data Files (already in the project)

`docs/payroll-reference/joe-payroll-run-2026-05-19.csv` — **the canonical ledger.** 489 lines, 11 week blocks. This is the file you import + replay against. Every input + output column populated by Joe.

`docs/payroll-reference/joe-april-monthly-2026.csv` and `docs/payroll-reference/joe-may-monthly-2026.csv` — Joe's monthly summary tabs. **These are NOT the source of truth for replay.** Only use them as a sanity check that imported per-week totals roll up to Joe's monthly totals.

## Joe's CSV Format (Payroll Run — actual structure)

The file is NOT flat. Week-header rows are interspersed with agent rows.

**Week-header rows** (one before each week's agent block) — col A starts with literal `WEEK`:

```
WEEK 2,March 2026,03/02/26 - 03/08/26,,,,,,,,,,,,,,,,,,,,✅ PAID
```

Cols: A=`WEEK N`, B=`Month Year`, C=`MM/DD/YY - MM/DD/YY` (date range) or blank, then mostly empty, then trailing emoji-status cells.

**Special case: Week 1 January 2026** — col C is blank (Joe's documented BUG-09 — block 1 has no date range). For that week, infer dates as the week ending in late Jan 2026 OR mark the week as "UNDATED" in the archive. Flag in the import report.

**Special case: May Week 2** — header row has `$0.00` bleed into calc columns (Joe's BUG-13). Skip those numeric cells when parsing the header.

**Agent rows** (one per agent per week, immediately under the week header) — col A is a numeric ID:

| Col | Field | Notes |
|---|---|---|
| 1 (A) | Agent ID | Joe's numeric ID (Javier = 1) |
| 2 (B) | Agent Name | may be blank → "ghost row" (BUG-09 follow-on), SKIP |
| 3 (C) | Rule Key | e.g. `TORRO\|SLOC\|WEEKDAY` |
| 4 (D) | Include | `YES`/`NO`/blank |
| 5 (E) | Missed Days | int or blank (= 0) |
| 6 (F) | OT Days | int or blank |
| 7 (G) | Sundays | int or blank |
| 8 (H) | Vacation Days | int or blank |
| 9 (I) | Holiday Days | int or blank |
| 10 (J) | KPI | `YES`/`NO`/blank (blank = NO) |
| 11 (K) | Weekly Base Pay | money — Joe's COMPUTED output |
| 12 (L) | KPI Bonus | Joe's output |
| 13 (M) | Missed Deduction | Joe's output |
| 14 (N) | Overtime Pay | Joe's output |
| 15 (O) | Sunday Pay | Joe's output |
| 16 (P) | Vacation Pay | Joe's output |
| 17 (Q) | Holiday Pay | Joe's output |
| 18 (R) | Extra Bonus | INPUT, manual (spiffs) |
| 19 (S) | Total Pay | Joe's output sum |
| 20 (T) | Partial Week | int or blank — INPUT |
| 21 (U) | Status | text status |
| 22 (V) | Pay Period | e.g. `MARCH26PP1` or blank |
| 23 (W) | Memo | text |

**Inputs your replay uses:** cols 4 (D), 5–10 (E–J), 18 (R), 20 (T).
**Outputs you compare against Joe's:** cols 11–17 (K–Q), 19 (S).

**Money cells** are formatted as `"$5,750.00"` or `"$0.00"` (note quoting and commas). Parser must strip `$`, commas, quotes, and handle blank as 0.

## Known Data Quirks (Joe's documented bugs — handle gracefully)

| Quirk | What to do |
|---|---|
| Ghost rows: Agent ID present, Agent Name blank | SKIP during import. Log count. |
| Week 1 January 2026 missing date range | Mark week as `UNDATED` in archive, log warning |
| May Week 2 header row has `$0.00` bleed | Skip header-row numeric cells; only data rows are parsed |
| Rule key `ADMIN\|RECUIRTMENT \|WEEKDAY` (typo + trailing space) | Preserve in archive as-is for fidelity; do NOT normalize during import — that loses the historical record |
| Named-individual rules: `TORRO\|SLOC CARLOS\|WEEKEND`, `TORRO\|MCA IBANEZ\|WEEKDAY`, `HFB\|DESIGNER FRANCISCO\|WEEKDAY` | Treat as normal rule keys. These are Joe's hack for per-employee custom rates. They'll resolve to specific employees via name match. |
| Some rule keys reference campaigns not yet in our `campaigns` table (e.g., `BIG THINK CAPITAL`, `SCOOP`, `HFB`) | Import the rule_key as text; do NOT FK to campaigns. Phase 6 cleanup if needed. |

## Read These First

1. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/PAYROLL_PLAN.md` — Sections 4, 9, 10.
2. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/CLAUDE.md` — destructive-ops rule, no git push.
3. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/HANDOFF.md` — Phase 1 + 2 done state.
4. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/JOE_PAYROLL_HANDOFF.md` — §3.4 column maps, §4 formulas.
5. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/docs/payroll-reference/joe-payroll-run-2026-05-19.csv` — the data.
6. `/Users/admin/Desktop/JOI/JOI Payroll and HR app/docs/payroll-reference/JOI_PAYROLL_ANALYSIS_REPORT.md` — bug catalog Joe documented.
7. Phase 1 + 2 migration files.

## Hard Rules

1. **`payroll_archive` is INSERT-once, then read-only.** After import, REVOKE INSERT/UPDATE/DELETE on `authenticated`, `anon`, `service_role` (except the migration's own role).
2. **Replay does NOT write to `payroll_records`.** Use `payroll_validation_runs`. Polluting the live ledger with validation rows is forbidden.
3. **No `payroll_audit_log` entries from replay.** Call `_calc_pay_components(employee_row, synthetic_record)` directly — bypass the trigger which writes audit rows.
4. **Destructive-ops rule.** Any DROP/DELETE/TRUNCATE needs explicit yes.
5. **MXN throughout.** Never assume USD.
6. **Acceptance gates that block Phase 3:** All current-employee replay totals must match Joe's totals within $0.01 per row. Alumni rows are skipped (status SKIPPED_ALUMNI). Any `DIVERGE_DOLLAR` (> $0.01) row FAILS Phase 5.

## Decisions Already Made

- Per-employee rates. Replay uses current `employees` rates.
- Replay uses `_calc_pay_components` helper directly (no trigger, no audit log).
- Alumni-only agents → status `SKIPPED_ALUMNI` (employee_id NULL in archive).
- Joe's `status` in CSV is mostly `UNPAID` or `🟡 UNPAID` (status column is messy) — but all weeks have `✅ PAID` in the WEEK header row. Treat ALL imported rows as `status = 'PAID'` in `payroll_archive` since the source is historical paid work.
- Preserve Joe's rule_key typos verbatim in archive (no normalization during import). Joe will clean them up in his own Sheets separately.
- Use the row's `weekly_base_pay` from Joe's column 11 as the source-of-truth rate snapshot for that agent-week. If it diverges from `employees.weekly_base_salary` by more than $0.01, log as `RATE_DRIFT` and skip the replay for that row (don't blame the engine for a rate change since March).

## Decisions Pending — Ask D in a Single Batch

1. **Pay period codes for Jan + early March** — Joe's CSV has `MARCH26PP1` for week 2 onwards. Week 1 January 2026 has blank period_code in the data rows. Recommend: derive as `JAN26PP1` from the inferred week_end date. Confirm.
2. **"Big Think Capital" + "Scoop" + "HFB" campaign mapping** — these rule_keys reference campaigns that may not be in your current `campaigns` table. Recommend: import rule_key as plain text without FK; we'll reconcile in a separate task if needed. Confirm.
3. **`payroll_validation_runs` lifecycle** — keep as audit artifact, or DROP after sign-off? Recommend keep (useful for regression).
4. **Match threshold** — strict $0.01 penny-perfect, or some tolerance? Recommend strict $0.01.

## Deliverables (in order)

### 1. Pre-flight checks (Supabase MCP)
- `SELECT count(*) FROM payroll_archive` → expect 0
- `SELECT count(*) FROM employees WHERE is_active = true AND is_system_user = false` → note count
- `SELECT pg_get_functiondef('public._calc_pay_components'::regproc)` → confirm Phase 2 helper exists
- Report to D.

### 2. Parser + import migration `<ts>_payroll_phase5_import_archive.sql`

Read the CSV. The parser must handle:
- Skip blank rows and rows where col A is blank
- Detect `WEEK N` header rows → capture month, year, date range
- For data rows: parse all 23 columns
- Strip `$`, `,`, and quotes from money cells
- Treat blank int cells as 0
- SKIP rows where `Agent Name` is blank (ghost rows) — log count
- Carry forward the current week_header context to each agent row beneath it

Resolution rules:
- `legacy_agent_id` → `employee_id`: match by `employees.full_name ILIKE archive.agent_name`. Trim whitespace, lower-case both sides. Handle Joe's name aliases (e.g., `Santiago Valenzuela (Jacob Miller)` → match either name).
- Unmatched → `employee_id = NULL`, source = `'JOE_SHEETS_2026_05_19_ALUMNI'`
- Matched → source = `'JOE_SHEETS_2026_05_19'`

After import, REVOKE INSERT/UPDATE/DELETE on `payroll_archive` from `authenticated`, `anon`, `service_role` (except your migration role). Add table comment.

**Validation queries the migration RAISE NOTICEs:**
```sql
-- Row counts by source
SELECT source, count(*) FROM payroll_archive GROUP BY source;

-- Per-week counts (should be ~45 agent rows per week)
SELECT week_start, week_end, count(*), SUM(total_pay)
FROM payroll_archive
GROUP BY week_start, week_end
ORDER BY week_start;

-- Javier's grand total (acceptance smoke test)
SELECT SUM(total_pay) FROM payroll_archive WHERE legacy_agent_id = 1;
-- Joe's HANDOFF says $73,987.50 across Mar+Apr — but this CSV also has Jan + May,
-- so the total here will be higher. Log it; cross-check Mar+Apr only against $73,987.50
SELECT SUM(total_pay) FROM payroll_archive
WHERE legacy_agent_id = 1
  AND week_start >= '2026-03-01' AND week_end <= '2026-04-30';
-- This subset should equal $73,987.50

-- Ghost row count (informational)
-- Already logged during parse
```

If the Mar+Apr Javier total is NOT $73,987.50, the CSV parsing is wrong. STOP and tell D.

### 3. Validation table migration `<ts+1>_payroll_phase5_validation_table.sql`

Create `payroll_validation_runs` per PAYROLL_PHASE5_PROMPT.md original spec, plus one extra column:

| Column | Type | Notes |
|---|---|---|
| ...existing... | | |
| rate_drift_amount | numeric(12,2) | NULL if no drift; else `employees.weekly_base_salary - archive.weekly_base` |

Statuses (CHECK):
- `MATCH` — all 8 components ≤ $0.01 diff
- `DIVERGE_PENNY` — total within $0.01 but ≥ 1 component diverged
- `DIVERGE_DOLLAR` — total > $0.01 off (FAIL Phase 5)
- `SKIPPED_ALUMNI` — employee_id NULL
- `SKIPPED_MISSING_RATE` — employee.weekly_base_salary NULL
- `SKIPPED_RATE_DRIFT` — employee rate has changed since archive
- `SKIPPED_GHOST` — should never happen (filtered in import) but defensive
- `SKIPPED_NO_BASE` — Joe's row has weekly_base = 0 (some ghost rows still snuck through, or genuinely $0 weeks like Paty Rodriguez Jan-Apr)

### 4. Validation runner: `pay_validate_archive_row(p_archive_id uuid)`

For each row:
1. Load archive row + resolved employee.
2. If `employee_id IS NULL` → SKIPPED_ALUMNI.
3. If `employee.weekly_base_salary IS NULL` → SKIPPED_MISSING_RATE.
4. If `abs(employee.weekly_base_salary - archive.weekly_base) > 0.01` AND `archive.weekly_base > 0` → SKIPPED_RATE_DRIFT (with `rate_drift_amount` populated).
5. If `archive.weekly_base = 0` AND no other inputs populated → SKIPPED_NO_BASE.
6. Build synthetic `payroll_records` row in memory from archive inputs (cols D, E-J, R, T).
7. Call `_calc_pay_components(employee_row, synthetic_record)` — returns `pay_components` composite.
8. Compare every component output to archive output. Categorize MATCH / DIVERGE_PENNY / DIVERGE_DOLLAR.
9. INSERT into `payroll_validation_runs`.

Driver: `pay_validate_archive_all()` loops.

### 5. Run the validation

```sql
SELECT pay_validate_archive_all();
```

### 6. Diagnostic + report

Generate `docs/payroll-reference/PHASE5_VALIDATION_REPORT.md`:

- Total archive rows imported, split by source
- Per-week roll-up
- Status counts (MATCH / DIVERGE_PENNY / DIVERGE_DOLLAR / SKIPPED_*)
- Match rate as % of replay-eligible rows (MATCH + DIVERGE_PENNY) / (replay-eligible total)
- Javier Mar+Apr engine-replay total — must show "$73,987.50 ✓" or FAIL
- Per-agent breakdown of any DIVERGE_PENNY or DIVERGE_DOLLAR rows with hypothesized cause
- Rate-drift report: list of employees whose `weekly_base_salary` has changed since the archived weeks (informational, not a failure)
- Top of report: PASS / FAIL banner

PASS criteria:
- 0 DIVERGE_DOLLAR rows
- DIVERGE_PENNY ≤ 5% of replay-eligible rows
- Javier Mar+Apr = $73,987.50 ✓

### 7. Code-review pass

Sub-agent reviews import + validation runner. Specifically check:
- Money parsing handles all formats (`$5,750.00`, `"$5,750.00"`, `$0.00`, blank, `5750`)
- Week-header row context carries forward correctly to agent rows underneath
- Ghost row skipping doesn't drop legitimate rows
- The replay uses archive INPUTS, NEVER archive outputs, to build the synthetic record
- `SECURITY DEFINER` is appropriate where used (archive table writes during import)

### 8. Update `HANDOFF.md` + `PAYROLL_DECISIONS.md`

### 9. Deploy commands for D

## Acceptance Checks (Phase 5)

| # | Check | How |
|---|---|---|
| P5.1 | All CSV rows imported (minus ghosts) | `payroll_archive` count = expected ~450 - ghost_count |
| P5.2 | Javier Mar+Apr archive sum = $73,987.50 | Q above |
| P5.3 | Javier Mar+Apr engine replay sum = $73,987.50 | from validation runs |
| P5.4 | MATCH + DIVERGE_PENNY ≥ 95% of replay-eligible | from summary |
| P5.5 | Zero DIVERGE_DOLLAR | FAIL the phase if any |
| P5.6 | `payroll_archive` REVOKEd from `authenticated` | INSERT test as authenticated → fails |
| P5.7 | Live `payroll_records` row count unchanged | no pollution |

## What This Phase Does NOT Do

- ❌ No auto-derive from time_clock. Phase 3.
- ❌ No React UI. Phase 4.
- ❌ No edits to live `payroll_records`.
- ❌ No edits to Joe's Sheets.

## Done Looks Like

D pastes deploy. Import lands ~450 rows. Validation runs. **Javier Mar+Apr engine-replayed sum = $73,987.50 MXN to the cent.** Match rate ≥ 95%. Zero DIVERGE_DOLLAR. Report committed. HANDOFF says `Payroll Phase 5 — DONE — engine validated against Joe's Jan–May 2026 ledger`.

If FAIL: do NOT mark done. Hand D the divergence report; he pings Joe.

## If Stuck on the Parser

The CSV has 489 lines. Show D 5-10 sample parsed rows in chat before writing the full import. If parsing looks wrong, fix before applying. Don't ship a parser that silently drops rows or mis-attributes weeks.
