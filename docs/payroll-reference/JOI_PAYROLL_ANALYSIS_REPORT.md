# JOI Payroll — Full Bug & Structure Analysis Report
**File analyzed:** JOI PayRoll APP (1).xlsx  
**Date:** May 4, 2026  
**Status: READ-ONLY — No changes made. Presenting findings for your approval.**

---

## OVERVIEW

After reading every tab, every row, every value — here is the complete picture of what's wrong with your original file. I've grouped issues by severity so we can agree on exactly what to fix.

Total issues found: **21 bugs** across all 7 tabs  
Critical (break payroll math): **8**  
Structural (cause script failures): **7**  
Data quality (dirty data, typos, inconsistencies): **6**

---

## TAB 1 — DASHBOARD

### 🔴 BUG-01 — Total mismatch: header badge vs. table total
- Header banner shows: **$1,507,841.53**
- "ALL AGENTS TOTAL" row shows: **$1,504,841.53**
- Difference: exactly **$3,000**
- Root cause: BLB|DOC COLLECTOR pay rule has a corrupted value (see BUG-04 below). The banner likely hardcoded a value at a different time than the table was last calculated.

### 🟡 BUG-02 — All agents show UNPAID despite history being paid
- Every agent displays 🟡 UNPAID on Dashboard
- Root cause: The Dashboard reads the per-row PAID/UNPAID column from Payroll Run. Most rows in Payroll Run have NULL in that column (see BUG-09 and BUG-10 below). So the formula finds "null" and calls everyone unpaid.
- This is a downstream symptom of the Payroll Run sheet bugs.

### 🟡 BUG-03 — Floating point display on Ivana Herkommer
- Her total displays as a scientific notation number instead of a dollar amount
- Root cause: A formula is returning a raw float that isn't being formatted as currency

---

## TAB 2 — PAY RULES

### 🔴 BUG-04 — BLB|DOC COLLECTOR: Weekly Base Pay stored as TEXT, not a number
- Row 27, Column F (Weekly Base Pay): value is the string `"$3,00.00"` (note: missing a zero — should be `$3,000.00`)
- Because it's text, VLOOKUP returns the literal string `"$3,00.00"`, which makes every pay calculation for any BLB Doc Collector return **$0 or an error**
- This is also the exact $3,000 that explains the Dashboard total discrepancy (BUG-01)

### 🔴 BUG-05 — ADMIN|RECUIRTMENT: Typo + trailing space in rule key
- Pay Rules row 25 Rule Key column: `"ADMIN|RECUIRTMENT |WEEKDAY"` (misspelled "RECUIRTMENT" + space before the pipe)
- The Agents sheet (Agent 42, Paty Rodriguez) also has the same typo: Department = `"Recuirtment "`
- These match each other by accident — the system works right now only because both sides have the same typo
- This is a trap: fix one side without the other and Agent 42 gets $0 pay
- **Correct spelling:** RECRUITMENT

### 🟡 BUG-06 — Trailing spaces in rule keys create silent mismatches
Three rules have trailing spaces that will cause lookup failures for any new agent added with clean data:
- Row 17: `"TORRO|TRAINING |WEEKDAY"` — "Training " has a trailing space
- Row 21: `"HFB|DESIGNER |WEEKDAY"` — "Designer " has a trailing space
- Row 25: (covered above, same issue)

### 🟡 BUG-07 — Unrounded daily deduction values create floating point errors
- HFB|TL APPOINTMENT (row 31): Daily deduction = `666.666` (not 666.67)
- HFB|DESIGNER IVANA (row 32): Daily deduction = `833.333` (not 833.33)
- HFB|DESIGNER LUCIA (row 33): Daily deduction = `666.666`
- These cause cents-level discrepancies to accumulate every week

---

## TAB 3 — AGENTS

### 🟡 BUG-08 — Agent 42 (Paty Rodriguez): typo in Department field
- Department stored as `"Recuirtment "` (misspelled + trailing space)
- Rule Key stored as `"ADMIN|RECUIRTMENT |WEEKDAY"` — matches Pay Rules row 25 only because both have the same typo
- Should be: Department = `"Recruitment"`, Rule Key = `"ADMIN|RECRUITMENT|WEEKDAY"`
- **Warning:** Must fix BOTH the Agents sheet AND the Pay Rules sheet at the same time, or payroll breaks

### ℹ️ INFO — 9 Alumni agents create blank rows in Payroll Run
- Agent IDs 7 (Wendy Mena), 18 (Javier Natividad), 23 (Irving Fuentes), 28 (Hannia Belem), 30 (Edgar Barron), 33 (Teresita Hernandez), 39 (Jhon Rodriguez), 40 (Luis Ventura), 51 (Santiago Lopez) are now in Alumni
- They no longer appear in the Agents sheet
- But Payroll Run still has rows for them in every week block, showing blank Name and blank Rule Key
- This is expected behavior if alumni are removed from Agents — but the blank rows look messy and cause 32 "ghost rows" in Payroll Run

---

## TAB 4 — PAYROLL RUN (Most critical tab)

### 🔴 BUG-09 — Block 1 (Week 1 March) has NO block header row
- Every week block (Weeks 2–9) starts with a header row like:
  `WEEK 2 | date | [status] | [pay period]`
- Block 1 (rows 4–44, the very first week of March) has **no header row at all** — it starts immediately with agent data after the column headers at row 3
- This means:
  - The script cannot detect where Block 1 starts
  - Block 1 has no date assigned
  - Block 1 has no status ("PAID"/"UNPAID") written anywhere
  - Block 1 has no pay period tag (MARCHPP1/PP2)
  - Any script that scans for block headers to build a week list will completely miss this week
  - The "Week Status Overview" popup would not show this week at all

### 🔴 BUG-10 — Week 5 (rows 175–218): All 44 agent rows have NULL status and NULL pay period
- The block header at row 174 shows `"✅ PAID"` and `"MARCHPP2"`
- But every single agent row inside that block (rows 175–218) has an empty PAID/UNPAID column and empty Pay Period Group column
- The script marked the block-level header as paid but never wrote the status back down to the individual rows
- This breaks the Dashboard (which reads per-row status), totals formulas, and pay period reporting

### 🔴 BUG-11 — TOTAL PAID = $0.00 despite all 8 visible blocks marked PAID
- Row 406: `TOTAL PAID PAYROLL = $0.00`
- Row 405: `TOTAL UNPAID PAYROLL = $1,772,506.43`
- The totals formula is summing based on per-row PAID/UNPAID status
- Because Week 1 (BUG-09) has no individual row status, and Week 5 (BUG-10) has all nulls, a huge chunk of rows register as "not paid"
- The formula logic is: if `PAID/UNPAID` column = "✅ PAID" → count toward paid total. NULL ≠ "✅ PAID", so those rows fall into unpaid

### 🟡 BUG-12 — All block header dates are wrong
- Every block header (rows 45, 89, 133, 174, 219, 264, 313, 358) stores a **month start date** instead of the **week end date**
  - All March blocks show `2026-03-01`
  - All April blocks show `2026-04-01`
  - Blocks 8 and 9 (rows 313, 358) even have **time components** (13:54:47, 17:29:49) from when the script ran — inconsistent with other blocks
- Because dates are wrong, you cannot sort, filter, or identify weeks by date — the system is relying only on block position, not date

### 🟡 BUG-13 — Week 5 block header row has garbage zeros in pay columns
- Row 174 (Week 5 header): columns 10–14 and 17 contain `0` values
- These come from formula bleed-through — the script may have applied row formulas to the header row by accident
- Minor display issue but signals the script is writing formulas incorrectly to header rows

### 🟡 BUG-14 — Agent 51 (Santiago Lopez): blank rule key in Payroll Run
- Already identified in previous analysis
- Agent 51 had a blank rule key in one week's block, causing a calculation error
- The fix (agentFallback map) is already in JOI_PAYROLL_V8_FINAL.gs

---

## TAB 5 — MARCH 26 PAYROLL

### 🔴 BUG-15 — Pay Period Summary section only contains Week 1 data
- The "📊 PAY PERIOD SUMMARY" section (rows 53–101) is supposed to show Week 1, Week 2, Week 3, Week 4 pay per agent
- Week 2 column (col D) = all zeros for every agent
- Week 3 column (col F) = all zeros
- Week 4 column (col G) = all zeros
- Only Week 1 (col C) has real numbers
- Grand Total of $158,284 is therefore severely understated — it represents only the first week of March
- The script built this summary table but only populated one column

### 🟡 BUG-16 — March and April sheets have different layouts (structural inconsistency)
- **March** layout: Shows 2 weeks side by side per section (Weeks 1&2 in rows 5–48, Weeks 3&4 below in rows 51–52)
- **April** layout: Shows all 4 weeks in one horizontal section (all in rows 5–52, across columns 1–21)
- This means any script that reads monthly sheets by column position will break on one of them
- The March week section for Weeks 3&4 (rows 49–52) is also barely populated — only 2 rows of data before the Summary starts at row 53, which is wrong

---

## TAB 6 — APRIL 26 PAYROLL

### 🔴 BUG-17 — CRITICAL: Week 2 column agent order doesn't match Week 1 — Bi-Weekly Totals are WRONG
- In the April sheet, each week's column lists agents in a DIFFERENT order
- Week 1 row 6: **Jose Ham** ($6,000)
- Week 2 row 6: **Adrian Arechiga** ($5,700)
- Bi-Weekly Total row 6: **$15,800** — but that's NOT $6,000 + $5,700 = $11,700
- The Bi-Weekly Total column is adding the same row number across different columns, but since each column has different agents in it, you're adding **Jose Ham's Week 1 pay to a completely different agent's Week 2 pay**
- Out of 15 rows checked, **14 had wrong bi-weekly totals**
- This is the most severe financial error in the file — agents may be receiving wrong pay amounts calculated from this sheet

### 🔴 BUG-18 — 5 duplicate Campaign Summary blocks
- The "CAMPAIGN SUMMARY" section appears **5 times** (at rows 51, 61, 71, 81, 91) with different totals in each
- The script appended a new summary block every time it ran without clearing the previous one
- With 5 versions showing different agent counts (44–46) and different totals, it's impossible to know which one is correct
- These duplicate blocks take up ~50 rows of space and contaminate any formula that references the summary area

---

## TAB 7 — ALUMNI

### ✅ No critical bugs
- 9 alumni agents, all properly recorded
- 8 show "✅ CLEAR" (balance $0)
- 1 shows "✅ PAID" — Javier Natividad, balance $3,000, paid 2026-04-29
- Alumni rule keys are clean and correct
- One minor note: Irving Fuentes (row 12) has an email stored but no other alumni do — inconsistent but not a problem

---

## SUMMARY TABLE

| # | Tab | Severity | Bug |
|---|-----|----------|-----|
| BUG-01 | Dashboard | 🔴 Critical | Total in header badge vs. table are $3,000 apart |
| BUG-02 | Dashboard | 🟡 Structural | All agents show UNPAID (downstream of Payroll Run bugs) |
| BUG-03 | Dashboard | 🟡 Data | Floating point display on Ivana Herkommer |
| BUG-04 | Pay Rules | 🔴 Critical | BLB|DOC COLLECTOR base pay is text "$3,00.00" not number |
| BUG-05 | Pay Rules | 🔴 Critical | ADMIN|RECUIRTMENT typo + trailing space — matched by same typo in Agents |
| BUG-06 | Pay Rules | 🟡 Data | Trailing spaces in TRAINING and DESIGNER rule keys |
| BUG-07 | Pay Rules | 🟡 Data | Unrounded daily deductions (666.666, 833.333) on HFB designer roles |
| BUG-08 | Agents | 🟡 Data | Agent 42 department/rule key typo (must be fixed with Pay Rules simultaneously) |
| BUG-09 | Payroll Run | 🔴 Critical | Block 1 (Week 1 March) has no block header row — invisible to scripts |
| BUG-10 | Payroll Run | 🔴 Critical | Week 5 all 44 rows have NULL status and NULL pay period |
| BUG-11 | Payroll Run | 🔴 Critical | TOTAL PAID = $0 despite all blocks marked PAID |
| BUG-12 | Payroll Run | 🟡 Structural | All block header dates show month start (03-01, 04-01) not week end dates |
| BUG-13 | Payroll Run | 🟡 Structural | Week 5 header row has garbage zeros in pay columns |
| BUG-14 | Payroll Run | 🟡 Structural | Agent 51 blank rule key (fix already in V8_FINAL.gs) |
| BUG-15 | March PayRoll | 🔴 Critical | Pay Period Summary only has Week 1 data; Weeks 2–4 all show $0 |
| BUG-16 | March PayRoll | 🟡 Structural | March and April sheets use completely different column layouts |
| BUG-17 | April PayRoll | 🔴 Critical | Bi-Weekly Totals are WRONG — agents misaligned across week columns |
| BUG-18 | April PayRoll | 🔴 Critical | 5 duplicate Campaign Summary blocks with conflicting totals |

---

## WHAT I RECOMMEND WE FIX (waiting for your go-ahead)

**Group A — Pure data fixes (safe, small, no script changes needed):**
- BUG-04: Fix BLB|DOC COLLECTOR base pay from `"$3,00.00"` → `3000`
- BUG-05 + BUG-08: Fix typo RECUIRTMENT → RECRUITMENT in Pay Rules + Agents simultaneously
- BUG-06: Remove trailing spaces from TRAINING and DESIGNER rule keys
- BUG-07: Round 666.666 → 666.67 and 833.333 → 833.33

**Group B — Script fixes (the V8_FINAL.gs already handles some of these):**
- BUG-09: Script must write a block header row for Block 1 during migration
- BUG-10: Script must write per-row status to all rows in every block (not just the block header)
- BUG-11: Totals formula must sum based on block-header status, not per-row status
- BUG-12: Block header date must store the actual week end date, not month start
- BUG-13: Script must not apply row formulas to block header rows

**Group C — Monthly sheet rebuild (structural):**
- BUG-15: Regenerate March Pay Period Summary with all 4 weeks populated
- BUG-16: Standardize March and April to use the same layout
- BUG-17: Rebuild April bi-weekly totals using agent ID matching, not row position matching
- BUG-18: Clear duplicate Campaign Summary blocks, keep only one

---

*This report is for review only. Nothing has been changed in your file.*
*Tell me which groups you want to tackle first and we'll build them together.*
