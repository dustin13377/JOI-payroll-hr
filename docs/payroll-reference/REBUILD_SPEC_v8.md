# JOI Payroll v8.0 — Rebuild Specification

**Status:** Locked spec. Code is built against this contract. Any deviation is a defect.
**Author:** Claude (audit-driven)
**Date:** 2026-05-03

---

## 0. Findings That Drive the Rebuild

The current system has three independent representations of payroll, and they disagree:

| Layer | Javier (ID 1) total earned | Verdict |
|---|---|---|
| Payroll Run (raw weekly entries) | **$73,987.50** | Source of truth |
| Monthly sheets (March + April combined) | $67,237.50 | Snapshot drift |
| Dashboard rankings | $65,937.50 | Different snapshot drift |
| Dashboard period-detail block | Shows base pay only (OT/KPI/Sun/Spiff = '—') | Columns never populated |

Concrete defects observed:

1. **Payroll Run header corruption** — only one column carries the week label (`A='WEEK 2'`), the date in column B is a single point-in-time (`2026-03-01 00:00:00`) not a range, March WEEK 1 has no header row at all, and WEEK 3/4 of April have JS Date timestamps with HH:MM:SS embedded.
2. **32 ghost rows in Payroll Run** — numeric agent ID present, agent name blank. Some carry phantom money (`$4,500`, `$5,700`, `$1,450`).
3. **March monthly sheet** is structurally different from April monthly sheet:
   - March: PP1 only (Week 1 + Week 2 side-by-side). PP2 region exists as headers but the data was never written. Summary `VLOOKUP(... L5:O49 ...)` looks up an empty range, so PP2 totals = 0. After the GRAND TOTAL row, zombie rows (R112–R136) reference `Payroll Run!O…` (column O is *Vacation Pay*, not Total Pay).
   - April: All 4 weeks side-by-side with mismatched row positions (Week 2 row 6 = ID 6, but Week 3 row 6 = ID 2, etc.). VLOOKUPs save it because they search by ID; the row-position bi-weekly sums are arithmetic noise.
4. **Pay Rules** has a string typo: `BLB|DOC COLLECTOR|WEEKDAY` Weekly Base Pay = `'$3,00.00'` (text, not a number).
5. **Department names with trailing spaces**: `'Training '`, `'Recuirtment '`, `'Designer '` — every JOIN / lookup must match the trailing space exactly. Brittle.
6. **`Recuirtment`** is a misspelling (Recruitment).
7. **Agents tab** has the `CAMPAIGN SUMMARY` block duplicated 5× (rows 51–98) with stale totals from prior runs.
8. **Two agents (R20 Ibanez, R48 Araujo)** have hardcoded Rule Keys instead of `=UPPER(C&"|"&D&"|"&E)`.
9. **Phantom agent in April monthly**: ID 51 "Santiago Lopez" appears in Week 2 but is not in the Agents tab (he is in Alumni; should not be live).
10. **Pay Period Group inconsistency** — March WEEK 2 is tagged `MARCHPP1`, but WEEK 3/4/5 are `MARCHPP2`. April uses W1/W2 → `APRILPP1`, W3/W4 → `APRILPP2`. Combined with the user's choice of "PP1 = first half, PP2 = second half," the PP grouping must be derived deterministically from the week-end date, not stored manually.

---

## 1. Architectural Principles (non-negotiable)

1. **Single source of truth.** Weekly Earnings flow into Payroll Run rows. Every other tab is a *view* (formulas + queries) that derives from Payroll Run + Agents + Pay Rules. No duplicate state, no snapshots written by the script.
2. **ID-driven, not row-driven.** No formula may depend on "the agent on row N is the same agent as row N in another sheet." Every cross-sheet reference matches by Agent ID, Rule Key, or Pay-Period composite key.
3. **Composite keys are explicit.** A payroll line is keyed by `(Agent ID, Pay Period Code, Week Number)`. The composite is a derived column the script writes; downstream formulas use it directly.
4. **Validation is fail-loud.** A dedicated `Validation` tab runs every time the menu is invoked; if any check fails, the menu refuses to publish a Dashboard refresh and links to the row that broke.
5. **No row-position dependency.** Inserting a row, deleting an agent, or re-sorting must never change a payroll number.
6. **Header rows are data, not formatting.** Each week-block header in Payroll Run carries 5 fields: `WEEK_NUMBER`, `MONTH_LABEL`, `START_DATE`, `END_DATE`, `PAY_PERIOD_CODE`, `STATUS`.
7. **One unified monthly template.** March and April render from the same template; the only difference is the four week-ranges they pull.

---

## 2. Schema — Tab by Tab

### 2.1 `Config` (NEW — single sheet, hidden by default)

| Cell | Key | Value |
|---|---|---|
| B2 | `VERSION` | `8.0.0` |
| B3 | `PAY_PERIOD_RULE` | `FIRST_HALF_SECOND_HALF` |
| B4 | `PAY_PERIOD_CUTOFF_DAY` | `15` |
| B5 | `WEEK_START_DAY` | `MON` (Mon→Sun week ends) |
| B6 | `MONTHLY_SHEET_PREFIX` | ` 26 PayRoll` |
| B7 | `CURRENT_PERIOD_TAG` | `APRILPP2` (auto-set by `setCurrentPeriod`) |
| B8 | `BRAND_GOLD` | `#F5A623` |
| B9 | `BRAND_GOLD_DARK` | `#C47D00` |
| B10 | `BRAND_GOLD_SUBTLE` | `#FEF3DC` |
| B11 | `BRAND_LIGHT` | `#F7F7FA` |

### 2.2 `Pay Rules` (CLEANED)

Headers (row 3): `Rule Key | Campaign | Department | Shift | Full Attendance | Weekly Base Pay | Daily Salary | KPI Bonus | Missed Day Deduction | Overtime Day Pay | Sunday Bonus | Vacation Premium %`.

Rules:
- Column A: `=UPPER(TRIM(B&"|"&C&"|"&D))` for *every* row, no exceptions.
- Department names are trimmed: `Training`, `Recruitment`, `Designer` (no trailing spaces; `Recuirtment` corrected).
- All numeric cells must be `Number`, never text. The `BLB|Doc Collector` rule's `Weekly Base Pay` is corrected from `'$3,00.00'` to `3000`.
- A `Rule Status` column is added: `=IF(F<=0,"INVALID","OK")`.

### 2.3 `Agents` (CLEANED, no duplicate summaries)

Headers (row 3): `Agent ID | Agent Name | Campaign | Department | Shift | Rule Key | Active | Email | Start Date | Notes | Validation`.

Rules:
- A unique-id check on the `Agent ID` column (Data Validation rule).
- `Rule Key` column is **always** `=UPPER(TRIM(C&"|"&D&"|"&E))` — every row, formulas only.
- `Validation` column flags missing name (`MISSING_NAME`), missing rule key match (`UNKNOWN_RULE`), or duplicate ID (`DUPE_ID`).
- All trailing campaign-summary blocks are deleted. Campaign roll-up lives on the `Dashboard` tab only.

### 2.4 `Alumni` (KEPT, normalized)

Same header convention as `Agents`. Used by validation: an agent ID may appear in `Agents` *or* `Alumni`, never both.

### 2.5 `Payroll Run` (RESTRUCTURED — the source of truth)

Two regions.

**Region A — Week-Header rows.** When the script writes a new week, it writes a *single* full header row above that week's agent rows:

| Col | Field | Example |
|---|---|---|
| A | `WEEK_LABEL` | `WEEK 1` |
| B | `START_DATE` | `2026-02-23` (date only, no time) |
| C | `END_DATE` | `2026-03-01` |
| D | `MONTH_LABEL` | `February 2026` |
| E | `STATUS` | `PAID` or `UNPAID` |
| F | `PAY_PERIOD_CODE` | `MARCHPP1` (derived from END_DATE) |
| G | `RANGE_LABEL` | `WEEK 1 02/23/26 – 03/01/26` (concat for human display) |

Header rows are styled (gold band) and have data validation that forbids editing of A/B/C/D/F/G — these are computed by the script.

**Region B — Per-agent payroll rows** (immediately under each header):

| Col | Field | Notes |
|---|---|---|
| A | `Agent ID` | Number, lookup against Agents/Alumni |
| B | `Agent Name` | `=IFERROR(VLOOKUP(A,Agents!A:B,2,0), VLOOKUP(A,Alumni!A:B,2,0))` — formula, not snapshot |
| C | `Rule Key` | `=IFERROR(VLOOKUP(A,Agents!A:F,6,0), VLOOKUP(A,Alumni!A:E,5,0))` |
| D | `Include In Payroll` | `YES` / `NO` |
| E | `Missed Days` | Number ≥ 0 |
| F | `Overtime Days` | Number ≥ 0 |
| G | `Sundays Worked` | Number ≥ 0 |
| H | `Vacation Days` | Number ≥ 0 |
| I | `KPI Achieved` | `YES` / `NO` |
| J | `Weekly Base Pay` | `=IFERROR(VLOOKUP(C,'Pay Rules'!A:F,6,0),0)` |
| K | `KPI Bonus` | `=IF(I="YES",IFERROR(VLOOKUP(C,'Pay Rules'!A:H,8,0),0),0)` |
| L | `Missed Deduction` | `=E*IFERROR(VLOOKUP(C,'Pay Rules'!A:I,9,0),0)` |
| M | `Overtime Pay` | `=F*IFERROR(VLOOKUP(C,'Pay Rules'!A:J,10,0),0)` |
| N | `Sunday Pay` | `=G*IFERROR(VLOOKUP(C,'Pay Rules'!A:K,11,0),0)` |
| O | `Vacation Pay` | `=H*IFERROR(VLOOKUP(C,'Pay Rules'!A:L,12,0),0)*IFERROR(VLOOKUP(C,'Pay Rules'!A:G,7,0),0)` |
| P | `Extra Bonus` | Manual entry (spiffs) |
| Q | `Total Pay` | `=IF(D="YES",J+K-L+M+N+O+P,0)` |
| R | `Partial Week` | `YES`/blank (pro-rated payouts) |
| S | `Composite Key` | `=A&"|"&$F$<header_row>` — used by monthly sheets |

Critical rule: **B, C, J, K, L, M, N, O, Q are all formulas.** The script never writes hardcoded numbers into them. Only D, E, F, G, H, I, P, R are user input.

This single change kills snapshot drift forever — when an agent's Pay Rule changes, every historical week recalculates. (If you want frozen history per week, we mark a paid week as immutable by replacing the formulas with values *at the moment of locking*; locking is a deliberate menu action.)

### 2.6 `MonthlyTemplate` (NEW — hidden master)

A literal template tab the script clones to produce `March 26 PayRoll`, `April 26 PayRoll`, etc. Layout (45 active agents, but the formulas use the live agent list — adding agents auto-extends):

```
R2:  [MONTH] 2026 — MONTHLY PAY SHEET
R3:  WEEK 1 [range]   |   WEEK 2 [range]   |   WEEK 3 [range]   |   WEEK 4 [range]   |   (WEEK 5 if it exists)
R4:  ID | Name | Pay | Notes  ||  ID | Name | Pay | Notes | Bi-Wk Total  ||  ID | Name | Pay | Notes  ||  ID | Name | Pay | Notes | Bi-Wk Total
R5+: one row per active agent, sorted by Agent ID
```

Every cell is a formula:

- `Agent ID` for row r: `=Agents!A(4+r-5)` (or via a `FILTER(Agents!A:A, Agents!G:G="Yes")` if available; in standard xlsx we use `INDEX` + a sorted helper).
- `Agent Name` for week column: `=IFERROR(VLOOKUP(<id>, Agents!A:B, 2, 0), VLOOKUP(<id>, Alumni!A:B, 2, 0))`.
- `Pay` for week column: `=SUMIFS('Payroll Run'!Q:Q, 'Payroll Run'!A:A, <id>, 'Payroll Run'!$<weekHeaderRef>, "1")`. The week is identified by the **week-header date**, not by row-position.

Concretely, the formula uses a helper hidden block on the monthly sheet that lists week start/end dates per column and uses `SUMIFS` over the Composite Key column S of Payroll Run:

```
Pay (W1, agent 1) = SUMIFS('Payroll Run'!Q:Q,
                           'Payroll Run'!A:A, <id>,
                           'Payroll Run'!T:T, "MARCHPP1",
                           'Payroll Run'!<week-header marker col>, "WEEK 1")
```

(Implemented via the script writing helper marker columns so `SUMIFS` is row-position-independent.)

### 2.7 `Dashboard` (REWRITTEN)

Three sections, all formula-driven:

1. **Top-line KPI strip** — Total Payroll, Still Unpaid, Active Agents, Avg / Agent-Week — all `SUMPRODUCT` / `SUMIF` against `Payroll Run`.
2. **Agent leaderboard** — `=SUMIFS('Payroll Run'!Q:Q, 'Payroll Run'!A:A, <id>)` for total earned; `SUMIFS` filtered by `STATUS="UNPAID"` for still-unpaid. Sorted by total-earned descending.
3. **Pay-Period Detail** — for the selected `CURRENT_PERIOD_TAG` from `Config`, lists every agent's full breakdown (Base, KPI, Deduction, OT, Sun, Vac, Spiffs, Total), pulled directly with `SUMIFS` per column. **No more `—` placeholders.** Empty values are 0.

### 2.8 `Validation` (NEW)

Runs on every menu action. Six checks:

| # | Check | Failure mode |
|---|---|---|
| 1 | Every Payroll Run row has a non-blank Agent Name | Lists ghost-row addresses |
| 2 | Every Agent ID in Payroll Run exists in Agents OR Alumni | Lists unknown IDs |
| 3 | Every Rule Key in Payroll Run exists in Pay Rules | Lists unknown rules |
| 4 | No duplicate Agent ID in Agents tab | Lists dupes |
| 5 | Each week-header row has all 7 fields populated | Lists offending header rows |
| 6 | `Total Pay` per row equals `J+K-L+M+N+O+P` (or 0 if not included) | Lists mis-computed rows |

If any check fails, `refreshDashboard` aborts with a toast and points at the Validation tab.

---

## 3. Pay-Period Derivation (deterministic, never user-input)

Given a week's `END_DATE`:

```
month = monthName(END_DATE)
day   = dayOfMonth(END_DATE)
PP    = day <= 15 ? "PP1" : "PP2"
PAY_PERIOD_CODE = upper(month) + PP
```

Examples:
- Week ending 2026-03-01 → MARCH PP1
- Week ending 2026-03-15 → MARCH PP1
- Week ending 2026-03-22 → MARCH PP2
- Week ending 2026-04-12 → APRIL PP1
- Week ending 2026-04-26 → APRIL PP2

This rule is locked in the spec because the user explicitly chose "PP1 = first half, PP2 = second half of month."

---

## 4. Weekly Earnings → Payroll Run pipeline

1. User imports/types a week's hours (E,F,G,H,I,P columns) under the appropriate week header.
2. Formulas in B,C,J,K,L,M,N,O,Q recalculate immediately — no script involvement.
3. User clicks **JOI Payroll → Lock Week** when the week is paid; the script:
   - Sets the header row's `STATUS` cell to `PAID`.
   - Optionally freezes formulas to values for historical immutability (off by default; on if `Config.B12 = LOCK_PAID_WEEKS`).

---

## 5. Apps Script Modules (v8.0)

Single Apps Script project, multiple `.gs` files, no duplicate functions:

```
Code.gs            – top-level menu + onOpen + brand constants (preserves JOI palette)
Config.gs          – read/write Config tab, version checks
Agents.gs          – agent list helpers, validation
PayRules.gs        – pay-rule helpers, validation
PayrollRun.gs      – week creation, header writing, cleanup of ghost rows
Monthly.gs         – clone MonthlyTemplate → produce / refresh month tabs
Dashboard.gs       – refresh KPI strip + leaderboard + period detail
Validation.gs      – the six checks; gating function
Util.gs            – date utilities (week-end, PP code), brand styling helpers
```

Menu structure:

```
JOI Payroll
├── 1. New Week…              (creates next week-header row + agent rows; auto-derives PP code)
├── 2. Lock Week as Paid…     (toggles STATUS = PAID for selected week-header)
├── 3. Refresh Monthly Sheet  (rebuilds the current month tab from Payroll Run)
├── 4. Refresh Dashboard      (after running Validation)
├── 5. Run Validation         (six checks, output to Validation tab)
├── ───────
├── Add Agent…
├── Move Agent → Alumni…
├── ───────
├── Settings (open Config tab)
└── About v8.0
```

Every menu function calls `Validation.runAll()` first. If validation fails, the function aborts with a toast.

---

## 6. Migration Plan (live data → v8.0)

This is **not** a destructive rewrite. Steps:

1. Make a backup copy of the live Sheet (`File → Make a copy → JOI PayRoll APP — pre-v8 backup`).
2. Apply the v8.0 `.xlsx` template to a fresh sheet OR upgrade the existing sheet:
   - Insert/rename `Config` tab.
   - Clean `Pay Rules`: trim department names, fix BLB doc-collector rate, rename `Recuirtment` → `Recruitment`.
   - Clean `Agents`: delete the 5 duplicate `CAMPAIGN SUMMARY` blocks; force formula in column F for all rows.
   - In `Payroll Run`: write proper week headers (one row per week with all 7 fields), delete every ghost row (32 rows), replace numeric snapshots with the formulas in columns B/C/J/K/L/M/N/O/Q.
   - Delete `March 26 PayRoll` and `April 26 PayRoll`. Generate them fresh from `MonthlyTemplate` via `Monthly.refreshMonth("March 2026")` and `Monthly.refreshMonth("April 2026")`.
   - Delete the old `Code.gs` and replace with the 9 new `.gs` files.
3. Run **Validation**. Resolve any flags.
4. Run **Refresh Dashboard**. Compare Javier's total to **$73,987.50** — must match exactly.

---

## 7. Acceptance Tests (must all pass before sign-off)

| # | Scenario | Expected outcome |
|---|---|---|
| T1 | Sum of Payroll Run column Q for Agent ID 1 | $73,987.50 |
| T2 | Dashboard "Total Earned" for Agent ID 1 | $73,987.50 (matches T1) |
| T3 | March monthly Grand Total + April monthly Grand Total = sum of all Payroll Run weeks |
| T4 | Insert a new agent (ID 99) into Agents | Appears on Dashboard, monthlies, no script edits needed |
| T5 | Soft-delete an agent (move to Alumni) | Drops off live Dashboard but historical weeks still resolve their name |
| T6 | Edit an agent's Pay Rule | Every prior unlocked week's totals update; locked weeks unchanged |
| T7 | Insert a row inside `Agents` | No payroll number changes anywhere |
| T8 | Delete a ghost row | No payroll number changes (because there were no real numbers) |
| T9 | Run Validation with a deliberately broken Rule Key | Fails loudly, refuses to refresh Dashboard |
| T10 | Add a Week 5 to a 5-week month | MonthlyTemplate accommodates W5 column without manual edits |

---

## 8. Out of Scope for v8.0

- No new metrics. The Dashboard layout matches what's there today (top-line strip, agent table, campaign breakdown, pay-period detail) — just driven by formulas instead of snapshots.
- No payroll-rule changes. Pay Rules numbers remain identical; only data-quality fixes (BLB rate string→number, trailing-space trims, `Recuirtment`→`Recruitment` typo).
- No payment integrations. v8.0 is the calculation+reporting layer; manual marking of `STATUS = PAID` remains the workflow.

---

## 9. Sign-off Gate

The user reviews this spec and either:
- ✅ **Approves as-is** — Claude proceeds to build the v8.0 codebase + xlsx template.
- 🟡 **Approves with edits** — Claude updates the spec, re-confirms, then builds.
- ❌ **Rejects** — Claude does not write code.
