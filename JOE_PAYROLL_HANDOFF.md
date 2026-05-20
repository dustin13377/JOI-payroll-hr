# JOI Payroll — Master Handoff Document

> **Audience:** A new Claude instance taking over this project.
> **Goal:** You must be able to calculate any agent's pay correctly without consulting the user.
> **Author:** Prepared by Claude (Cowork session) on 2026-05-19.
> **Owner:** Joe Renteria (joe.renteria@torro.com).

---

## 0. TL;DR — Read This First

1. **The platform is Google Apps Script** running inside a single Google Sheet titled **"JOI PayRoll APP"**. There is no separate database. The sheet IS the database.
2. **The authoritative source code is `JOI_PAYROLL_CLEAN.js`** (also published as `deploy/Code.js` — the two files are byte-identical, last modified 2026-05-14). 198 functions, no duplicates.
3. **The authoritative pay-calculation function is `calcAgentPay_(rule, inputs)`** at line 885 of `JOI_PAYROLL_CLEAN.js`. Every other calculator path (live edits, batch recalc, paystub generation) routes through it.
4. **The pay model is rule-based, not employee-based.** Each agent is tagged with a `Rule Key` of the form `CAMPAIGN|DEPARTMENT|SHIFT` (e.g. `TORRO|TRAINING|WEEKDAY`). The Pay Rules sheet stores one row per rule key with all of its rates. Two agents on the same rule key earn the same pay for identical inputs.
5. **Currency is Mexican Pesos (MXN)** — this is a Mexico-based payroll. The "$" sign in the sheet is cosmetic. Holiday pay follows Mexican LFT (Ley Federal del Trabajo) — see §4.6.
6. **Pay Periods are bi-monthly:** PP1 = weeks ending on/before the 15th of the month, PP2 = weeks ending after the 15th. Codes look like `APRIL26PP1`.
7. **Status workflow per row:** `UNPAID` 🟡 → `COMPLETE` 🔵 → `PAID` ✅. `PAID` rows are frozen — `joiRecalculatePayrollRunRow_` refuses to touch them (line 8319).

---

## 1. Project File Inventory

All paths are relative to the project root (`/Users/jose/Documents/Claude/Projects/JOI PayRoll APP/`).

| File | Type | Lines | Status | Purpose |
|---|---|---|---|---|
| `JOI_PAYROLL_CLEAN.js` | Apps Script | 9,130 | **CANONICAL** | Single consolidated authoritative script. Use this. |
| `deploy/Code.js` | Apps Script | 9,130 | **CANONICAL (mirror)** | Byte-identical copy of CLEAN, packaged for `clasp push`. |
| `deploy/appsscript.json` | Manifest | 23 | CANONICAL | OAuth scopes + advanced services. Required for deploy. |
| `deploy/.clasp.json` | Config | — | CANONICAL | clasp project ID. |
| `deploy/deploy.sh` | Shell | — | CANONICAL | `bash deploy.sh` to push to Apps Script. |
| `deploy/HOW_TO_DEPLOY.md` | Doc | 63 | CANONICAL | User-facing deploy instructions. |
| `REBUILD_SPEC_v8.md` | Spec | 305 | **HISTORICAL** (May 3, 2026) | The architectural rebuild spec for v8.0. Still good background reading for the *design intent* — schemas, validation rules, acceptance tests. The implementation has since moved past v8.0 to the May-14 CLEAN build, which is broader (holiday pay, paystubs, email, breakdowns). |
| `JOI_PAYROLL_ANALYSIS_REPORT.md` | Bug audit | 226 | **HISTORICAL** (May 4, 2026) | The 21-bug forensic audit that motivated the rebuild. All 18 critical/structural bugs (BUG-01 through BUG-18) are addressed in CLEAN. Useful as a regression checklist. |
| `JOI_PAYROLL_V8_FINAL.gs` | Apps Script | 2,442 | **SUPERSEDED** | Intermediate "v8.1 DEFINITIVE" build. Do not deploy. |
| `JOI_PAYROLL_V9.gs` | Apps Script | 3,420 | **SUPERSEDED** | v9 rebuild (May 4). Layer-based architecture. CLEAN inherits this structure. |
| `JOI_Payroll_Complete_Fixed.gs` | Apps Script | 1,068 | **SUPERSEDED** | v9 + paystub fixes (May 5). Folded into CLEAN. |
| `JOI_CLEANUP.gs` | Apps Script | 162 | **ONE-SHOT UTILITY** | Run-once script to backup + delete legacy tabs (`Validation`, `Payroll Run v8`, `Pre-v8 Snapshot`) and reorder the surviving tabs. Already run; kept for reference. |
| `CLAUDE.md` | Doc | 0 | EMPTY | Placeholder. |
| `HANDOFF.md` | Doc | — | **THIS FILE** | What you are reading. |

**If you change anything, edit only `JOI_PAYROLL_CLEAN.js` and copy the same change into `deploy/Code.js`** (or just `cp JOI_PAYROLL_CLEAN.js deploy/Code.js` afterward). Treat the V8/V9/Complete_Fixed files as read-only history.

---

## 2. The Google Sheet — Tab Inventory

The live spreadsheet (the actual production data) has these tabs, in display order:

1. **Dashboard** — auto-built read-only view of latest week + YTD per agent.
2. **Pay Rules** — every pay rule (one per `CAMPAIGN|DEPARTMENT|SHIFT` combination).
3. **Agents** — active employee directory.
4. **Payroll Run** — the master ledger. One block per week, one row per agent per week.
5. **March 26 PayRoll**, **April 26 PayRoll**, … — monthly summary tabs (auto-synced from Payroll Run).
6. **Alumni** — former employees (kept for historical lookups + final paycheck tracking).

Legacy tabs (`Validation`, `Payroll Run v8`, `Pre-v8 Snapshot`) were deleted by `JOI_CLEANUP.gs`.

---

## 3. Schema — Column Maps (1-indexed, matches `PR_COL` / `RULE_COL` / etc. in code)

### 3.1 `Pay Rules` (sheet `Pay Rules`, `RULE_COL` in code)

| Col | Header | Type | Notes |
|---|---|---|---|
| 1 | Rule Key | String | `UPPER(CAMPAIGN \| DEPARTMENT \| SHIFT)`, normalized by `normalizeRuleKey_`. |
| 2 | Campaign | String | e.g. `TORRO`, `BLB`, `HFB`, `ADMIN`. |
| 3 | Department | String | e.g. `TRAINING`, `DOC COLLECTOR`, `RECRUITMENT`. |
| 4 | Shift | String | `WEEKDAY`, `WEEKEND`, etc. |
| 5 | Full Attendance | Number | Days that constitute a full week (typically 5). |
| 6 | Weekly Base Pay | **Number** | The flat weekly salary if the agent works the full week. Must be numeric (BUG-04 was a text value). |
| 7 | Daily Salary | Number | Per-day rate. Used for vacation pay, holiday pay, partial weeks. |
| 8 | KPI Bonus | Number | Flat bonus if `KPI_ACHIEVED = YES`. |
| 9 | Missed Day Deduction | Number | Per-missed-day deduction amount. |
| 10 | Overtime Day Pay | Number | Per-OT-day pay. |
| 11 | Sunday Bonus | Number | Per-Sunday-worked bonus. |
| 12 | Vacation Premium % | Decimal | e.g. `0.25` means 25% premium on top of regular daily rate during vacation. |

### 3.2 `Agents` (sheet `Agents`, `AG_COL` in code)

| Col | Header | Type | Notes |
|---|---|---|---|
| 1 | Agent ID | Integer | Unique positive integer. Skip rows where this isn't a valid integer. |
| 2 | Agent Name | String | Full name. |
| 3 | Campaign | String | Feeds Rule Key. |
| 4 | Department | String | Feeds Rule Key. |
| 5 | Shift | String | Feeds Rule Key. |
| 6 | Rule Key | String | Should equal `UPPER(C\|D\|E)`. Run `normalizeRuleKey_` to be safe. |
| 7 | Email | String | Used by `emailAllPaystubs`. |
| 8 | Start Date | Date | Used to detect mid-week starts → `calcPartialWeekPay_`. |
| 9 | Notes | String | Freeform. |

### 3.3 `Alumni` (sheet `Alumni`, `AL_COL` in code)

| Col | Header | Type | Notes |
|---|---|---|---|
| 1 | Agent ID | Integer | Must NOT also appear in Agents. |
| 2 | Agent Name | String | |
| 3 | Campaign | String | |
| 4 | Department | String | |
| 5 | Rule Key | String | For historical paystub lookups. |
| 6 | Email | String | |
| 7 | End Date | Date | Last day. |
| 8 | Balance Owed | Number | Final-check amount due (if any). |
| 9 | Payout Status | String | `CLEAR` or `PAID`. |
| 10 | Date Paid | Date | When the final check went out. |

### 3.4 `Payroll Run` (sheet `Payroll Run`, `PR_COL` in code) — THE LEDGER

Two row types: **week-header rows** (one per week) and **agent rows** (one per agent per week, immediately under the header).

**Week-header row** (identified by Col A starting with the literal text `WEEK`):

| Col | Field | Notes |
|---|---|---|
| 1 | Week Label | e.g. `WEEK 1` |
| 2 | Month Year | e.g. `April 2026` (also doubles as date-range fallback) |
| 3 | Date Range | e.g. `WEEK 1 04/06/26 – 04/12/26` — parsed by `parsePayrollBlockDateRange_` |
| 21 | Status | `UNPAID` / `COMPLETE` / `PAID` (per-block; per-row status is also written on every agent row — that's the fix for BUG-10) |
| 22 | Pay Period | e.g. `APRIL26PP1` |

The block ends at the row before the next `WEEK …` header (or at the row before the totals block at the bottom of the sheet).

**Agent row** (per-agent per-week):

| Col | Field | Source | Editable? |
|---|---|---|---|
| 1 | Agent ID | manual / from menu | yes (locked once entered) |
| 2 | Agent Name | manual / from menu | yes |
| 3 | Rule Key | manual / from menu | yes |
| 4 | Include In Payroll | dropdown `YES`/`NO` | yes — `NO` zeros out the totals while preserving inputs |
| 5 | Missed Days | number | yes |
| 6 | Overtime Days | number | yes |
| 7 | Sundays Worked | number | yes |
| 8 | Vacation Days | number | yes |
| 9 | Holiday Days | number | yes — see §4.6 |
| 10 | KPI Achieved | dropdown `YES`/`NO` | yes |
| 11 | Weekly Base Pay | **calculated** | NO — overwritten on every recalc |
| 12 | KPI Bonus | **calculated** | NO |
| 13 | Missed Deduction | **calculated** | NO |
| 14 | Overtime Pay | **calculated** | NO |
| 15 | Sunday Pay | **calculated** | NO |
| 16 | Vacation Pay | **calculated** | NO |
| 17 | Holiday Pay | **calculated** | NO |
| 18 | Extra Bonus (Spiffs) | manual | yes |
| 19 | Total Pay | **calculated** | NO |
| 20 | Partial Week | number (days worked if < 5) | yes — triggers partial-week formula |
| 21 | Status | `UNPAID`/`COMPLETE`/`PAID` | set by menu actions |
| 22 | Pay Period | e.g. `APRIL26PP1` | set automatically |
| 23 | Memo | string | yes (status badge is prepended automatically) |

**Trigger:** `onEdit` (line 8261) watches columns 3, 4, 5, 6, 7, 8, 9, 10, 18, 20 — any edit triggers `joiRecalculatePayrollRunRow_` which recomputes cols 11–19. **`PAID` rows are skipped** (line 8319), so historical pay can never be silently altered.

---

## 4. Pay Calculation — The Authoritative Formulas

All money calculations happen in `calcAgentPay_(rule, inputs)` (CLEAN line 885). Inputs come from columns 5–10, 18, 20 of the agent row. The `rule` object is the row from `Pay Rules` keyed by the agent's normalized `Rule Key`.

### 4.1 Full-week formula

When `partialWeek == 0` (the normal case):

```
weeklyBase   = rule.weeklyBase                                      // flat
kpiBonus     = (kpiAchieved == 'YES') ? rule.kpiBonus : 0
missedDed    = round( missedDays   * rule.missedDed   , 2)
overtimePay  = round( overtimeDays * rule.overtimePay , 2)
sundayPay    = round( sundaysWorked * rule.sundayBonus, 2)
vacationPay  = round( vacationDays * rule.dailySalary * (1 + rule.vacationPct) , 2)
holidayPay   = round( holidayDays  * rule.dailySalary * 2 , 2)     // LFT extra — see §4.6
extraBonus   = inputs.extraBonus

totalPay     = round(
                 weeklyBase
               - missedDed
               + kpiBonus
               + overtimePay
               + sundayPay
               + vacationPay
               + holidayPay
               + extraBonus
               , 2)
```

### 4.2 Partial-week formula (mid-week start, `partialWeek > 0`)

```
weeklyBase   = round( rule.dailySalary * daysWorked, 2)    // pay only days worked
kpiBonus     = (kpiAchieved == 'YES') ? rule.kpiBonus : 0
overtimePay  = round( overtimeDays * rule.overtimePay, 2)
sundayPay    = round( sundaysWorked * rule.sundayBonus, 2)
holidayPay   = round( holidayDays  * rule.dailySalary * 2, 2)
extraBonus   = inputs.extraBonus

missedDed    = 0          // no deductions on a partial start week
vacationPay  = 0          // no vacation accrual on partial week

totalPay     = round( weeklyBase + kpiBonus + overtimePay + sundayPay + holidayPay + extraBonus, 2)
```

`calcPartialWeekPay_` is at line 3099. It is invoked manually; `calcAgentPay_` also handles the partial-week branch when `inputs.partialWeek > 0` (line 920) — the two paths agree.

`calcWorkingDaysInWeek_` (line 3054) counts Monday–Friday days inclusive between `max(agentStartDate, weekStart)` and `weekStart + 4` (Friday). Saturdays and Sundays are not counted as partial-start days; Sunday work is captured by `sundaysWorked` instead.

### 4.3 `Include In Payroll == 'NO'`

When `include == 'NO'` (Col 4), `joiRecalculatePayrollRunRow_` (line 8340) zeros out **every** pay column except `extraBonus` (which is preserved as data), and sets `totalPay = 0`. The agent's inputs are kept visible but they earn nothing for that week.

### 4.4 Rounding policy

Every per-component intermediate is rounded to 2 decimals (`Math.round(x * 100) / 100`). The total is then re-rounded. This prevents the BUG-07 floating-point drift (`666.666`/`833.333` daily deductions). The user has already corrected the source data: `fixPayRulesData` (line 504) re-rounds Daily Salary and Missed Deduction on demand.

### 4.5 KPI Bonus is binary

KPI is a yes/no toggle per week per agent. There is no partial KPI bonus and no proration — the rule's `kpiBonus` value is paid in full or not at all.

### 4.6 Holiday pay (Mexican LFT)

Holiday Days (Col 9, input) and Holiday Pay (Col 17, calculated) implement Mexico's **Ley Federal del Trabajo Article 75**: working a mandatory rest day (official holiday) entitles the employee to the regular day's pay **plus** twice the daily wage as a bonus. So total compensation for a worked holiday is `dailySalary × 3`.

Because `weeklyBase` already includes one day's worth of normal pay for every scheduled workday in the week, the Holiday Pay column adds only the **extra** 2× component:

```
holidayPay = holidayDays × dailySalary × 2
```

If the agent's normal week is a 5-day week and they work 1 holiday inside it, their cash for that week is `weeklyBase + 2 × dailySalary` (= 5 normal days + 2-day holiday premium). If the agent works a holiday on what would otherwise be a missed day, you must also subtract one `missedDed` if that day shows up in `missedDays`. In practice the user enters Holiday Days separately and does NOT also count it as Missed.

### 4.7 Vacation pay premium

`vacationPay = vacationDays × dailySalary × (1 + vacationPct)`.

The Pay Rules vacation premium is stored as a decimal (`0.25` = 25%). A 5-day vacation week at a `dailySalary = 600` rule with `vacationPct = 0.25` produces `5 × 600 × 1.25 = 3,750`. The vacation premium is paid IN ADDITION to whatever is in `weeklyBase` — vacation does not zero out the base. The convention the system uses: when an agent is on vacation for a full week, the user sets `vacationDays = 5` and leaves `missedDays = 0`, so they get `weeklyBase + vacationPay`. If you want vacation to replace base pay instead, the user must set `missedDays = vacationDays` so the base nets out. Confirm the user's expectation if in doubt.

---

## 5. Pay Period & Week Derivation

### 5.1 Pay Period code (`payPeriodCode_`, line 103)

```
month = endDate.toLocaleString('en-US', { month: 'long' }).toUpperCase()
year  = String(endDate.getFullYear()).slice(-2)
half  = endDate.getDate() <= 15 ? 'PP1' : 'PP2'
code  = month + year + half     // "APRIL26PP2"
```

| Week end date | Pay Period Code |
|---|---|
| 2026-03-01 | MARCH26PP1 |
| 2026-03-15 | MARCH26PP1 |
| 2026-03-22 | MARCH26PP2 |
| 2026-04-12 | APRIL26PP1 |
| 2026-04-26 | APRIL26PP2 |

Legacy codes without a year (`MARCHPP1`) are still parsed by `payPeriodLabel_` for backward compatibility, but every new block uses the year-tagged form.

### 5.2 Week boundaries

Weeks run **Monday → Sunday**. The week-end date stored on the header is the Sunday. The user's chosen workweek is Mon–Fri for partial-week counting, with Saturdays unscheduled and Sundays handled via `sundaysWorked` (paid as a bonus, not part of base).

### 5.3 Adding a new week

`addNewWeek` (line 1451) suggests the next Sunday after the most-recent existing week. The user can override the date. The script:
1. Calculates `weekStart = endDate − 6 days`, `endDate = picked Sunday`.
2. Writes the week-header row.
3. Inserts one agent row per active agent (sorted by Agent ID).
4. Pre-fills `Include = YES`, `KPI Achieved = YES`, all numeric inputs blank (treated as 0).
5. Computes pay and writes status `UNPAID`.

---

## 6. Status Workflow — Per Row + Per Block

| Stage | Status | Color | What happens |
|---|---|---|---|
| Just created | `UNPAID` 🟡 | yellow | Editable. `onEdit` recalcs on every change. |
| Reviewed & approved | `COMPLETE` 🔵 | blue | Still editable. Indicates "ready to pay." |
| Money has gone out | `PAID` ✅ | green | Locked. `joiRecalculatePayrollRunRow_` refuses to recalc (CLEAN line 8319). Inputs are still visible but recalculation is skipped. |

**Menu actions:**
- `Mark Week as Complete` (line 2206) — UNPAID → COMPLETE for an entire week-block.
- `Mark Pay Period as PAID` (line 2320) — COMPLETE → PAID for **all weeks in the same `ppCode`** (e.g. all weeks coded `APRIL26PP1`).
- `Unlock Completed Week` (line 5503) — COMPLETE → UNPAID for a single week (admin-only).
- `Unlock PAID Period` (line 2502) — PAID → COMPLETE for an entire pay period (admin-only, gated by checkbox).

The status is written **both** on the week-header row (col 21) **and** on each individual agent row (col 21). `joiSyncAllBlockRowStatuses` (line 1879) is the repair tool if those two ever drift apart. `joiSetRowStatus_` (line 8725) also keeps the memo's emoji indicator in lockstep with the status.

---

## 7. Monthly Sheets

`syncMonthlySheetFromPayrollRun(monthName, year, silent)` (line 7281) builds/refreshes a tab named like `April 26 PayRoll`. Layout: 4-week side-by-side, columns:

```
W1: ID Name Pay Notes   (cols 1–4)
W2: ID Name Pay Notes   (cols 5–8)
W3: ID Name Pay Notes   (cols 9–12)
W4: ID Name Pay Notes   (cols 13–16)
PP1 Total = W1+W2       (col 17)
PP2 Total = W3+W4       (col 18)
Grand Total              (col 19)
```

Bi-weekly totals are **agent-ID matched**, not row-matched (this is the BUG-17 fix). Even if the row order differs across week columns, the totals are correct because they `SUMIFS` by Agent ID, not by row position.

`ensureWeekFiveSection_` extends the layout when a month has a 5th week.

---

## 8. Paystubs & Reporting

- `generateOnePaystub` (line 5027) — single agent, one pay period, HTML → PDF, saved to `JOI Paystubs` folder in Drive.
- `generateAllPaystubs` (line 4432) — every active agent for a chosen pay period.
- `emailAllPaystubs` (line 4731) — generates + emails each agent at the email in the Agents sheet. Subject and body from `paystubEmailSubject_` / `paystubEmailHtmlBody_`.
- `agentPayrollBreakdown` (line 5177) — per-agent PDF: every week, grouped by pay period, with PAID/UNPAID rollups and a grand total.

Paystubs aggregate **all weeks in the pay period** for that agent (`collectWeekRowsForAgent_`, line 4391). The numbers on a paystub are read straight from Payroll Run columns 11–19 — paystubs do not recompute.

---

## 9. Validation, Repair, and Admin Tools

The `🔧 Repair Tools` submenu has 17 functions for healing dirty data:

- `joiRunFullRepairPack` — runs everything safe in order.
- `joiBackupPayrollRun` — snapshot before risky operations.
- `joiDebloatTotalPayRows` — kills the duplicate "TOTAL PAY" rows that older builds left at the bottom.
- `joiBackfillPayPeriodColumn` — fills missing Col 22 values.
- `joiResyncAllMonthlySheets` — rebuilds every monthly tab.
- `joiSyncAllBlockRowStatuses` — forces per-row status to match block-header status (the BUG-10 fix).
- `joiRepairCorruptBlockHeaders` — rewrites garbled week-header rows.
- `joiStandardizeAllBlockHeaders` — applies consistent styling.
- `joiRenumberWeekLabels` — fixes "WEEK 5" appearing twice, etc.
- `joiForceApplyDropdowns` — re-applies the YES/NO validation rules.
- `joiRepairCurrentMonthDefaults` — re-seeds KPI = YES on blank cells of the active month.
- `joiHarmonizeStatusMemo` — re-syncs the status badge prepended to the Memo column.
- `joiSelfTestFullPayrollFlow` — synthetic end-to-end test.
- `joiMigrateHolidayColumns` — **run once** when upgrading from a pre-holiday sheet to insert the Holiday Days and Holiday Pay columns.
- `joiRecalculateAllPayrollRun` — force-recompute every non-PAID row.
- `repairWeekDateHeaders`, `repairPayrollRunWeekFormatting`, `repairMonthlyTemplateLayout` — visual/format repairs.
- `sortPayrollWeekAgentRows` — alphabetize/numerically sort agents within a block.
- `joiClearWeeklyBasePayDropdown` — remove stray YES/NO validation that drifted into pay columns.

The `🛠️ Fix Pay Rules Data` action (`fixPayRulesData`, line 504) normalizes rule keys (`RECUIRTMENT` → `RECRUITMENT`, trailing-space trim), converts text currencies to numbers, and re-rounds Daily Salary and Missed Deduction to 2 decimals.

---

## 10. Brand & Styling Constants

Defined in the `BRAND` object (line 60) plus the `joiNavy_/joiGold_/joiCream_/joiBorder_/joiWhite_` helpers (line 7443).

| Token | Color | Use |
|---|---|---|
| `BRAND.headerBg` / `joiNavy_()` | `#070739` | All tab header rows |
| `BRAND.colHeaderBg` / `joiGold_()` | `#F4A623` | Column header row (row 3) |
| `joiCream_()` | `#FFF4DA` | Alternating row stripe |
| `joiWhite_()` | `#FFFFFF` | Alternating row stripe |
| `BRAND.unpaidBg` | `#FFF9C4` | UNPAID status background |
| `BRAND.completeBg` | `#E3F2FD` | COMPLETE status background |
| `BRAND.paidBg` | `#E8F5E9` | PAID status background |
| `BRAND.frozenBg` | `#F5F5F5` | PAID rows (greyed) |

`joiWriteTabHeader_` (line 301) is the unified header writer used by every tab — Row 1 = navy band with centered JOI logo, Row 2 = gold title strip.

---

## 11. Known Bugs Fixed (from `JOI_PAYROLL_ANALYSIS_REPORT.md`)

All 18 bugs are addressed in CLEAN. Use this as a regression checklist when making changes:

| ID | Where | Fix in CLEAN |
|---|---|---|
| BUG-01 | Dashboard header vs table $3,000 mismatch | Downstream — fixed when BUG-04 fixed |
| BUG-02 | Everyone shows UNPAID | `joiSyncAllBlockRowStatuses` + per-row status writes in `writeAgentPayRow_` |
| BUG-03 | Float scientific notation | All money columns get `setNumberFormat('$#,##0.00')` |
| BUG-04 | `"$3,00.00"` text | `fixPayRulesData` parses + rewrites as Number |
| BUG-05 | `RECUIRTMENT` typo | `normalizeRuleKey_` rewrites both `RECUIRTMENT` and `RECUITMENT` → `RECRUITMENT` |
| BUG-06 | Trailing spaces in rule keys | `normalizeRuleKey_` trims |
| BUG-07 | `666.666` / `833.333` daily deductions | `fixPayRulesData` re-rounds to 2 decimals + every calc rounds per component |
| BUG-08 | Agent 42 dept typo | Cleared by `fixPayRulesData` on the Agents side too |
| BUG-09 | Week 1 March no header | Migration writes a proper header; new weeks go through `addNewWeek` which always writes one |
| BUG-10 | Per-row status NULL | `writeAgentPayRow_` writes status on every row (line 967); `joiSyncAllBlockRowStatuses` repairs legacy |
| BUG-11 | `TOTAL PAID = $0` | `refreshPayrollRunTotals_` sums by per-row status |
| BUG-12 | Block headers had month-start dates | `repairWeekDateHeaders` rewrites with the actual week-end Sunday |
| BUG-13 | Header row had stray zeros in pay cols | `writeBlockHeader_` writes only the 7 header fields, never touches pay cols |
| BUG-14 | Agent 51 blank rule key | Agent already in Alumni; new menu actions block adding unknown rule keys |
| BUG-15 | March summary only Week 1 | `syncMonthlySheetFromPayrollRun` populates all 4 weeks |
| BUG-16 | March/April different layouts | All months use the same template (`repairMonthlyTemplateLayout`) |
| BUG-17 | April bi-weekly totals wrong | Totals are agent-ID `SUMIFS`, not row-position math |
| BUG-18 | 5 duplicate Campaign Summary blocks | Dashboard rebuilds from scratch every refresh; summary is single |

---

## 12. Deployment

```
cd "/Users/jose/Documents/Claude/Projects/JOI PayRoll APP/deploy"
bash deploy.sh
```

Behind the scenes: installs `clasp` if missing → browser auth → `clasp push -f` pushes `Code.js` + `appsscript.json` to the Apps Script project pointed at by `.clasp.json`. Required OAuth scopes:

```
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/drive
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/script.container.ui
https://www.googleapis.com/auth/script.scriptapp
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/documents
```

Timezone is `America/Los_Angeles` (the user is in California). Date math in the script uses local time accordingly — be careful if you ever change runtime to UTC.

After deploy: reload the spreadsheet → `🟡 JOI Payroll` menu → `Admin` → `🚀 First-Time Setup` (only if Pay Rules / Agents / Payroll Run sheets are missing; otherwise skip).

---

## 13. Acceptance Tests (from v8 spec — still valid)

Run these against the live sheet after any change to the calc engine:

| # | Scenario | Expected |
|---|---|---|
| T1 | `SUMIF(Payroll Run!A:A, 1, Payroll Run!S:S)` (Total Pay column for Agent ID 1 = Javier) | **$73,987.50** |
| T2 | Dashboard YTD column for Agent ID 1 | matches T1 |
| T3 | Sum of March monthly Grand Total + April monthly Grand Total | equals sum of Payroll Run Total Pay column for those months |
| T4 | Insert a new agent (ID 99) into Agents → run Add New Week | Agent 99 appears in the new week and on the Dashboard |
| T5 | Move an agent to Alumni | Future weeks exclude them; past weeks still resolve their name from Alumni |
| T6 | Edit a Pay Rule value | Unlocked weeks recalculate; PAID weeks unchanged |
| T7 | Insert/delete a row inside Agents | No payroll number changes |
| T8 | Force-recalc a PAID week | Refuses (silent in `joiRecalculatePayrollRunRow_`, error in `joiRecalculatePayrollRunBlock_`) |
| T9 | Add a rule key with a typo, attach to an agent | `validatePayRules_` flags the agent, paystub generation surfaces the missing rule |
| T10 | Add a Week 5 to a 5-week month | Monthly sheet's `ensureWeekFiveSection_` accommodates without manual edits |

---

## 14. What to Do First if You're the Next Claude

1. **Read this document end-to-end.** Then open `JOI_PAYROLL_CLEAN.js` and scan §1 (constants, lines 1–230) plus the `calcAgentPay_` block (lines 880–930). That is enough to answer 80% of pay questions.
2. **Do NOT touch V8/V9/Complete_Fixed.gs.** They are historical only.
3. **Single-source-edit rule.** When you make a change: edit `JOI_PAYROLL_CLEAN.js`, then `cp JOI_PAYROLL_CLEAN.js deploy/Code.js`. Never edit `deploy/Code.js` directly — the two must stay byte-identical.
4. **Pay calculation safety.** Any change to `calcAgentPay_`, `calcPartialWeekPay_`, `normalizeRuleKey_`, `getRuleMap_`, or `joiRecalculatePayrollRunRow_` should be followed by `joiSelfTestFullPayrollFlow` in the Apps Script editor.
5. **Never write to columns 11–19 of an agent row by hand.** Always go through `writeAgentPayRow_` or `joiRecalculatePayrollRunRow_` so the formula chain stays consistent.
6. **Never bypass the PAID lock.** If an admin wants to fix a paid week, they MUST go through `Unlock PAID Period` first; otherwise historical financial records change silently.
7. **Currency = MXN.** Don't introduce USD assumptions, tax withholding, or US-style deductions without confirming with Joe.
8. **The user is non-technical.** Surface errors via the JOI-branded dialog system (`joiShowMessageDialog_`, `joiDialogShell_`) rather than raw `console.log` or unhandled exceptions.

---

## 15. Quick Reference — Function Index (most-used)

| Function | Line | Purpose |
|---|---|---|
| `calcAgentPay_` | 885 | **The pay formula.** |
| `calcPartialWeekPay_` | 3099 | Mid-week start pay. |
| `calcWorkingDaysInWeek_` | 3054 | Mon–Fri day count for partial weeks. |
| `getRuleMap_` | 622 | `Map<ruleKey, ruleObject>` from Pay Rules. |
| `getAgentMap_` | 7666 | `Map<agentId, agentObject>` from Agents. |
| `normalizeRuleKey_` | 229 | Trim + uppercase + fix `RECUIRTMENT`. |
| `payPeriodCode_` | 103 | Date → `APRIL26PP1` style code. |
| `payPeriodLabel_` | 111 | Code → human label. |
| `writeAgentPayRow_` | 947 | Write all 23 cols of an agent row + formatting. |
| `getPayrollRunBlocks_` | 1023 | Discover every week-block. |
| `joiRecalculatePayrollRunRow_` | 8305 | Recompute one row from inputs. |
| `refreshDashboard` | 7710 | Rebuild Dashboard tab from Payroll Run. |
| `syncMonthlySheetFromPayrollRun` | 7281 | Rebuild a monthly tab. |
| `addNewWeek` | 1451 | Create the next week's block. |
| `markWeekAsComplete` | 2206 | UNPAID → COMPLETE. |
| `markPayPeriodAsPaid` | 2320 | COMPLETE → PAID for a whole PP. |
| `generateOnePaystub` | 5027 | One agent, one PP, PDF. |
| `emailAllPaystubs` | 4731 | Bulk email PDFs. |
| `onEdit` | 8261 | Live recalc on cell edits. |
| `onOpen` | 8163 | Menu construction. |

---

*End of HANDOFF.md. If anything in here is ambiguous, default behavior is "ask Joe before changing pay calculation." Pay accuracy is the project's top priority.*
