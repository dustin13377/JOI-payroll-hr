/**
 * ============================================================
 *  JOI PAYROLL SYSTEM  —  VERSION 9
 *  Fresh rebuild based on full analysis of original file
 *  Build decisions locked May 4, 2026
 * ============================================================
 *
 *  ARCHITECTURE
 *  ─────────────────────────────────────────────────────────
 *  Layer 1  Constants, branding, column maps
 *  Layer 2  Pay Rules sheet
 *  Layer 3  Agents + Alumni sheets
 *  Layer 4  Payroll Run sheet (block structure)
 *  Layer 5  Monthly sheets (4-week layout)
 *  Layer 6  Dashboard
 *  Layer 7  Workflow functions (Add Week / Complete / Paid)
 *  Layer 8  Menu + onOpen
 *
 *  STATUS SYSTEM  (per-row on every agent row)
 *  ─────────────────────────────────────────────────────────
 *  🟡 UNPAID   → yellow  (#FFF9C4 / #7a4f00)
 *  🔵 COMPLETE → blue    (#E3F2FD / #1565C0)
 *  ✅ PAID     → green   (#E8F5E9 / #2E7D32)  + values frozen
 *
 *  BUGS FIXED vs ORIGINAL
 *  ─────────────────────────────────────────────────────────
 *  BUG-01  Dashboard total badge vs table mismatch
 *  BUG-02  All agents showing UNPAID on Dashboard
 *  BUG-03  Floating point display (Ivana Herkommer)
 *  BUG-04  BLB|DOC COLLECTOR base pay was text "$3,00.00"
 *  BUG-05  ADMIN|RECUIRTMENT typo + trailing space
 *  BUG-06  Trailing spaces in TRAINING and DESIGNER rule keys
 *  BUG-07  Unrounded daily deductions (666.666, 833.333)
 *  BUG-08  Agent 42 department typo matching Pay Rules typo
 *  BUG-09  Block 1 (Week 1 March) had no block header row
 *  BUG-10  Week 5: all 44 rows had NULL status and NULL period
 *  BUG-11  TOTAL PAID = $0 despite all blocks marked PAID
 *  BUG-12  All block header dates showed month start not week end
 *  BUG-13  Week 5 header had garbage zeros in pay columns
 *  BUG-14  Agent 51 blank rule key
 *  BUG-15  March PP Summary: only Week 1 data, Weeks 2-4 = $0
 *  BUG-16  March & April monthly sheets had different layouts
 *  BUG-17  April bi-weekly totals added wrong agents (row mismatch)
 *  BUG-18  5 duplicate Campaign Summary blocks in April sheet
 * ============================================================
 */

'use strict';

// ─────────────────────────────────────────────────────────────
//  LAYER 1 — CONSTANTS, BRANDING, COLUMN MAPS
// ─────────────────────────────────────────────────────────────

// ── Sheet names ──────────────────────────────────────────────
const SH = {
  DASHBOARD   : 'Dashboard',
  PAY_RULES   : 'Pay Rules',
  AGENTS      : 'Agents',
  ALUMNI      : 'Alumni',
  PAYROLL_RUN : 'Payroll Run',
};

// Monthly sheet name builder:  "April 26 PayRoll"
function monthSheetName_(monthName, year) {
  return `${monthName} ${String(year).slice(-2)} PayRoll`;
}

// ── Brand colors ─────────────────────────────────────────────
const BRAND = {
  // Header / banner
  headerBg      : '#1a1a2e',   // deep navy
  headerFg      : '#FFFFFF',
  // Accent
  accentBg      : '#16213e',
  accentFg      : '#e94560',   // red accent

  // Status — UNPAID
  unpaidBg      : '#FFF9C4',
  unpaidFg      : '#7a4f00',
  // Status — COMPLETE
  completeBg    : '#E3F2FD',
  completeFg    : '#1565C0',
  // Status — PAID
  paidBg        : '#E8F5E9',
  paidFg        : '#2E7D32',
  // Status — PAID (frozen/greyed)
  frozenBg      : '#F5F5F5',
  frozenFg      : '#9E9E9E',

  // Section headers inside sheets
  sectionBg     : '#16213e',
  sectionFg     : '#FFFFFF',
  // Column header rows — JOI amber/gold (matches Payroll Run sheet headers)
  colHeaderBg   : '#F4A623',
  colHeaderFg   : '#1a1a2e',
  // Alternating row
  altRow        : '#F8F9FA',
  // Block divider (week header)
  blockBg       : '#2d2d2d',
  blockFg       : '#FFFFFF',
  // Totals row
  totalsBg      : '#1a1a2e',
  totalsFg      : '#e94560',

  // Border
  borderColor   : '#DADCE0',
};

// ── Pay period constants ──────────────────────────────────────
// PP1 = weeks whose end date falls on or before the 15th of the month
// PP2 = weeks whose end date falls after the 15th
function payPeriodCode_(endDate) {
  const d = (endDate instanceof Date) ? endDate : new Date(endDate);
  const month = d.toLocaleString('en-US', { month: 'long' }).toUpperCase();
  const year  = String(d.getFullYear()).slice(-2);
  const half  = d.getDate() <= 15 ? 'PP1' : 'PP2';
  return `${month}${year}${half}`;   // e.g. "APRIL26PP2"
}

function payPeriodLabel_(code) {
  // New format: "APRIL26PP2" → "April 2026 — Pay Period 2"
  let m = code.match(/^([A-Z]+?)(\d{2})(PP[12])$/);
  if (m) {
    const month = m[1].charAt(0) + m[1].slice(1).toLowerCase();
    const year  = '20' + m[2];
    const pp    = m[3] === 'PP1' ? 'Pay Period 1' : 'Pay Period 2';
    return `${month} ${year} — ${pp}`;
  }
  // Old format: "APRILPP2" → "April — Pay Period 2"
  m = code.match(/^([A-Z]+?)(PP[12])$/);
  if (m) {
    const month = m[1].charAt(0) + m[1].slice(1).toLowerCase();
    const pp    = m[2] === 'PP1' ? 'Pay Period 1' : 'Pay Period 2';
    return `${month} — ${pp}`;
  }
  return code;
}

// ── Payroll Run column indices (1-based) ─────────────────────
const PR_COL = {
  AGENT_ID       : 1,
  AGENT_NAME     : 2,
  RULE_KEY       : 3,
  INCLUDE        : 4,
  MISSED_DAYS    : 5,
  OVERTIME_DAYS  : 6,
  SUNDAYS        : 7,
  VACATION_DAYS  : 8,
  KPI_ACHIEVED   : 9,
  WEEKLY_BASE    : 10,
  KPI_BONUS      : 11,
  MISSED_DED     : 12,
  OVERTIME_PAY   : 13,
  SUNDAY_PAY     : 14,
  VACATION_PAY   : 15,
  EXTRA_BONUS    : 16,
  TOTAL_PAY      : 17,
  PARTIAL_WEEK   : 18,
  STATUS         : 19,   // 🟡 UNPAID / 🔵 COMPLETE / ✅ PAID
  PAY_PERIOD     : 20,   // e.g. APRIL26PP2
  MEMO           : 21,
  LAST_COL       : 21,
};

// ── Pay Rules column indices (1-based) ───────────────────────
const RULE_COL = {
  RULE_KEY       : 1,
  CAMPAIGN       : 2,
  DEPARTMENT     : 3,
  SHIFT          : 4,
  FULL_ATTEND    : 5,
  WEEKLY_BASE    : 6,
  DAILY_SALARY   : 7,
  KPI_BONUS      : 8,
  MISSED_DED     : 9,
  OVERTIME_PAY   : 10,
  SUNDAY_BONUS   : 11,
  VACATION_PCT   : 12,
  LAST_COL       : 12,
};

// ── Agents column indices (1-based) ──────────────────────────
const AG_COL = {
  AGENT_ID       : 1,
  AGENT_NAME     : 2,
  CAMPAIGN       : 3,
  DEPARTMENT     : 4,
  SHIFT          : 5,
  RULE_KEY       : 6,
  EMAIL          : 7,
  START_DATE     : 8,
  NOTES          : 9,
  LAST_COL       : 9,
};

// ── Alumni column indices (1-based) ──────────────────────────
const AL_COL = {
  AGENT_ID       : 1,
  AGENT_NAME     : 2,
  CAMPAIGN       : 3,
  DEPARTMENT     : 4,
  RULE_KEY       : 5,
  EMAIL          : 6,
  END_DATE       : 7,
  BALANCE_OWED   : 8,
  PAYOUT_STATUS  : 9,
  DATE_PAID      : 10,
  LAST_COL       : 10,
};

// ── Monthly sheet column layout (4 weeks side by side) ───────
// Columns per week section: Agent ID, Agent Name, Weekly Pay, Notes — 4 cols each
// Week 1: cols 1-4   Week 2: cols 5-8   Week 3: cols 9-12  Week 4: cols 13-16
// Bi-weekly totals: col 17 (PP1 = W1+W2), col 18 (PP2 = W3+W4), col 19 (Grand Total)
const MO_WEEK_OFFSET = 4; // columns per week section
const MO_COL = {
  weekStart : (weekNum) => (weekNum - 1) * MO_WEEK_OFFSET + 1,  // 1,5,9,13
  ID        : (weekNum) => (weekNum - 1) * MO_WEEK_OFFSET + 1,
  NAME      : (weekNum) => (weekNum - 1) * MO_WEEK_OFFSET + 2,
  PAY       : (weekNum) => (weekNum - 1) * MO_WEEK_OFFSET + 3,
  NOTES     : (weekNum) => (weekNum - 1) * MO_WEEK_OFFSET + 4,
  PP1_TOTAL : 17,
  PP2_TOTAL : 18,
  GRAND     : 19,
  LAST_COL  : 19,
};

// ── Status values ─────────────────────────────────────────────
const STATUS = {
  UNPAID   : '🟡 UNPAID',
  COMPLETE : '🔵 COMPLETE',
  PAID     : '✅ PAID',
};

// ── Helper: normalize a rule key string ──────────────────────
function normalizeRuleKey_(rk) {
  if (!rk) return '';
  return rk
    .toString()
    .toUpperCase()
    .replace(/\s*\|\s*/g, '|')       // spaces around pipes
    .replace(/\bRECUIRTMENT\b/g, 'RECRUITMENT')  // BUG-05 typo
    .replace(/\bRECUITMENT\b/g,  'RECRUITMENT')  // alternate typo
    .replace(/\s+$/, '')             // trailing spaces (BUG-06)
    .replace(/^\s+/, '')             // leading spaces
    .trim();
}

// ── Helper: clean text ────────────────────────────────────────
function cleanText_(v) {
  if (v === null || v === undefined) return '';
  return v.toString().trim();
}

// ── Helper: format currency for display ──────────────────────
function fmt_(n) {
  if (n === null || n === undefined || n === '') return '$0.00';
  const num = parseFloat(n);
  if (isNaN(num)) return '$0.00';
  return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ── Helper: get or create sheet ──────────────────────────────
function getOrCreateSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

// ── Helper: write banner row (merged, styled) ─────────────────
function writeBanner_(sh, text, rowNum, numCols) {
  sh.getRange(rowNum, 1, 1, numCols).merge()
    .setValue(text)
    .setBackground(BRAND.headerBg)
    .setFontColor(BRAND.headerFg)
    .setFontSize(13)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sh.setRowHeight(rowNum, 36);
}

// ── Helper: write column header row ──────────────────────────
function writeColHeaders_(sh, rowNum, headers, bgColor, fgColor) {
  const bg = bgColor || BRAND.colHeaderBg;
  const fg = fgColor || BRAND.colHeaderFg;
  const range = sh.getRange(rowNum, 1, 1, headers.length);
  range.setValues([headers])
    .setBackground(bg)
    .setFontColor(fg)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  sh.setRowHeight(rowNum, 28);
}

// ── Helper: apply status color to a range ────────────────────
function applyStatusColor_(range, status) {
  switch (status) {
    case STATUS.UNPAID:
      range.setBackground(BRAND.unpaidBg).setFontColor(BRAND.unpaidFg).setFontWeight('bold');
      break;
    case STATUS.COMPLETE:
      range.setBackground(BRAND.completeBg).setFontColor(BRAND.completeFg).setFontWeight('bold');
      break;
    case STATUS.PAID:
      range.setBackground(BRAND.paidBg).setFontColor(BRAND.paidFg).setFontWeight('bold');
      break;
    default:
      range.setBackground(null).setFontColor(null).setFontWeight('normal');
  }
}

// ── Helper: get today's pay period code ──────────────────────
function currentPayPeriodCode_() {
  return payPeriodCode_(new Date());
}

// ── Helper: parse a date string or Date object safely ────────
function parseDate_(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ── Helper: format date as MM/DD/YYYY ────────────────────────
function fmtDate_(d) {
  if (!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// ── Helper: get spreadsheet ───────────────────────────────────
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }


// ─────────────────────────────────────────────────────────────
//  LAYER 2 — PAY RULES SHEET
// ─────────────────────────────────────────────────────────────

/**
 * ensurePayRulesSheet
 * Creates or refreshes the Pay Rules sheet structure.
 * Does NOT overwrite existing pay data — only adds headers/formatting.
 * Call this once during install.
 */
function ensurePayRulesSheet() {
  const ss = ss_();
  const sh = getOrCreateSheet_(ss, SH.PAY_RULES);
  sh.clearFormats();

  const numCols = RULE_COL.LAST_COL;

  // Row 1: empty spacer
  sh.setRowHeight(1, 8);

  // Row 2: banner
  writeBanner_(sh, '⚡ PAY RULES & COMPENSATION STRUCTURE', 2, numCols);

  // Row 3: column headers
  writeColHeaders_(sh, 3, [
    'Rule Key', 'Campaign', 'Department', 'Shift',
    'Full Attend Days', 'Weekly Base Pay', 'Daily Salary',
    'KPI Bonus', 'Missed Day Deduction', 'Overtime Day Pay',
    'Sunday Bonus', 'Vacation Premium %',
  ]);

  // Freeze top rows
  sh.setFrozenRows(3);

  // Column widths
  sh.setColumnWidth(RULE_COL.RULE_KEY,    260);
  sh.setColumnWidth(RULE_COL.CAMPAIGN,    130);
  sh.setColumnWidth(RULE_COL.DEPARTMENT,  160);
  sh.setColumnWidth(RULE_COL.SHIFT,        90);
  sh.setColumnWidth(RULE_COL.FULL_ATTEND,  70);
  sh.setColumnWidth(RULE_COL.WEEKLY_BASE, 110);
  sh.setColumnWidth(RULE_COL.DAILY_SALARY, 95);
  sh.setColumnWidth(RULE_COL.KPI_BONUS,   100);
  sh.setColumnWidth(RULE_COL.MISSED_DED,  120);
  sh.setColumnWidth(RULE_COL.OVERTIME_PAY,110);
  sh.setColumnWidth(RULE_COL.SUNDAY_BONUS, 95);
  sh.setColumnWidth(RULE_COL.VACATION_PCT, 95);

  // Format pay columns as currency (rows 4 onward)
  const payRange = sh.getRange(4, RULE_COL.WEEKLY_BASE, 100, 6);
  payRange.setNumberFormat('$#,##0.00');

  SpreadsheetApp.flush();
  Logger.log('Pay Rules sheet structure ready.');
}

/**
 * validatePayRules
 * Scans Pay Rules for common issues: text values in pay columns,
 * trailing spaces in rule keys, known typos.
 * Returns array of issue objects.
 */
function validatePayRules_() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAY_RULES);
  if (!sh) return [];

  const lastRow = sh.getLastRow();
  if (lastRow < 4) return [];

  const data = sh.getRange(4, 1, lastRow - 3, RULE_COL.LAST_COL).getValues();
  const issues = [];

  data.forEach((row, i) => {
    const rowNum = i + 4;
    const rk = cleanText_(row[RULE_COL.RULE_KEY - 1]);
    if (!rk) return; // skip empty rows

    const normalized = normalizeRuleKey_(rk);
    if (normalized !== rk) {
      issues.push({
        row: rowNum,
        field: 'Rule Key',
        value: rk,
        issue: `Should be: "${normalized}"`,
        fix: 'BUG-05/06: typo or trailing space in rule key',
      });
    }

    const base = row[RULE_COL.WEEKLY_BASE - 1];
    if (typeof base === 'string' && base.trim() !== '') {
      issues.push({
        row: rowNum,
        field: 'Weekly Base Pay',
        value: base,
        issue: 'Stored as text, not a number',
        fix: 'BUG-04: convert to numeric value',
      });
    }
  });

  return issues;
}

/**
 * fixPayRulesData
 * Fixes all known data issues in Pay Rules:
 *  - BUG-04: BLB|DOC COLLECTOR text pay → 3000
 *  - BUG-05: ADMIN|RECUIRTMENT typo → RECRUITMENT
 *  - BUG-06: trailing spaces in rule keys
 *  - BUG-07: unrounded daily deductions
 */
function fixPayRulesData() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAY_RULES);
  if (!sh) {
    SpreadsheetApp.getUi().alert('Pay Rules sheet not found.');
    return;
  }

  const lastRow = sh.getLastRow();
  if (lastRow < 4) return;

  const range = sh.getRange(4, 1, lastRow - 3, RULE_COL.LAST_COL);
  const data  = range.getValues();
  let fixCount = 0;

  data.forEach((row, i) => {
    const rk = cleanText_(row[RULE_COL.RULE_KEY - 1]);
    if (!rk) return;

    // BUG-04 + BUG-05 + BUG-06: normalize rule key
    const fixed = normalizeRuleKey_(rk);
    if (fixed !== rk) {
      data[i][RULE_COL.RULE_KEY - 1] = fixed;
      fixCount++;
    }

    // Also fix Department column for consistency (BUG-08 downstream)
    const dept = cleanText_(row[RULE_COL.DEPARTMENT - 1]);
    const deptFixed = dept.replace(/\bRecuirtment\b/gi, 'Recruitment').trimEnd();
    if (deptFixed !== dept) {
      data[i][RULE_COL.DEPARTMENT - 1] = deptFixed;
      fixCount++;
    }

    // BUG-04: text Weekly Base Pay → number
    const base = row[RULE_COL.WEEKLY_BASE - 1];
    if (typeof base === 'string' && base.trim() !== '') {
      const num = parseFloat(base.replace(/[$,]/g, ''));
      if (!isNaN(num)) {
        data[i][RULE_COL.WEEKLY_BASE - 1] = num;
        fixCount++;
      }
    }

    // BUG-07: round daily deduction to 2 decimal places
    const ded = row[RULE_COL.MISSED_DED - 1];
    if (typeof ded === 'number') {
      const rounded = Math.round(ded * 100) / 100;
      if (rounded !== ded) {
        data[i][RULE_COL.MISSED_DED - 1] = rounded;
        fixCount++;
      }
    }

    // BUG-07: round daily salary
    const sal = row[RULE_COL.DAILY_SALARY - 1];
    if (typeof sal === 'number') {
      const rounded = Math.round(sal * 100) / 100;
      if (rounded !== sal) {
        data[i][RULE_COL.DAILY_SALARY - 1] = rounded;
        fixCount++;
      }
    }
  });

  range.setValues(data);
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(
    `✅ Pay Rules fixed\n\n${fixCount} value(s) corrected.\n\nAll rule keys normalized, BLB pay fixed, rounding applied.`
  );
}

/**
 * getRuleMap_
 * Builds a JS Map of { normalizedRuleKey → row object } from Pay Rules.
 * Used by pay calculation functions.
 */
function getRuleMap_() {
  const ss  = ss_();
  const sh  = ss.getSheetByName(SH.PAY_RULES);
  const map = new Map();
  if (!sh) return map;

  const lastRow = sh.getLastRow();
  if (lastRow < 4) return map;

  const data = sh.getRange(4, 1, lastRow - 3, RULE_COL.LAST_COL).getValues();
  data.forEach(row => {
    const rk = normalizeRuleKey_(cleanText_(row[RULE_COL.RULE_KEY - 1]));
    if (!rk) return;
    map.set(rk, {
      ruleKey     : rk,
      campaign    : cleanText_(row[RULE_COL.CAMPAIGN - 1]),
      department  : cleanText_(row[RULE_COL.DEPARTMENT - 1]),
      shift       : cleanText_(row[RULE_COL.SHIFT - 1]),
      fullAttend  : Number(row[RULE_COL.FULL_ATTEND  - 1]) || 5,
      weeklyBase  : Number(row[RULE_COL.WEEKLY_BASE  - 1]) || 0,
      dailySalary : Number(row[RULE_COL.DAILY_SALARY - 1]) || 0,
      kpiBonus    : Number(row[RULE_COL.KPI_BONUS    - 1]) || 0,
      missedDed   : Number(row[RULE_COL.MISSED_DED   - 1]) || 0,
      overtimePay : Number(row[RULE_COL.OVERTIME_PAY - 1]) || 0,
      sundayBonus : Number(row[RULE_COL.SUNDAY_BONUS - 1]) || 0,
      vacationPct : Number(row[RULE_COL.VACATION_PCT - 1]) || 0,
    });
  });
  return map;
}


// ─────────────────────────────────────────────────────────────
//  LAYER 3 — AGENTS + ALUMNI SHEETS
// ─────────────────────────────────────────────────────────────

/**
 * ensureAgentsSheet
 * Creates or refreshes the Agents directory structure.
 */
function ensureAgentsSheet() {
  const ss = ss_();
  const sh = getOrCreateSheet_(ss, SH.AGENTS);
  sh.clearFormats();

  writeBanner_(sh, '👥 AGENTS DIRECTORY', 2, AG_COL.LAST_COL);
  writeColHeaders_(sh, 3, [
    'Agent ID', 'Agent Name', 'Campaign', 'Department',
    'Shift', 'Rule Key', 'Email', 'Start Date', 'Notes',
  ]);

  sh.setFrozenRows(3);

  sh.setColumnWidth(AG_COL.AGENT_ID,   70);
  sh.setColumnWidth(AG_COL.AGENT_NAME, 180);
  sh.setColumnWidth(AG_COL.CAMPAIGN,   130);
  sh.setColumnWidth(AG_COL.DEPARTMENT, 160);
  sh.setColumnWidth(AG_COL.SHIFT,       90);
  sh.setColumnWidth(AG_COL.RULE_KEY,   250);
  sh.setColumnWidth(AG_COL.EMAIL,      180);
  sh.setColumnWidth(AG_COL.START_DATE,  90);
  sh.setColumnWidth(AG_COL.NOTES,      200);

  sh.getRange(4, AG_COL.AGENT_ID,   200, 1).setNumberFormat('0');          // plain integer — prevents $3.00 display
  sh.getRange(4, AG_COL.START_DATE, 200, 1).setNumberFormat('MM/DD/YYYY');

  SpreadsheetApp.flush();
  Logger.log('Agents sheet structure ready.');
}

/**
 * ensureAlumniSheet
 * Creates or refreshes the Alumni tracker structure.
 */
function ensureAlumniSheet() {
  const ss = ss_();
  const sh = getOrCreateSheet_(ss, SH.ALUMNI);
  sh.clearFormats();

  writeBanner_(sh, '🎓 ALUMNI — FINAL PAYOUTS TRACKER', 2, AL_COL.LAST_COL);
  writeColHeaders_(sh, 3, [
    'Agent ID', 'Agent Name', 'Campaign', 'Department',
    'Rule Key', 'Email', 'End Date', 'Balance Owed',
    'Payout Status', 'Date Paid Out',
  ]);

  sh.setFrozenRows(3);

  sh.setColumnWidth(AL_COL.AGENT_ID,       70);
  sh.setColumnWidth(AL_COL.AGENT_NAME,    180);
  sh.setColumnWidth(AL_COL.CAMPAIGN,      130);
  sh.setColumnWidth(AL_COL.DEPARTMENT,    160);
  sh.setColumnWidth(AL_COL.RULE_KEY,      250);
  sh.setColumnWidth(AL_COL.EMAIL,         180);
  sh.setColumnWidth(AL_COL.END_DATE,       90);
  sh.setColumnWidth(AL_COL.BALANCE_OWED,  110);
  sh.setColumnWidth(AL_COL.PAYOUT_STATUS, 110);
  sh.setColumnWidth(AL_COL.DATE_PAID,     100);

  sh.getRange(4, AL_COL.END_DATE,   100, 1).setNumberFormat('MM/DD/YYYY');
  sh.getRange(4, AL_COL.DATE_PAID,  100, 1).setNumberFormat('MM/DD/YYYY');
  sh.getRange(4, AL_COL.BALANCE_OWED,100,1).setNumberFormat('$#,##0.00');

  SpreadsheetApp.flush();
  Logger.log('Alumni sheet structure ready.');
}

/**
 * getAgentMap_
 * Returns Map of { agentId → { name, ruleKey, campaign, department, shift } }
 * Used by Payroll Run and monthly sheet functions.
 * Reads from Agents sheet; inactive agents (alumni) are NOT included.
 */
function getAgentMap_() {
  const ss  = ss_();
  const sh  = ss.getSheetByName(SH.AGENTS);
  const map = new Map();
  if (!sh) return map;

  const lastRow = sh.getLastRow();
  if (lastRow < 4) return map;

  const data = sh.getRange(4, 1, lastRow - 3, AG_COL.LAST_COL).getValues();
  data.forEach(row => {
    const id = row[AG_COL.AGENT_ID - 1];
    if (!id) return;
    const rk = normalizeRuleKey_(cleanText_(row[AG_COL.RULE_KEY - 1]));
    map.set(Number(id), {
      agentId    : Number(id),
      name       : cleanText_(row[AG_COL.AGENT_NAME - 1]),
      campaign   : cleanText_(row[AG_COL.CAMPAIGN   - 1]),
      department : cleanText_(row[AG_COL.DEPARTMENT - 1]),
      shift      : cleanText_(row[AG_COL.SHIFT      - 1]),
      ruleKey    : rk,
      email      : cleanText_(row[AG_COL.EMAIL      - 1]),
    });
  });
  return map;
}

/**
 * getAlumniRuleKeyMap_
 * Returns Map of { agentId → ruleKey } from the Alumni sheet.
 * Used as fallback when a Payroll Run row has a blank rule key (BUG-14).
 */
function getAlumniRuleKeyMap_() {
  const ss  = ss_();
  const sh  = ss.getSheetByName(SH.ALUMNI);
  const map = new Map();
  if (!sh) return map;

  const lastRow = sh.getLastRow();
  if (lastRow < 4) return map;

  const data = sh.getRange(4, 1, lastRow - 3, AL_COL.LAST_COL).getValues();
  data.forEach(row => {
    const id = row[AL_COL.AGENT_ID - 1];
    const rk = normalizeRuleKey_(cleanText_(row[AL_COL.RULE_KEY - 1]));
    if (id && rk) map.set(Number(id), rk);
  });
  return map;
}


// ─────────────────────────────────────────────────────────────
//  LAYER 4 — PAYROLL RUN SHEET
// ─────────────────────────────────────────────────────────────

/**
 * ensurePayrollRunSheet
 * Creates or refreshes the Payroll Run sheet structure.
 * Writes the top banner and column headers.
 * Does NOT touch existing week blocks.
 */
function ensurePayrollRunSheet() {
  const ss = ss_();
  const sh = getOrCreateSheet_(ss, SH.PAYROLL_RUN);

  // Row 1: spacer
  sh.setRowHeight(1, 8);

  // Row 2: main banner
  writeBanner_(sh, '📋 PAYROLL RUN — WEEKLY DATA', 2, PR_COL.LAST_COL);

  // Row 3: column headers
  writeColHeaders_(sh, 3, [
    'Agent ID', 'Agent Name', 'Rule Key', 'Include', 'Missed Days',
    'OT Days', 'Sundays', 'Vacation Days', 'KPI ✓',
    'Weekly Base Pay', 'KPI Bonus', 'Missed Deduction',
    'Overtime Pay', 'Sunday Pay', 'Vacation Pay', 'Extra Bonus',
    'Total Pay', 'Partial Week', 'Status', 'Pay Period', 'Memo',
  ]);

  sh.setFrozenRows(3);

  // Column widths
  sh.setColumnWidth(PR_COL.AGENT_ID,    70);
  sh.setColumnWidth(PR_COL.AGENT_NAME, 170);
  sh.setColumnWidth(PR_COL.RULE_KEY,   230);
  sh.setColumnWidth(PR_COL.INCLUDE,     65);
  sh.setColumnWidth(PR_COL.MISSED_DAYS, 75);
  sh.setColumnWidth(PR_COL.OVERTIME_DAYS,65);
  sh.setColumnWidth(PR_COL.SUNDAYS,     70);
  sh.setColumnWidth(PR_COL.VACATION_DAYS,75);
  sh.setColumnWidth(PR_COL.KPI_ACHIEVED, 55);
  sh.setColumnWidth(PR_COL.WEEKLY_BASE, 110);
  sh.setColumnWidth(PR_COL.KPI_BONUS,   100);
  sh.setColumnWidth(PR_COL.MISSED_DED,  115);
  sh.setColumnWidth(PR_COL.OVERTIME_PAY,105);
  sh.setColumnWidth(PR_COL.SUNDAY_PAY,   95);
  sh.setColumnWidth(PR_COL.VACATION_PAY, 95);
  sh.setColumnWidth(PR_COL.EXTRA_BONUS,  90);
  sh.setColumnWidth(PR_COL.TOTAL_PAY,   110);
  sh.setColumnWidth(PR_COL.PARTIAL_WEEK, 80);
  sh.setColumnWidth(PR_COL.STATUS,      105);
  sh.setColumnWidth(PR_COL.PAY_PERIOD,  120);
  sh.setColumnWidth(PR_COL.MEMO,        200);

  SpreadsheetApp.flush();
  Logger.log('Payroll Run sheet structure ready.');
}

/**
 * writeBlockHeader_
 * Writes a week block header row to Payroll Run.
 * Header contains: weekLabel, dateRange, status, payPeriodCode
 * This is the fix for BUG-09 (missing Block 1 header) and BUG-12 (wrong dates).
 *
 * @param {Sheet}  sh          - Payroll Run sheet
 * @param {number} row         - Row number to write to
 * @param {string} weekLabel   - e.g. "WEEK 1"
 * @param {Date}   startDate   - Monday of the week
 * @param {Date}   endDate     - Sunday of the week (actual end date, not month start)
 * @param {string} status      - STATUS.UNPAID / COMPLETE / PAID
 * @param {string} ppCode      - e.g. "APRIL26PP2"
 */
function writeBlockHeader_(sh, row, weekLabel, startDate, endDate, status, ppCode) {
  const dateRange = `${fmtDate_(startDate)} – ${fmtDate_(endDate)}`;
  const rowVals   = new Array(PR_COL.LAST_COL).fill('');
  rowVals[PR_COL.AGENT_ID   - 1] = weekLabel;
  rowVals[PR_COL.AGENT_NAME - 1] = dateRange;
  rowVals[PR_COL.STATUS     - 1] = status;
  rowVals[PR_COL.PAY_PERIOD - 1] = ppCode;

  sh.getRange(row, 1, 1, PR_COL.LAST_COL).setValues([rowVals]);

  // Style: dark block header
  sh.getRange(row, 1, 1, PR_COL.LAST_COL)
    .setBackground(BRAND.blockBg)
    .setFontColor(BRAND.blockFg)
    .setFontWeight('bold')
    .setFontSize(10);

  // Status cell colored
  applyStatusColor_(sh.getRange(row, PR_COL.STATUS), status);
  sh.setRowHeight(row, 26);
}

/**
 * calcAgentPay_
 * Calculates weekly pay for one agent given their input row and rule.
 * Returns an object with all pay components and total.
 * This is the core math engine.
 *
 * @param {object} rule     - from getRuleMap_()
 * @param {object} inputs   - { missedDays, overtimeDays, sundays, vacationDays, kpiAchieved, extraBonus, partialWeek }
 * @returns {object}        - all pay components + totalPay
 */
function calcAgentPay_(rule, inputs) {
  if (!rule) {
    return {
      weeklyBase: 0, kpiBonus: 0, missedDed: 0,
      overtimePay: 0, sundayPay: 0, vacationPay: 0,
      extraBonus: inputs.extraBonus || 0, totalPay: 0,
    };
  }

  const missed   = Number(inputs.missedDays   || 0);
  const overtime = Number(inputs.overtimeDays || 0);
  const sundays  = Number(inputs.sundays      || 0);
  const vacation = Number(inputs.vacationDays || 0);
  const kpi      = (cleanText_(inputs.kpiAchieved).toUpperCase() === 'YES');
  const extra    = Number(inputs.extraBonus   || 0);
  const partial  = Number(inputs.partialWeek  || 0); // 0 = full week

  // Base pay: deduct missed days
  const weeklyBase  = rule.weeklyBase;
  const missedDed   = Math.round(missed   * rule.missedDed   * 100) / 100;
  const overtimePay = Math.round(overtime * rule.overtimePay * 100) / 100;
  const sundayPay   = Math.round(sundays  * rule.sundayBonus * 100) / 100;
  const kpiBonus    = kpi ? rule.kpiBonus : 0;

  // Vacation pay: premium % of daily salary × vacation days
  const vacationPay = Math.round(vacation * rule.dailySalary * (1 + rule.vacationPct) * 100) / 100;

  // Partial week override
  let totalPay;
  if (partial > 0) {
    // Partial week: pay only for days worked
    totalPay = Math.round((partial * rule.dailySalary + overtimePay + sundayPay + extra) * 100) / 100;
  } else {
    totalPay = Math.round(
      (weeklyBase - missedDed + kpiBonus + overtimePay + sundayPay + vacationPay + extra) * 100
    ) / 100;
  }

  return { weeklyBase, kpiBonus, missedDed, overtimePay, sundayPay, vacationPay, extraBonus: extra, totalPay };
}

/**
 * writeAgentPayRow_
 * Writes one agent's pay data to a specific row in Payroll Run.
 * Writes all pay values, status, and pay period.
 * This is the fix for BUG-10 (per-row status was NULL).
 *
 * @param {Sheet}  sh       - Payroll Run sheet
 * @param {number} rowNum   - Row to write
 * @param {object} agent    - { agentId, name, ruleKey }
 * @param {object} pay      - from calcAgentPay_()
 * @param {object} inputs   - raw inputs
 * @param {string} status   - STATUS constant
 * @param {string} ppCode   - pay period code
 * @param {string} memo     - optional memo
 */
function writeAgentPayRow_(sh, rowNum, agent, pay, inputs, status, ppCode, memo) {
  const row = new Array(PR_COL.LAST_COL).fill('');
  row[PR_COL.AGENT_ID      - 1] = agent.agentId;
  row[PR_COL.AGENT_NAME    - 1] = agent.name;
  row[PR_COL.RULE_KEY      - 1] = agent.ruleKey;
  row[PR_COL.INCLUDE       - 1] = inputs.include || 'YES';
  row[PR_COL.MISSED_DAYS   - 1] = inputs.missedDays    || 0;
  row[PR_COL.OVERTIME_DAYS - 1] = inputs.overtimeDays  || 0;
  row[PR_COL.SUNDAYS       - 1] = inputs.sundays        || 0;
  row[PR_COL.VACATION_DAYS - 1] = inputs.vacationDays  || 0;
  row[PR_COL.KPI_ACHIEVED  - 1] = inputs.kpiAchieved   || 'NO';
  row[PR_COL.WEEKLY_BASE   - 1] = pay.weeklyBase;
  row[PR_COL.KPI_BONUS     - 1] = pay.kpiBonus;
  row[PR_COL.MISSED_DED    - 1] = pay.missedDed;
  row[PR_COL.OVERTIME_PAY  - 1] = pay.overtimePay;
  row[PR_COL.SUNDAY_PAY    - 1] = pay.sundayPay;
  row[PR_COL.VACATION_PAY  - 1] = pay.vacationPay;
  row[PR_COL.EXTRA_BONUS   - 1] = pay.extraBonus;
  row[PR_COL.TOTAL_PAY     - 1] = pay.totalPay;
  row[PR_COL.PARTIAL_WEEK  - 1] = inputs.partialWeek || '';
  row[PR_COL.STATUS        - 1] = status;
  row[PR_COL.PAY_PERIOD    - 1] = ppCode;
  row[PR_COL.MEMO          - 1] = memo || '';

  sh.getRange(rowNum, 1, 1, PR_COL.LAST_COL).setValues([row]);

  // Number formatting for pay columns
  sh.getRange(rowNum, PR_COL.WEEKLY_BASE, 1, 8).setNumberFormat('$#,##0.00');

  // Status color (per-row — fixes BUG-10)
  applyStatusColor_(sh.getRange(rowNum, PR_COL.STATUS), status);

  sh.setRowHeight(rowNum, 22);
}

/**
 * refreshPayrollRunTotals_
 * Rebuilds the TOTAL PAID / TOTAL UNPAID rows at the bottom of Payroll Run.
 * Reads per-row STATUS column to accurately sum each bucket.
 * This is the fix for BUG-11.
 */
function refreshPayrollRunTotals_() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) return;

  const lastRow = sh.getLastRow();

  // Find the last data row (before any existing totals rows)
  // Totals rows have text in col 1 (AGENT_ID) that includes "TOTAL"
  let lastDataRow = 3;
  for (let r = 4; r <= lastRow; r++) {
    const v = cleanText_(sh.getRange(r, PR_COL.AGENT_ID).getValue());
    if (v.toUpperCase().includes('TOTAL')) {
      // Remove existing totals rows first
      sh.getRange(r, 1, lastRow - r + 1, PR_COL.LAST_COL).clearContent().clearFormat();
      break;
    }
    if (v !== '') lastDataRow = r;
  }

  // Sum TOTAL_PAY column by status
  let totalPaid   = 0;
  let totalUnpaid = 0;
  let totalComplete = 0;

  const data = sh.getRange(4, 1, lastDataRow - 3, PR_COL.LAST_COL).getValues();
  data.forEach(row => {
    const status = cleanText_(row[PR_COL.STATUS - 1]);
    const pay    = Number(row[PR_COL.TOTAL_PAY - 1]) || 0;
    const id     = row[PR_COL.AGENT_ID - 1];

    // Skip block header rows (col 1 contains text like "WEEK 1", not a number)
    if (typeof id !== 'number' && isNaN(parseFloat(id))) return;

    if (status === STATUS.PAID)     totalPaid     += pay;
    else if (status === STATUS.COMPLETE) totalComplete += pay;
    else                                 totalUnpaid   += pay;
  });

  const totalsRow = lastDataRow + 2;

  // Write totals
  const rows = [
    [STATUS.UNPAID,   `${STATUS.UNPAID} TOTAL`,   totalUnpaid   + totalComplete],
    [STATUS.PAID,     `${STATUS.PAID} TOTAL`,      totalPaid],
    ['ALL',           '💼 ALL PERIODS TOTAL',       totalPaid + totalComplete + totalUnpaid],
  ];

  rows.forEach(([status, label, amount], i) => {
    const r = totalsRow + i;
    sh.getRange(r, 1, 1, PR_COL.LAST_COL).setBackground(BRAND.totalsBg).setFontColor(BRAND.totalsFg);
    sh.getRange(r, PR_COL.AGENT_ID)  .setValue(label) .setFontWeight('bold');
    sh.getRange(r, PR_COL.TOTAL_PAY) .setValue(amount).setNumberFormat('$#,##0.00').setFontWeight('bold');
    sh.setRowHeight(r, 26);
  });

  SpreadsheetApp.flush();
}

/**
 * getPayrollRunBlocks_
 * Scans Payroll Run and returns an array of all week blocks.
 * Each block: { weekLabel, startDate, endDate, ppCode, status, headerRow, firstDataRow, lastDataRow }
 *
 * A block header row is identified by: col 1 contains "WEEK" (string, not a number)
 */
function getPayrollRunBlocks_() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) return [];

  const lastRow = sh.getLastRow();
  if (lastRow < 4) return [];

  const col1 = sh.getRange(4, 1, lastRow - 3, 1).getValues().flat();
  const blocks = [];

  col1.forEach((val, i) => {
    const rowNum = i + 4;
    const text   = cleanText_(val).toUpperCase();
    if (text.startsWith('WEEK') && isNaN(parseFloat(val))) {
      blocks.push({
        headerRow    : rowNum,
        weekLabel    : cleanText_(val),
        dateRange    : cleanText_(sh.getRange(rowNum, PR_COL.AGENT_NAME).getValue()),
        status       : cleanText_(sh.getRange(rowNum, PR_COL.STATUS).getValue()),
        ppCode       : cleanText_(sh.getRange(rowNum, PR_COL.PAY_PERIOD).getValue()),
        firstDataRow : rowNum + 1,
        lastDataRow  : null, // filled in below
      });
    }
  });

  // Fill lastDataRow for each block
  blocks.forEach((block, idx) => {
    const nextHeaderRow = idx + 1 < blocks.length
      ? blocks[idx + 1].headerRow
      : lastRow + 1;
    let last = block.firstDataRow - 1;
    for (let r = block.firstDataRow; r < nextHeaderRow; r++) {
      const v = cleanText_(sh.getRange(r, PR_COL.AGENT_ID).getValue());
      const text = v.toUpperCase();
      if (text.includes('TOTAL')) break;
      if (v !== '') last = r;
    }
    block.lastDataRow = last;
  });

  return blocks;
}


// ─────────────────────────────────────────────────────────────
//  LAYER 5 — MONTHLY SHEETS
// ─────────────────────────────────────────────────────────────

/**
 * ensureMonthlySheet
 * Creates or refreshes a monthly pay sheet.
 * Layout: 4 weeks side by side (cols 1-16), then PP1/PP2/Grand Total cols (17-19).
 * Pay Period Summary table below.
 * Fixes BUG-15, BUG-16, BUG-17, BUG-18.
 *
 * @param {string} monthName  - e.g. "April"
 * @param {number} year       - e.g. 2026
 */
function ensureMonthlySheet(monthName, year) {
  const ss = ss_();
  const name = monthSheetName_(monthName, year);
  const sh   = getOrCreateSheet_(ss, name);
  sh.clear();

  const numCols = MO_COL.LAST_COL;

  // Row 1: spacer
  sh.setRowHeight(1, 8);

  // Row 2: banner
  writeBanner_(sh, `📅 ${monthName.toUpperCase()} ${year} — MONTHLY PAY SHEET`, 2, numCols);

  // Row 3: week labels (merged spans)
  const weekLabels = ['WEEK 1', 'WEEK 2', 'WEEK 3', 'WEEK 4', 'PP1 TOTAL', 'PP2 TOTAL', 'GRAND TOTAL'];
  const weekCols   = [1, 5, 9, 13, 17, 18, 19];
  const weekSpans  = [4, 4, 4, 4, 1, 1, 1];

  weekLabels.forEach((lbl, i) => {
    const col  = weekCols[i];
    const span = weekSpans[i];
    const range = span > 1
      ? sh.getRange(3, col, 1, span).merge()
      : sh.getRange(3, col);
    range.setValue(lbl)
      .setBackground(BRAND.accentBg)
      .setFontColor(BRAND.headerFg)
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
  });
  sh.setRowHeight(3, 26);

  // Row 4: column headers for each week + totals
  const colHeaders = [];
  for (let w = 1; w <= 4; w++) {
    colHeaders.push('ID', 'Agent Name', 'Weekly Pay', 'Notes');
  }
  colHeaders.push('PP1 Total', 'PP2 Total', 'Grand Total');

  writeColHeaders_(sh, 4, colHeaders);
  sh.setFrozenRows(4);

  // Column widths
  for (let w = 1; w <= 4; w++) {
    const base = MO_COL.weekStart(w);
    sh.setColumnWidth(base,     55);   // ID
    sh.setColumnWidth(base + 1, 150);  // Name
    sh.setColumnWidth(base + 2, 95);   // Pay
    sh.setColumnWidth(base + 3, 130);  // Notes
  }
  sh.setColumnWidth(MO_COL.PP1_TOTAL, 95);
  sh.setColumnWidth(MO_COL.PP2_TOTAL, 95);
  sh.setColumnWidth(MO_COL.GRAND,     105);

  SpreadsheetApp.flush();
  Logger.log(`Monthly sheet "${name}" structure ready.`);
  return sh;
}

/**
 * syncMonthlySheetFromPayrollRun
 * Reads all week blocks from Payroll Run for a given month/year,
 * writes agent data into the monthly sheet (4-week layout),
 * then builds the Pay Period Summary section.
 *
 * Key fix: uses AGENT ID to match rows across week columns (BUG-17).
 * Clears and rebuilds the sheet — no duplicate summary blocks (BUG-18).
 *
 * @param {string} monthName
 * @param {number} year
 */
function syncMonthlySheetFromPayrollRun(monthName, year) {
  const ss   = ss_();
  const sh   = ensureMonthlySheet(monthName, year);
  const shPR = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!shPR) {
    SpreadsheetApp.getUi().alert('Payroll Run sheet not found.');
    return;
  }

  const allBlocks = getPayrollRunBlocks_();
  // Filter to only blocks belonging to this month
  // A block belongs to this month if ppCode contains the month name
  const monthUpper = monthName.toUpperCase().slice(0, 3); // "APR", "MAR", etc.
  const fullUpper  = monthName.toUpperCase();             // "APRIL", "MARCH", etc.

  const monthBlocks = allBlocks.filter(b => {
    const pp = b.ppCode.toUpperCase();
    return pp.startsWith(fullUpper) || pp.startsWith(monthUpper);
  });

  if (monthBlocks.length === 0) {
    SpreadsheetApp.getUi().alert(`No payroll blocks found for ${monthName} ${year}.`);
    return;
  }

  // Get all agent IDs across all blocks (union)
  const agentIds = new Set();
  const weekData = {}; // { weekNum: { agentId: { name, pay, notes, status, ppCode } } }

  monthBlocks.slice(0, 4).forEach((block, wi) => {
    const weekNum = wi + 1;
    weekData[weekNum] = {};
    if (!block.firstDataRow || !block.lastDataRow) return;

    const numRows = block.lastDataRow - block.firstDataRow + 1;
    if (numRows < 1) return;

    const data = shPR.getRange(block.firstDataRow, 1, numRows, PR_COL.LAST_COL).getValues();
    data.forEach(row => {
      const id   = row[PR_COL.AGENT_ID   - 1];
      const name = cleanText_(row[PR_COL.AGENT_NAME  - 1]);
      const pay  = Number(row[PR_COL.TOTAL_PAY   - 1]) || 0;
      const note = cleanText_(row[PR_COL.MEMO        - 1]);
      if (!id || typeof id !== 'number') return;
      agentIds.add(id);
      weekData[weekNum][id] = { name, pay, notes: note };
    });
  });

  // Sort agent IDs numerically
  const sortedIds = Array.from(agentIds).sort((a, b) => a - b);
  const firstDataRow = 5; // after 4 header rows

  // Write agent rows
  sortedIds.forEach((id, i) => {
    const rowNum = firstDataRow + i;
    const rowData = new Array(MO_COL.LAST_COL).fill('');

    let pp1Total = 0;
    let pp2Total = 0;
    let agentName = '';

    for (let w = 1; w <= 4; w++) {
      const wd = (weekData[w] || {})[id];
      const nameCol = MO_COL.NAME(w);
      const payCol  = MO_COL.PAY(w);
      const idCol   = MO_COL.ID(w);
      const noteCol = MO_COL.NOTES(w);

      if (wd) {
        rowData[idCol   - 1] = id;
        rowData[nameCol - 1] = wd.name;
        rowData[payCol  - 1] = wd.pay;
        rowData[noteCol - 1] = wd.notes || '';
        if (!agentName) agentName = wd.name;
        if (w <= 2) pp1Total += wd.pay;
        else        pp2Total += wd.pay;
      } else {
        rowData[idCol   - 1] = id;
        rowData[nameCol - 1] = agentName || '';
        rowData[payCol  - 1] = 0;
      }
    }

    rowData[MO_COL.PP1_TOTAL - 1] = pp1Total;
    rowData[MO_COL.PP2_TOTAL - 1] = pp2Total;
    rowData[MO_COL.GRAND     - 1] = pp1Total + pp2Total;

    sh.getRange(rowNum, 1, 1, MO_COL.LAST_COL).setValues([rowData]);

    // Format pay columns
    for (let w = 1; w <= 4; w++) {
      sh.getRange(rowNum, MO_COL.PAY(w)).setNumberFormat('$#,##0.00');
    }
    sh.getRange(rowNum, MO_COL.PP1_TOTAL, 1, 3).setNumberFormat('$#,##0.00');

    // Alternating row color
    if (i % 2 === 1) {
      sh.getRange(rowNum, 1, 1, MO_COL.LAST_COL).setBackground(BRAND.altRow);
    }
    sh.setRowHeight(rowNum, 22);
  });

  const lastAgentRow = firstDataRow + sortedIds.length - 1;

  // ── Write Pay Period Summary ──────────────────────────────
  const summaryStartRow = lastAgentRow + 3;
  buildMonthlySummary_(sh, summaryStartRow, monthBlocks, weekData, sortedIds, monthName, year);

  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(`✅ ${monthName} ${year} monthly sheet synced successfully.`);
}

/**
 * buildMonthlySummary_
 * Builds the Pay Period Summary section at the bottom of a monthly sheet.
 * Exactly ONE summary block — no duplicates (BUG-18 fix).
 * Agent totals use agent ID matching, not row position (BUG-17 fix).
 */
function buildMonthlySummary_(sh, startRow, monthBlocks, weekData, sortedIds, monthName, year) {
  let r = startRow;
  const numCols = MO_COL.LAST_COL;

  // Section banner
  sh.getRange(r, 1, 1, numCols).merge()
    .setValue(`📊 PAY PERIOD SUMMARY — ${monthName.toUpperCase()} ${year} PAYROLL`)
    .setBackground(BRAND.sectionBg)
    .setFontColor(BRAND.sectionFg)
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('center');
  sh.setRowHeight(r, 32);
  r++;

  // PP status labels
  const pp1Status = (monthBlocks[0] && monthBlocks[0].status) || STATUS.UNPAID;
  const pp2Status = (monthBlocks[2] && monthBlocks[2].status) || STATUS.UNPAID;

  sh.getRange(r, 1, 1, 5).merge().setValue(`PAY PERIOD 1  ${pp1Status}`)
    .setBackground(BRAND.colHeaderBg).setFontColor(BRAND.colHeaderFg).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(r, 6, 1, 5).merge().setValue(`PAY PERIOD 2  ${pp2Status}`)
    .setBackground(BRAND.colHeaderBg).setFontColor(BRAND.colHeaderFg).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(r, 11, 1, 3).merge().setValue('TOTALS')
    .setBackground(BRAND.headerBg).setFontColor(BRAND.headerFg).setFontWeight('bold').setHorizontalAlignment('center');
  r++;

  // Summary column headers
  const sumHeaders = ['ID', 'Agent Name', 'Week 1', 'Week 2', 'PP1 Total',
                      'ID', 'Agent Name', 'Week 3', 'Week 4', 'PP2 Total',
                      'Grand Total', 'Status'];
  writeColHeaders_(sh, r, sumHeaders);
  const headerRow = r;
  r++;

  // Agent rows — by ID match (BUG-17 fix)
  let grandTotal = 0;
  sortedIds.forEach((id, i) => {
    const w1  = ((weekData[1] || {})[id] || {}).pay || 0;
    const w2  = ((weekData[2] || {})[id] || {}).pay || 0;
    const w3  = ((weekData[3] || {})[id] || {}).pay || 0;
    const w4  = ((weekData[4] || {})[id] || {}).pay || 0;
    const pp1 = w1 + w2;
    const pp2 = w3 + w4;
    const gt  = pp1 + pp2;
    grandTotal += gt;

    // Find name from any available week
    const name = (((weekData[1] || {})[id] || (weekData[2] || {})[id] ||
                   (weekData[3] || {})[id] || (weekData[4] || {})[id]) || {}).name || '';

    sh.getRange(r, 1,  1, 12).setValues([[id, name, w1, w2, pp1, id, name, w3, w4, pp2, gt, '']]);
    sh.getRange(r, 3,  1, 3).setNumberFormat('$#,##0.00');
    sh.getRange(r, 8,  1, 3).setNumberFormat('$#,##0.00');
    sh.getRange(r, 11, 1, 1).setNumberFormat('$#,##0.00');

    if (i % 2 === 1) sh.getRange(r, 1, 1, 12).setBackground(BRAND.altRow);
    sh.setRowHeight(r, 22);
    r++;
  });

  // Grand Total row (BUG-01 fix: one source of truth for the total)
  sh.getRange(r, 1, 1, numCols)
    .setBackground(BRAND.totalsBg)
    .setFontColor(BRAND.totalsFg)
    .setFontWeight('bold');
  sh.getRange(r, 1).setValue('GRAND TOTAL (payable)');
  sh.getRange(r, 11).setValue(grandTotal).setNumberFormat('$#,##0.00').setFontWeight('bold');
  sh.setRowHeight(r, 28);
}


// ─────────────────────────────────────────────────────────────
//  LAYER 6 — DASHBOARD
// ─────────────────────────────────────────────────────────────

/**
 * ensureDashboardSheet
 * Creates or refreshes the Dashboard sheet structure.
 */
function ensureDashboardSheet() {
  const ss = ss_();
  const sh = getOrCreateSheet_(ss, SH.DASHBOARD);
  sh.clear();

  writeBanner_(sh, '🏠 JOI PAYROLL DASHBOARD', 2, 8);
  sh.setFrozenRows(2);

  sh.setColumnWidth(1, 70);
  sh.setColumnWidth(2, 180);
  sh.setColumnWidth(3, 130);
  sh.setColumnWidth(4, 110);
  sh.setColumnWidth(5, 110);
  sh.setColumnWidth(6, 110);
  sh.setColumnWidth(7, 110);
  sh.setColumnWidth(8, 110);

  SpreadsheetApp.flush();
}

/**
 * refreshDashboard
 * Rebuilds the Dashboard from live data in Payroll Run and Agents.
 * Shows: current pay period, all agents with latest week status + pay.
 * Fixes BUG-01, BUG-02, BUG-03.
 */
function refreshDashboard() {
  const ss = ss_();
  const sh = getOrCreateSheet_(ss, SH.DASHBOARD);
  sh.clear();
  sh.setRowHeight(1, 8);

  // ── Current pay period ───────────────────────────────────
  const today     = new Date();
  const ppCode    = payPeriodCode_(today);
  const ppLabel   = payPeriodLabel_(ppCode);

  // Banner row — full width dark background
  sh.getRange(2, 1, 1, 8).merge()
    .setValue(`  🏠  JOI PAYROLL DASHBOARD  |  ${ppLabel}`)
    .setBackground(BRAND.headerBg)
    .setFontColor(BRAND.headerFg)
    .setFontSize(13)
    .setFontWeight('bold')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');
  sh.setRowHeight(2, 48);

  // Insert JOI logo image from Drive (floats over the right side of banner)
  try {
    const logoBlob = DriveApp.getFileById('1dIXepAvWEForzsR4PZ5KF7S9gZg6PRlu').getBlob();
    // Remove any previous logo images (avoid duplicates on refresh)
    sh.getImages().forEach(img => {
      if (img.getAnchorCell().getRow() === 2) img.remove();
    });
    sh.insertImage(logoBlob, 8, 2, -68, 4); // anchor col H, row 2, offset left so it sits at right edge
  } catch(e) {
    // Fallback: amber "JOI" text on right if image unavailable
    sh.getRange(2, 7, 1, 2).merge()
      .setValue('JOI')
      .setBackground(BRAND.headerBg)
      .setFontColor('#F4A623')
      .setFontSize(22).setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    Logger.log('Logo insert failed: ' + e.message);
  }

  // ── Get latest week block from Payroll Run ─────────────────
  const blocks = getPayrollRunBlocks_();
  const latestBlock = blocks.length > 0 ? blocks[blocks.length - 1] : null;

  // ── Column headers ────────────────────────────────────────
  writeColHeaders_(sh, 3, [
    'Agent ID', 'Agent Name', 'Campaign', 'Rule Key',
    'Latest Week Pay', 'Current Status', 'Pay Period', 'YTD (est.)',
  ]);
  sh.setFrozenRows(3);

  // ── Agent data ────────────────────────────────────────────
  const agentMap = getAgentMap_();
  if (!latestBlock) {
    sh.getRange(4, 1).setValue('No payroll data found yet. Add a week to get started.');
    return;
  }

  const shPR = ss.getSheetByName(SH.PAYROLL_RUN);
  const numRows = latestBlock.lastDataRow - latestBlock.firstDataRow + 1;
  if (numRows < 1) return;

  const prData = shPR.getRange(
    latestBlock.firstDataRow, 1, numRows, PR_COL.LAST_COL
  ).getValues();

  // Build a map of latest week data by agent ID
  // Guard: only accept rows where ID is a positive integer (1–9999)
  // This prevents TOTAL rows, block header rows, and numeric-label rows from leaking in
  const latestPayMap = new Map();
  prData.forEach(row => {
    const raw    = row[PR_COL.AGENT_ID  - 1];
    const id     = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!Number.isFinite(id) || id <= 0 || Math.floor(id) !== id || id > 9999) return;
    const pay    = Number(row[PR_COL.TOTAL_PAY - 1]) || 0;
    const status = cleanText_(row[PR_COL.STATUS    - 1]);
    const pp     = cleanText_(row[PR_COL.PAY_PERIOD- 1]);
    latestPayMap.set(id, { pay, status, pp });
  });

  // Build YTD map by summing all PAID + COMPLETE rows
  const allBlocks = getPayrollRunBlocks_();
  const ytdMap = new Map();
  allBlocks.forEach(block => {
    if (!block.firstDataRow || !block.lastDataRow) return;
    const nr = block.lastDataRow - block.firstDataRow + 1;
    if (nr < 1) return;
    const rows = shPR.getRange(block.firstDataRow, 1, nr, PR_COL.LAST_COL).getValues();
    rows.forEach(row => {
      const raw = row[PR_COL.AGENT_ID - 1];
      const id  = typeof raw === 'number' ? raw : parseFloat(raw);
      if (!Number.isFinite(id) || id <= 0 || Math.floor(id) !== id || id > 9999) return;
      const pay = Number(row[PR_COL.TOTAL_PAY - 1]) || 0;
      ytdMap.set(id, (ytdMap.get(id) || 0) + pay);
    });
  });

  // Write agent rows — sorted by agent ID
  const sortedAgents = Array.from(agentMap.values()).sort((a, b) => a.agentId - b.agentId);
  const rows = [];
  sortedAgents.forEach(agent => {
    const latest = latestPayMap.get(agent.agentId) || { pay: 0, status: STATUS.UNPAID, pp: ppCode };
    const ytd    = ytdMap.get(agent.agentId) || 0;
    rows.push([
      agent.agentId,
      agent.name,
      agent.campaign,
      agent.ruleKey,
      latest.pay,
      latest.status,
      latest.pp,
      ytd,
    ]);
  });

  if (rows.length > 0) {
    sh.getRange(4, 1, rows.length, 8).setValues(rows);

    // Agent ID: plain integer (fixes "$3.00" display bug)
    sh.getRange(4, 1, rows.length, 1).setNumberFormat('0');
    // Format pay columns
    sh.getRange(4, 5, rows.length, 1).setNumberFormat('$#,##0.00'); // Latest Week Pay
    sh.getRange(4, 8, rows.length, 1).setNumberFormat('$#,##0.00'); // YTD

    // Status color on column 6 (per-row)
    rows.forEach((row, i) => {
      const status = row[5];
      applyStatusColor_(sh.getRange(4 + i, 6), status);
    });

    // Alternating row colors
    rows.forEach((row, i) => {
      if (i % 2 === 1) {
        sh.getRange(4 + i, 1, 1, 8).setBackground(BRAND.altRow);
      }
      sh.setRowHeight(4 + i, 22);
    });
  }

  // ── Totals row ─────────────────────────────────────────────
  const totalRow = 4 + rows.length + 1;
  const grandTotal = rows.reduce((sum, r) => sum + (r[4] || 0), 0);
  const ytdTotal   = rows.reduce((sum, r) => sum + (r[7] || 0), 0);

  sh.getRange(totalRow, 1, 1, 8)
    .setBackground(BRAND.totalsBg)
    .setFontColor(BRAND.totalsFg)
    .setFontWeight('bold');
  sh.getRange(totalRow, 1).setValue('ALL AGENTS TOTAL');
  sh.getRange(totalRow, 5).setValue(grandTotal).setNumberFormat('$#,##0.00');
  sh.getRange(totalRow, 8).setValue(ytdTotal).setNumberFormat('$#,##0.00');
  sh.setRowHeight(totalRow, 26);

  // ── Campaign summary ───────────────────────────────────────
  const summaryStartRow = totalRow + 3;
  buildDashboardCampaignSummary_(sh, summaryStartRow, rows);

  sh.setColumnWidth(1, 70);
  sh.setColumnWidth(2, 180);
  sh.setColumnWidth(3, 130);
  sh.setColumnWidth(4, 250);
  sh.setColumnWidth(5, 115);
  sh.setColumnWidth(6, 115);
  sh.setColumnWidth(7, 115);
  sh.setColumnWidth(8, 115);

  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert('✅ Dashboard refreshed successfully.');
}

/**
 * buildDashboardCampaignSummary_
 * Appends a campaign-level summary at the bottom of Dashboard.
 * Exactly ONE block (BUG-18 equivalent fix for Dashboard).
 */
function buildDashboardCampaignSummary_(sh, startRow, rows) {
  let r = startRow;

  sh.getRange(r, 1, 1, 4).merge()
    .setValue('📊 CAMPAIGN SUMMARY')
    .setBackground(BRAND.sectionBg)
    .setFontColor(BRAND.sectionFg)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  sh.setRowHeight(r, 28);
  r++;

  writeColHeaders_(sh, r, ['Campaign', 'Active Agents', 'Latest Week Total', 'YTD Total']);
  r++;

  // Group by campaign — skip rows with missing/numeric campaign names
  const campaignMap = new Map();
  rows.forEach(row => {
    const raw = row[2];
    // Only accept non-empty strings that don't parse as a number
    if (!raw || typeof raw !== 'string' || raw.trim() === '' || !isNaN(parseFloat(raw))) return;
    const campaign = raw.trim();
    if (!campaignMap.has(campaign)) campaignMap.set(campaign, { count: 0, latestPay: 0, ytd: 0 });
    const c = campaignMap.get(campaign);
    c.count++;
    c.latestPay += row[4] || 0;
    c.ytd       += row[7] || 0;
  });

  let totalAgents = 0, totalPay = 0, totalYTD = 0;
  Array.from(campaignMap.entries()).sort().forEach(([campaign, data]) => {
    sh.getRange(r, 1, 1, 4).setValues([[campaign, data.count, data.latestPay, data.ytd]]);
    sh.getRange(r, 3, 1, 2).setNumberFormat('$#,##0.00');
    sh.setRowHeight(r, 22);
    totalAgents += data.count;
    totalPay    += data.latestPay;
    totalYTD    += data.ytd;
    r++;
  });

  // Totals
  sh.getRange(r, 1, 1, 4)
    .setValues([['TOTAL', totalAgents, totalPay, totalYTD]])
    .setBackground(BRAND.totalsBg).setFontColor(BRAND.totalsFg).setFontWeight('bold');
  sh.getRange(r, 3, 1, 2).setNumberFormat('$#,##0.00');
  sh.setRowHeight(r, 26);
}


// ─────────────────────────────────────────────────────────────
//  LAYER 7 — WORKFLOW FUNCTIONS
// ─────────────────────────────────────────────────────────────

/**
 * addNewWeek
 * Adds a new week block to the bottom of Payroll Run.
 * Always prompts for the end date (BUG-12 fix: no auto-detect).
 * For cross-month weeks, asks which month to assign (user decision).
 *
 * Steps:
 *  1. Ask for week end date (user types MM/DD/YYYY)
 *  2. Confirm detected pay period
 *  3. For cross-month weeks: ask which month
 *  4. Write block header row with correct date range, status, pay period
 *  5. Write one row per active agent, all UNPAID
 *  6. Refresh totals
 */
function addNewWeek() {
  const ui = SpreadsheetApp.getUi();
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) {
    ui.alert('Payroll Run sheet not found. Run Setup first.');
    return;
  }

  // ── Step 1: Ask for end date ──────────────────────────────
  const resp = ui.prompt(
    '➕ Add New Week',
    'Enter the week END date (Sunday):\nFormat: MM/DD/YYYY\n\nExample: 05/11/2026',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const rawDate = resp.getResponseText().trim();
  const endDate = parseDate_(rawDate);
  if (!endDate) {
    ui.alert(`❌ Invalid date: "${rawDate}"\n\nPlease use MM/DD/YYYY format.`);
    return;
  }

  // Calculate start date (Monday = endDate - 6 days)
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 6);

  // ── Step 2: Detect pay period ────────────────────────────
  const ppCodeAuto = payPeriodCode_(endDate);

  // Check if this is a cross-month week
  const startMonth = startDate.getMonth();
  const endMonth   = endDate.getMonth();
  let ppCode       = ppCodeAuto;

  if (startMonth !== endMonth) {
    // ── Step 3: Cross-month — ask which month ──────────────
    const startMonthName = startDate.toLocaleString('en-US', { month: 'long' });
    const endMonthName   = endDate.toLocaleString('en-US', { month: 'long' });
    const startPP = payPeriodCode_(startDate);
    const endPP   = payPeriodCode_(endDate);

    const crossResp = ui.alert(
      '📅 Cross-Month Week',
      `This week spans two months:\n` +
      `  Start: ${fmtDate_(startDate)} (${startMonthName})\n` +
      `  End:   ${fmtDate_(endDate)} (${endMonthName})\n\n` +
      `Which month should this week be assigned to?\n\n` +
      `• YES → ${startMonthName} (${startPP})\n` +
      `• NO  → ${endMonthName} (${endPP})`,
      ui.ButtonSet.YES_NO
    );
    ppCode = (crossResp === ui.Button.YES) ? startPP : endPP;
  }

  // ── Confirm ────────────────────────────────────────────────
  const ppLabel = payPeriodLabel_(ppCode);
  const confirm = ui.alert(
    '➕ Confirm New Week',
    `Adding week:\n` +
    `  Date range:  ${fmtDate_(startDate)} – ${fmtDate_(endDate)}\n` +
    `  Pay period:  ${ppLabel}\n\n` +
    `Continue?`,
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  // ── Determine week number within this pay period ──────────
  const blocks     = getPayrollRunBlocks_();
  const ppBlocks   = blocks.filter(b => b.ppCode === ppCode);
  const weekNum    = ppBlocks.length + 1; // next week in this period
  // Global week counter per month
  const monthCode  = ppCode.replace(/PP[12]$/, '');
  const monthBlocks= blocks.filter(b => b.ppCode.startsWith(monthCode));
  const weekLabel  = `WEEK ${monthBlocks.length + 1}`;

  // ── Find insertion row ────────────────────────────────────
  let insertRow = sh.getLastRow() + 1;
  // Remove existing totals rows first (they'll be rebuilt)
  for (let r = insertRow - 1; r >= 4; r--) {
    const v = cleanText_(sh.getRange(r, 1).getValue());
    if (v.includes('TOTAL') || v === '') {
      sh.deleteRow(r);
      insertRow--;
    } else {
      break;
    }
  }
  insertRow = sh.getLastRow() + 2; // +2 for a spacer row

  // ── Write block header ─────────────────────────────────────
  writeBlockHeader_(sh, insertRow, weekLabel, startDate, endDate, STATUS.UNPAID, ppCode);

  // ── Write agent rows ───────────────────────────────────────
  const agentMap  = getAgentMap_();
  const ruleMap   = getRuleMap_();
  const alumniMap = getAlumniRuleKeyMap_();

  const agents = Array.from(agentMap.values()).sort((a, b) => a.agentId - b.agentId);
  let currentRow = insertRow + 1;

  agents.forEach(agent => {
    // Resolve rule key — fall back to alumni map for blank keys (BUG-14)
    let rk = agent.ruleKey || alumniMap.get(agent.agentId) || '';
    rk = normalizeRuleKey_(rk);
    const rule = ruleMap.get(rk);

    const inputs = {
      include: 'YES', missedDays: 0, overtimeDays: 0,
      sundays: 0, vacationDays: 0, kpiAchieved: 'NO',
      extraBonus: 0, partialWeek: 0,
    };
    const pay = calcAgentPay_(rule, inputs);

    writeAgentPayRow_(sh, currentRow, { ...agent, ruleKey: rk }, pay, inputs, STATUS.UNPAID, ppCode, '');
    currentRow++;
  });

  // ── Rebuild totals ────────────────────────────────────────
  refreshPayrollRunTotals_();

  SpreadsheetApp.flush();
  ui.alert(
    `✅ Week Added\n\n${weekLabel}\n${fmtDate_(startDate)} – ${fmtDate_(endDate)}\n${ppLabel}\n\n` +
    `${agents.length} agents added. All set to 🟡 UNPAID.\n\n` +
    `Edit individual rows to enter missed days, overtime, KPI, etc.`
  );
}

/**
 * markWeekAsComplete
 * Marks all UNPAID rows in the most recent (or selected) week block as COMPLETE.
 * Shows a summary of total pay and allows adding a memo before confirming.
 * Status: UNPAID → COMPLETE (yellow → blue).
 */
function markWeekAsComplete() {
  const ui = SpreadsheetApp.getUi();
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) { ui.alert('Payroll Run sheet not found.'); return; }

  const blocks = getPayrollRunBlocks_();
  if (blocks.length === 0) { ui.alert('No week blocks found.'); return; }

  // Find the most recent UNPAID block
  const unpaidBlocks = blocks.filter(b => b.status === STATUS.UNPAID);
  if (unpaidBlocks.length === 0) {
    ui.alert('No UNPAID weeks found.\n\nAll weeks are already COMPLETE or PAID.');
    return;
  }

  const block = unpaidBlocks[unpaidBlocks.length - 1]; // most recent unpaid

  // Calculate totals
  const numRows = block.lastDataRow - block.firstDataRow + 1;
  const data = sh.getRange(block.firstDataRow, 1, numRows, PR_COL.LAST_COL).getValues();

  let totalPay = 0;
  let agentCount = 0;
  data.forEach(row => {
    const pay = Number(row[PR_COL.TOTAL_PAY - 1]) || 0;
    const id  = row[PR_COL.AGENT_ID - 1];
    if (typeof id === 'number' || !isNaN(parseFloat(id))) {
      totalPay += pay;
      agentCount++;
    }
  });

  // Ask for memo
  const memoResp = ui.prompt(
    `✅ Mark Week as Complete — ${block.weekLabel}`,
    `Week: ${block.weekLabel}  |  Dates: ${block.dateRange}\n` +
    `Total pay: ${fmt_(totalPay)}  |  Agents: ${agentCount}\n\n` +
    `Optional memo/note for this week:\n(Leave blank if none)`,
    ui.ButtonSet.OK_CANCEL
  );
  if (memoResp.getSelectedButton() !== ui.Button.OK) return;
  const memo = memoResp.getResponseText().trim();

  // Confirm
  const confirm = ui.alert(
    `Mark ${block.weekLabel} as COMPLETE?`,
    `This will change all ${agentCount} rows from 🟡 UNPAID → 🔵 COMPLETE.\n\n` +
    `Total: ${fmt_(totalPay)}\n` +
    (memo ? `Memo: ${memo}\n` : '') +
    `\nYou can still edit values after marking COMPLETE.\nOnly PAID is locked.`,
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  // Update all agent rows in this block
  const statusCells  = [];
  const completeCells = [];

  data.forEach((row, i) => {
    const rowNum = block.firstDataRow + i;
    const id = row[PR_COL.AGENT_ID - 1];
    if (typeof id !== 'number' && isNaN(parseFloat(id))) return; // skip block headers

    // Update status and memo
    sh.getRange(rowNum, PR_COL.STATUS).setValue(STATUS.COMPLETE);
    if (memo) sh.getRange(rowNum, PR_COL.MEMO).setValue(memo);
    completeCells.push(sh.getRange(rowNum, PR_COL.STATUS).getA1Notation());
  });

  // Apply COMPLETE color to all at once (batch)
  if (completeCells.length > 0) {
    sh.getRangeList(completeCells)
      .setBackground(BRAND.completeBg)
      .setFontColor(BRAND.completeFg)
      .setFontWeight('bold');
  }

  // Update block header status too
  sh.getRange(block.headerRow, PR_COL.STATUS).setValue(STATUS.COMPLETE);
  applyStatusColor_(sh.getRange(block.headerRow, PR_COL.STATUS), STATUS.COMPLETE);

  refreshPayrollRunTotals_();
  SpreadsheetApp.flush();

  ui.alert(
    `✅ Week Marked as COMPLETE\n\n` +
    `${block.weekLabel}  |  ${agentCount} agents\n` +
    `Total: ${fmt_(totalPay)}\n\n` +
    `Status changed to 🔵 COMPLETE.\nWhen you're ready to lock it, use "Mark Pay Period as PAID".`
  );
}

/**
 * markPayPeriodAsPaid
 * Marks all COMPLETE rows for a given pay period as PAID.
 * Freezes values (converts formulas to static) and greys out rows.
 * Status: COMPLETE → PAID (blue → green → then greyed).
 * This is the lock — cannot be easily undone.
 */
function markPayPeriodAsPaid() {
  const ui = SpreadsheetApp.getUi();
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) { ui.alert('Payroll Run sheet not found.'); return; }

  const blocks = getPayrollRunBlocks_();
  const completeBlocks = blocks.filter(b => b.status === STATUS.COMPLETE);

  if (completeBlocks.length === 0) {
    ui.alert('No COMPLETE weeks found.\n\nMark a week as COMPLETE first, then lock it as PAID.');
    return;
  }

  // Group COMPLETE blocks by pay period
  const ppGroups = new Map();
  completeBlocks.forEach(b => {
    if (!ppGroups.has(b.ppCode)) ppGroups.set(b.ppCode, []);
    ppGroups.get(b.ppCode).push(b);
  });

  // Ask which pay period to pay
  const ppList = Array.from(ppGroups.keys());
  let targetPP;

  if (ppList.length === 1) {
    targetPP = ppList[0];
  } else {
    const listText = ppList.map((pp, i) => `${i + 1}. ${payPeriodLabel_(pp)}`).join('\n');
    const resp = ui.prompt(
      '💰 Mark Pay Period as PAID',
      `Multiple COMPLETE pay periods found:\n\n${listText}\n\nEnter the number of the pay period to lock as PAID:`,
      ui.ButtonSet.OK_CANCEL
    );
    if (resp.getSelectedButton() !== ui.Button.OK) return;
    const choice = parseInt(resp.getResponseText().trim(), 10);
    if (isNaN(choice) || choice < 1 || choice > ppList.length) {
      ui.alert('Invalid selection.');
      return;
    }
    targetPP = ppList[choice - 1];
  }

  const targetBlocks = ppGroups.get(targetPP);
  const ppLabel      = payPeriodLabel_(targetPP);

  // Calculate total
  let totalPay   = 0;
  let agentCount = 0;
  targetBlocks.forEach(block => {
    const nr   = block.lastDataRow - block.firstDataRow + 1;
    const data = sh.getRange(block.firstDataRow, 1, nr, PR_COL.LAST_COL).getValues();
    data.forEach(row => {
      const id  = row[PR_COL.AGENT_ID  - 1];
      const pay = Number(row[PR_COL.TOTAL_PAY - 1]) || 0;
      if (typeof id === 'number' || !isNaN(parseFloat(id))) {
        totalPay += pay;
        agentCount++;
      }
    });
  });

  // Final confirmation
  const confirm = ui.alert(
    '⚠️ LOCK PAY PERIOD AS PAID',
    `Pay Period: ${ppLabel}\n` +
    `Agents: ${agentCount}  |  Total: ${fmt_(totalPay)}\n\n` +
    `This will:\n` +
    `  • Change all rows from 🔵 COMPLETE → ✅ PAID\n` +
    `  • FREEZE all values (formulas become static numbers)\n` +
    `  • Grey out all rows to indicate locked history\n\n` +
    `⚠️ This action cannot be easily undone. Proceed?`,
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  // Process each block
  targetBlocks.forEach(block => {
    const nr   = block.lastDataRow - block.firstDataRow + 1;
    const range = sh.getRange(block.firstDataRow, 1, nr, PR_COL.LAST_COL);
    const data  = range.getValues();

    // Freeze values — copy values back as static (fixes formula drift)
    range.setValues(data);

    // Update status and color for each agent row
    const paidCells = [];
    data.forEach((row, i) => {
      const rowNum = block.firstDataRow + i;
      const id = row[PR_COL.AGENT_ID - 1];
      if (typeof id !== 'number' && isNaN(parseFloat(id))) return;

      sh.getRange(rowNum, PR_COL.STATUS).setValue(STATUS.PAID);
      paidCells.push(`A${rowNum}:U${rowNum}`); // full row for greying
    });

    // Grey out all PAID rows
    if (paidCells.length > 0) {
      sh.getRangeList(paidCells)
        .setBackground(BRAND.frozenBg)
        .setFontColor(BRAND.frozenFg);
      // But keep status column colored green
      data.forEach((row, i) => {
        const rowNum = block.firstDataRow + i;
        const id = row[PR_COL.AGENT_ID - 1];
        if (typeof id !== 'number' && isNaN(parseFloat(id))) return;
        sh.getRange(rowNum, PR_COL.STATUS)
          .setBackground(BRAND.paidBg)
          .setFontColor(BRAND.paidFg)
          .setFontWeight('bold');
      });
    }

    // Update block header
    sh.getRange(block.headerRow, PR_COL.STATUS).setValue(STATUS.PAID);
    applyStatusColor_(sh.getRange(block.headerRow, PR_COL.STATUS), STATUS.PAID);
    sh.getRange(block.headerRow, 1, 1, PR_COL.LAST_COL).setBackground(BRAND.frozenBg).setFontColor(BRAND.frozenFg);
    sh.getRange(block.headerRow, PR_COL.STATUS)
      .setBackground(BRAND.paidBg).setFontColor(BRAND.paidFg).setFontWeight('bold');
  });

  refreshPayrollRunTotals_();
  SpreadsheetApp.flush();

  ui.alert(
    `✅ PAY PERIOD LOCKED\n\n` +
    `${ppLabel}\n` +
    `${agentCount} agents  |  ${fmt_(totalPay)}\n\n` +
    `All rows are now ✅ PAID and frozen.\n` +
    `Values will not change even if Pay Rules are edited.`
  );
}

/**
 * weekStatusOverview
 * Shows a popup with the last 8 weeks and their status.
 */
function weekStatusOverview() {
  const ui = SpreadsheetApp.getUi();
  const blocks = getPayrollRunBlocks_();

  if (blocks.length === 0) {
    ui.alert('No week blocks found in Payroll Run.');
    return;
  }

  const recent = blocks.slice(-8).reverse();
  let msg = '📋 WEEK STATUS OVERVIEW\n';
  msg += '─'.repeat(45) + '\n';

  recent.forEach(b => {
    const icon = b.status === STATUS.PAID ? '✅' :
                 b.status === STATUS.COMPLETE ? '🔵' : '🟡';
    const ppShort = b.ppCode || '—';
    msg += `${icon}  ${b.weekLabel.padEnd(8)} | ${(b.dateRange || '').padEnd(24)} | ${ppShort}\n`;
  });

  msg += '─'.repeat(45) + '\n';
  msg += `Total weeks tracked: ${blocks.length}`;

  ui.alert('Week Status Overview', msg, ui.ButtonSet.OK);
}

/**
 * unlockPayPeriod
 * Admin-only: unlocks a PAID pay period back to COMPLETE for corrections.
 * Warns user clearly before proceeding.
 */
function unlockPayPeriod() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    '⚠️ UNLOCK PAID PERIOD (Admin)',
    'This will unlock a PAID pay period back to COMPLETE so corrections can be made.\n\n' +
    'This should only be used to fix errors.\n\nContinue?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) { ui.alert('Payroll Run sheet not found.'); return; }

  const blocks   = getPayrollRunBlocks_();
  const paidBlocks = blocks.filter(b => b.status === STATUS.PAID);

  if (paidBlocks.length === 0) {
    ui.alert('No PAID blocks found to unlock.');
    return;
  }

  const ppGroups = new Map();
  paidBlocks.forEach(b => {
    if (!ppGroups.has(b.ppCode)) ppGroups.set(b.ppCode, []);
    ppGroups.get(b.ppCode).push(b);
  });

  const ppList = Array.from(ppGroups.keys());
  const listText = ppList.map((pp, i) => `${i + 1}. ${payPeriodLabel_(pp)}`).join('\n');

  const resp = ui.prompt(
    '⚠️ Unlock Pay Period',
    `Paid pay periods:\n\n${listText}\n\nEnter number to unlock:`,
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const choice = parseInt(resp.getResponseText().trim(), 10);
  if (isNaN(choice) || choice < 1 || choice > ppList.length) {
    ui.alert('Invalid selection.');
    return;
  }

  const targetPP     = ppList[choice - 1];
  const targetBlocks = ppGroups.get(targetPP);

  targetBlocks.forEach(block => {
    const nr   = block.lastDataRow - block.firstDataRow + 1;
    const data = sh.getRange(block.firstDataRow, 1, nr, PR_COL.LAST_COL).getValues();

    data.forEach((row, i) => {
      const rowNum = block.firstDataRow + i;
      const id = row[PR_COL.AGENT_ID - 1];
      if (typeof id !== 'number' && isNaN(parseFloat(id))) return;

      sh.getRange(rowNum, PR_COL.STATUS).setValue(STATUS.COMPLETE);
      sh.getRange(rowNum, 1, 1, PR_COL.LAST_COL)
        .setBackground(null).setFontColor(null);
      applyStatusColor_(sh.getRange(rowNum, PR_COL.STATUS), STATUS.COMPLETE);
    });

    sh.getRange(block.headerRow, PR_COL.STATUS).setValue(STATUS.COMPLETE);
    sh.getRange(block.headerRow, 1, 1, PR_COL.LAST_COL)
      .setBackground(BRAND.blockBg).setFontColor(BRAND.blockFg);
    applyStatusColor_(sh.getRange(block.headerRow, PR_COL.STATUS), STATUS.COMPLETE);
  });

  refreshPayrollRunTotals_();
  SpreadsheetApp.flush();
  ui.alert(`✅ ${payPeriodLabel_(targetPP)} unlocked back to COMPLETE.`);
}


// ─────────────────────────────────────────────────────────────
//  LAYER 8 — MENU + SETUP
// ─────────────────────────────────────────────────────────────

/**
 * onOpen
 * Builds the JOI Payroll menu when the spreadsheet opens.
 * 3 core actions up top + Admin submenu.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💼 JOI Payroll')
    // ── Core workflow (top level) ───────────────────────────
    .addItem('➕  Add New Week',             'addNewWeek')
    .addItem('🔵  Mark Week as Complete',    'markWeekAsComplete')
    .addItem('✅  Mark Pay Period as PAID',  'markPayPeriodAsPaid')
    .addSeparator()
    .addItem('📋  Week Status Overview',     'weekStatusOverview')
    .addItem('🔄  Refresh Dashboard',        'refreshDashboard')
    .addSeparator()
    // ── Admin submenu ───────────────────────────────────────
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('⚙️  Admin')
        .addItem('🚀  First-Time Setup',           'firstTimeSetup')
        .addSeparator()
        .addItem('🔧  Fix Pay Rules Data',          'fixPayRulesData')
        .addItem('👥  Rebuild Agents Sheet',        'ensureAgentsSheet')
        .addItem('🎓  Rebuild Alumni Sheet',        'ensureAlumniSheet')
        .addItem('📋  Rebuild Payroll Run Sheet',   'ensurePayrollRunSheet')
        .addSeparator()
        .addItem('📅  Sync Monthly Sheet…',         'syncMonthlySheetPrompt')
        .addItem('🏠  Rebuild Dashboard',           'ensureDashboardSheet')
        .addSeparator()
        .addItem('⚠️  Unlock PAID Period',          'unlockPayPeriod')
        .addItem('✔️   Validate Pay Rules',          'validatePayRulesDialog')
    )
    .addToUi();
}

/**
 * firstTimeSetup
 * Run once when installing the script on a new spreadsheet.
 * Builds all sheet structures in order.
 */
function firstTimeSetup() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    '🚀 First-Time Setup',
    'This will create / rebuild all sheet structures:\n' +
    '  • Pay Rules\n  • Agents\n  • Alumni\n  • Payroll Run\n  • Dashboard\n\n' +
    'Existing DATA in these sheets will NOT be deleted.\n' +
    'Only headers and formatting will be applied.\n\nContinue?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  ensurePayRulesSheet();
  ensureAgentsSheet();
  ensureAlumniSheet();
  ensurePayrollRunSheet();
  ensureDashboardSheet();

  ui.alert(
    '✅ Setup Complete\n\n' +
    'All sheet structures are ready.\n\n' +
    'Next steps:\n' +
    '1. Go to Pay Rules → run "Fix Pay Rules Data" from Admin menu\n' +
    '2. Verify your Agents and Alumni sheets look correct\n' +
    '3. Use "➕ Add New Week" to start the current week\n' +
    '4. Run "🔄 Refresh Dashboard" to see your overview'
  );
}

/**
 * syncMonthlySheetPrompt
 * Prompts for month and year, then syncs the monthly sheet.
 */
function syncMonthlySheetPrompt() {
  const ui  = SpreadsheetApp.getUi();
  const resp = ui.prompt(
    '📅 Sync Monthly Sheet',
    'Enter month and year to sync:\nFormat: MonthName YYYY\n\nExamples:\n  April 2026\n  May 2026',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const input = resp.getResponseText().trim();
  const parts = input.split(/\s+/);
  if (parts.length < 2) {
    ui.alert('Invalid format. Use: MonthName YYYY (e.g. "April 2026")');
    return;
  }

  const monthName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
  const year      = parseInt(parts[1], 10);

  if (isNaN(year) || year < 2020 || year > 2099) {
    ui.alert(`Invalid year: "${parts[1]}"`);
    return;
  }

  syncMonthlySheetFromPayrollRun(monthName, year);
}

/**
 * validatePayRulesDialog
 * Runs validatePayRules_ and shows a popup with results.
 */
function validatePayRulesDialog() {
  const issues = validatePayRules_();
  const ui     = SpreadsheetApp.getUi();

  if (issues.length === 0) {
    ui.alert('✅ Pay Rules Validation\n\nNo issues found. All rule keys look clean.');
    return;
  }

  let msg = `⚠️ Pay Rules Issues Found: ${issues.length}\n\n`;
  issues.forEach(issue => {
    msg += `Row ${issue.row}: ${issue.field}\n`;
    msg += `  Value: "${issue.value}"\n`;
    msg += `  Issue: ${issue.issue}\n`;
    msg += `  Fix: ${issue.fix}\n\n`;
  });
  msg += 'Run "Fix Pay Rules Data" from the Admin menu to auto-fix these.';

  ui.alert('Pay Rules Validation', msg, ui.ButtonSet.OK);
}


// ─────────────────────────────────────────────────────────────
//  LAYER 9 — MID-WEEK START DETECTION
// ─────────────────────────────────────────────────────────────

/**
 * calcWorkingDaysInWeek_
 * Counts Mon–Fri working days from the agent's start date through
 * the Friday of the current week. Used to handle agents who start
 * on Tuesday, Wednesday, etc.
 *
 * @param {Date} agentStartDate  - The agent's first day of work
 * @param {Date} weekStart       - Monday of the current week
 * @param {Date} weekEnd         - Sunday of the current week
 * @returns {number}             - Number of working days (1–5), or 5 if full week
 */
function calcWorkingDaysInWeek_(agentStartDate, weekStart, weekEnd) {
  // Friday of this week = weekEnd (Sunday) minus 2 days
  const friday = new Date(weekEnd.getTime());
  friday.setDate(friday.getDate() - 2);

  // Effective start = max(agent start, week start)
  const effectiveStart = new Date(
    Math.max(agentStartDate.getTime(), weekStart.getTime())
  );

  // Count Mon–Fri days
  let count = 0;
  const cur = new Date(effectiveStart);
  while (cur <= friday) {
    const day = cur.getDay(); // 0=Sun,1=Mon,...,6=Sat
    if (day >= 1 && day <= 5) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/**
 * isAgentStartingThisWeek_
 * Returns true if the agent's start date falls within the given week range.
 *
 * @param {Date} agentStartDate
 * @param {Date} weekStart  - Monday
 * @param {Date} weekEnd    - Sunday
 */
function isAgentStartingThisWeek_(agentStartDate, weekStart, weekEnd) {
  if (!agentStartDate) return false;
  const ts = agentStartDate.getTime();
  return ts >= weekStart.getTime() && ts <= weekEnd.getTime();
}

/**
 * calcPartialWeekPay_
 * Computes pay for an agent starting mid-week.
 * Uses daily salary × days worked + any bonuses earned.
 *
 * @param {object} rule         - from getRuleMap_()
 * @param {number} daysWorked   - number of Mon–Fri days worked (1–4 for partial)
 * @param {object} inputs       - { kpiAchieved, extraBonus, overtimeDays, sundays }
 * @returns {object}            - pay breakdown matching calcAgentPay_ shape
 */
function calcPartialWeekPay_(rule, daysWorked, inputs) {
  if (!rule) return { weeklyBase: 0, kpiBonus: 0, missedDed: 0, overtimePay: 0, sundayPay: 0, vacationPay: 0, extraBonus: 0, totalPay: 0 };

  const kpi       = (cleanText_(inputs.kpiAchieved || '').toUpperCase() === 'YES');
  const overtime  = Number(inputs.overtimeDays || 0);
  const sundays   = Number(inputs.sundays      || 0);
  const extra     = Number(inputs.extraBonus   || 0);

  // Partial week: pay daily rate × days worked
  const weeklyBase  = Math.round(rule.dailySalary * daysWorked * 100) / 100;
  const kpiBonus    = kpi ? rule.kpiBonus : 0;
  const overtimePay = Math.round(overtime * rule.overtimePay * 100) / 100;
  const sundayPay   = Math.round(sundays  * rule.sundayBonus  * 100) / 100;
  const totalPay    = Math.round((weeklyBase + kpiBonus + overtimePay + sundayPay + extra) * 100) / 100;

  return {
    weeklyBase,
    kpiBonus,
    missedDed   : 0,      // no deductions on a partial start week
    overtimePay,
    sundayPay,
    vacationPay : 0,
    extraBonus  : extra,
    totalPay,
    partialDays : daysWorked,   // for display in Payroll Run
  };
}


// ─────────────────────────────────────────────────────────────
//  LAYER 10 — PAYSTUB GENERATION
// ─────────────────────────────────────────────────────────────

/**
 * getOrCreatePaystubsFolder_
 * Returns (or creates) a "JOI Paystubs" folder in the root of Drive.
 */
function getOrCreatePaystubsFolder_() {
  const name    = 'JOI Paystubs';
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

/**
 * ppMonthYear_
 * Extracts "April 2026" from ppCode.
 * Handles BOTH formats:
 *   New format: "APRIL26PP2"  → "April 2026"
 *   Old format: "APRILPP2"    → "April"  (no year stored in code)
 */
function ppMonthYear_(ppCode) {
  // New format: MONTH + 2-digit year + PP1/PP2  (e.g. "APRIL26PP2")
  let m = ppCode.match(/^([A-Z]+?)(\d{2})(PP[12])$/);
  if (m) {
    const month = m[1].charAt(0) + m[1].slice(1).toLowerCase();
    return `${month} 20${m[2]}`;
  }
  // Old format: MONTH + PP1/PP2, no year  (e.g. "APRILPP2")
  m = ppCode.match(/^([A-Z]+?)(PP[12])$/);
  if (m) {
    return m[1].charAt(0) + m[1].slice(1).toLowerCase();
  }
  return '';
}

/**
 * cleanWeekLabel_
 * Converts "WEEK 3" + ppCode → "WEEK 3 April\n2026"
 * Completely ignores wr.weekRange to avoid raw timestamps from old data.
 */
function cleanWeekLabel_(weekLabel, ppCode) {
  const monthYear = ppMonthYear_(ppCode);
  if (!monthYear) return weekLabel;
  // "April 2026" → "WEEK 3 April\n2026"
  // "April"      → "WEEK 3 April"
  return `${weekLabel} ${monthYear.replace(' ', '\n')}`;
}

/**
 * showDownloadDialog_
 * Opens a modal that downloads the paystub directly to the user's computer.
 * Uses a base64 data URL — no Drive sharing permissions required, no 403 errors.
 *
 * @param {string} fileName  - filename for the downloaded file
 * @param {Blob}   pdfBlob   - the PDF blob to download
 */
function showDownloadDialog_(fileName, pdfBlob) {
  // Encode the PDF as base64 so the browser can download it directly
  const base64   = Utilities.base64Encode(pdfBlob.getBytes());
  const dataUrl  = 'data:application/pdf;base64,' + base64;
  const safeName = fileName.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = HtmlService.createHtmlOutput(
    `<html><body style="font-family:Arial,sans-serif;text-align:center;padding:22px 18px;background:#fff;">
    <p style="font-size:14px;margin-bottom:16px;">
      ✅ <strong>${safeName}</strong><br>
      <span style="font-size:11px;color:#666;">Click the button to save to your Downloads folder</span>
    </p>
    <a id="dl" href="${dataUrl}" download="${safeName}"
       style="display:inline-block;background:#E65100;color:#fff;padding:12px 28px;
              border-radius:4px;font-size:13px;font-weight:bold;text-decoration:none;">
      ⬇️ Download Paystub
    </a><br><br>
    <button onclick="google.script.host.close()"
            style="border:1px solid #ccc;background:#fff;padding:7px 18px;
                   border-radius:4px;cursor:pointer;font-size:12px;color:#555;">
      Close
    </button>
    <script>
      window.onload = function() {
        setTimeout(function() { document.getElementById('dl').click(); }, 400);
      };
    </script>
    </body></html>`
  ).setWidth(400).setHeight(210);
  SpreadsheetApp.getUi().showModalDialog(html, '📥 Paystub Ready');
}

/**
 * generateAgentPaystub_
 * Builds a Google Doc paystub for one agent for one pay period,
 * exports it as a PDF Blob, then trashes the temp Doc.
 * Matches the format of the uploaded sample paystub exactly.
 *
 * @param {object} agent    - { agentId, name, campaign, department }
 * @param {string} ppCode   - e.g. "APRIL26PP2"
 * @param {Array}  weekRows - array of pay row objects for this agent/period
 * @returns {Blob|null}     - PDF blob, or null if no data
 */
function generateAgentPaystub_(agent, ppCode, weekRows) {
  if (!weekRows || weekRows.length === 0) return null;

  const totalPay = weekRows.reduce((s, r) => s + (Number(r.totalPay) || 0), 0);
  const today    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy');

  // ── Brand colors — matches original JOI paystub template ──
  const GOLD  = '#F4B942';   // "joi" logo, grand total, generated date
  const NAVY  = '#1a1a2e';   // primary text, agent values, week labels
  const GREY  = '#888888';   // small labels, column headers, footer
  const BLUE  = '#1565C0';   // pay period subtotal amount
  const WHITE = '#FFFFFF';
  const LGREY = '#F8F9FA';   // alternating row bg

  // Helper: hide table borders by setting them to white
  const hideBorders_ = (tbl) => {
    const a = {};
    a[DocumentApp.Attribute.BORDER_COLOR] = WHITE;
    a[DocumentApp.Attribute.BORDER_WIDTH] = 0;
    tbl.setAttributes(a);
  };

  // ── Create temp Google Doc ────────────────────────────────
  const docTitle = `PAYSTUB_${agent.name.replace(/\s+/g, '_')}_${ppCode}`;
  const doc      = DocumentApp.create(docTitle);
  const body     = doc.getBody();
  body.clear();
  body.setMarginTop(40).setMarginBottom(40).setMarginLeft(54).setMarginRight(54);

  // ── 1. HEADER: "joi" gold left + "Pay Stub" right ─────────
  const hdrTbl = body.appendTable([['', '']]);
  hideBorders_(hdrTbl);
  hdrTbl.getRow(0).setMinimumHeight(50);

  const hdrL = hdrTbl.getCell(0, 0);
  // Insert real JOI logo from Drive, with text fallback
  try {
    const logoBlob = DriveApp.getFileById('1dIXepAvWEForzsR4PZ5KF7S9gZg6PRlu').getBlob();
    const imgPara  = hdrL.getChild(0).asParagraph();      // correct API: getChild(0).asParagraph()
    const img      = imgPara.appendInlineImage(logoBlob);
    img.setWidth(60).setHeight(38);
  } catch(e) {
    hdrL.getChild(0).asParagraph().editAsText()
      .setText('joi').setFontSize(30).setBold(true).setForegroundColor(GOLD);
  }
  hdrL.appendParagraph('PAYROLL DEPARTMENT').editAsText()
    .setFontSize(8).setBold(false).setForegroundColor(GREY);

  const hdrR  = hdrTbl.getCell(0, 1);
  hdrR.setVerticalAlignment(DocumentApp.VerticalAlignment.BOTTOM);
  const hdrRP = hdrR.getChild(0).asParagraph();            // correct API: getChild(0).asParagraph()
  hdrRP.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  hdrRP.editAsText().setText('Pay Stub').setFontSize(12).setBold(true).setForegroundColor(NAVY);

  // ── 2. AGENT INFO TABLE ────────────────────────────────────
  body.appendParagraph('').editAsText().setFontSize(5);

  const agTbl = body.appendTable([
    ['AGENT NAME', 'AGENT ID', 'CAMPAIGN', 'DEPARTMENT'],
    [agent.name, '#' + agent.agentId, agent.campaign || '—', agent.department || '—'],
  ]);
  for (let c = 0; c < 4; c++) {
    agTbl.getRow(0).getCell(c).editAsText()
      .setFontSize(8).setBold(false).setForegroundColor(GREY);
    agTbl.getRow(1).getCell(c).editAsText()
      .setFontSize(11).setBold(true).setForegroundColor(NAVY);
  }

  // ── 3. TOTAL PAY SECTION: amount left + date right ─────────
  body.appendParagraph('').editAsText().setFontSize(5);

  const totTbl = body.appendTable([['', '']]);
  hideBorders_(totTbl);

  const totL = totTbl.getCell(0, 0);
  totL.getChild(0).asParagraph().editAsText()
    .setText('TOTAL PAY — ALL SELECTED PERIODS')
    .setFontSize(9).setBold(true).setForegroundColor(GREY);
  totL.appendParagraph(fmt_(totalPay)).editAsText()
    .setFontSize(28).setBold(true).setForegroundColor(NAVY);
  totL.appendParagraph('1 pay period(s) included').editAsText()
    .setFontSize(8).setBold(false).setForegroundColor(GREY);

  const totR = totTbl.getCell(0, 1);
  totR.setVerticalAlignment(DocumentApp.VerticalAlignment.BOTTOM);
  const totRP = totR.getChild(0).asParagraph();             // correct API
  totRP.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  totRP.editAsText().setText('Generated ' + today)
    .setFontSize(9).setBold(true).setForegroundColor(GOLD);
  const totRSys = totR.appendParagraph('JOI Payroll System');
  totRSys.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  totRSys.editAsText().setFontSize(8).setBold(false).setForegroundColor(GREY);

  // ── 4. WEEKLY BREAKDOWN TABLE ──────────────────────────────
  body.appendParagraph('').editAsText().setFontSize(5);

  const colHdrs = ['WEEK', 'BASE PAY', 'KPI\nBONUS', 'DEDUCTION', 'OT\nPAY', 'SUNDAY', 'VAC / SPIFF', 'TOTAL'];
  const tblData = [colHdrs];

  // Pay period label row
  const ppLR = new Array(8).fill('');
  ppLR[0] = `PAY PERIOD: ${ppCode}`;
  ppLR[1] = weekRows[0] ? (weekRows[0].status || STATUS.UNPAID) : STATUS.UNPAID;
  tblData.push(ppLR);

  // One row per week — clean label with no timestamp
  weekRows.forEach(wr => {
    const spiff = (Number(wr.vacationPay) || 0) + (Number(wr.extraBonus) || 0);
    tblData.push([
      cleanWeekLabel_(wr.weekLabel, ppCode),
      fmt_(wr.basePay),
      Number(wr.kpiBonus)    ? fmt_(wr.kpiBonus)    : '—',
      Number(wr.missedDed)   ? fmt_(wr.missedDed)   : '—',
      Number(wr.overtimePay) ? fmt_(wr.overtimePay) : '—',
      Number(wr.sundayPay)   ? fmt_(wr.sundayPay)   : '—',
      spiff ? fmt_(spiff) + (wr.memo ? '\n' + wr.memo : '') : '—',
      fmt_(wr.totalPay),
    ]);
  });

  // Subtotal + Grand Total
  const subR_ = new Array(8).fill(''); subR_[6] = 'PAY PERIOD SUBTOTAL'; subR_[7] = fmt_(totalPay);
  const gtR_  = new Array(8).fill(''); gtR_[6]  = 'GRAND TOTAL';         gtR_[7]  = fmt_(totalPay);
  tblData.push(subR_);
  tblData.push(gtR_);

  const wkTbl = body.appendTable(tblData);

  // Column header row (row 0): grey text, white bg, no bold — NO dark background
  const chRow = wkTbl.getRow(0);
  for (let c = 0; c < 8; c++) {
    chRow.getCell(c).setBackgroundColor(WHITE)
      .editAsText().setFontSize(8).setBold(false).setForegroundColor(GREY);
  }

  // PP label row (row 1): white bg, bold dark navy
  const ppRow_ = wkTbl.getRow(1);
  for (let c = 0; c < 8; c++) ppRow_.getCell(c).setBackgroundColor(WHITE);
  ppRow_.getCell(0).editAsText().setFontSize(9).setBold(true).setForegroundColor(NAVY);
  ppRow_.getCell(1).editAsText().setFontSize(9).setBold(false).setForegroundColor(NAVY);

  // Data rows (rows 2 … weekRows.length+1): alternating bg, bold week + total cols
  for (let r = 2; r < 2 + weekRows.length; r++) {
    const dRow = wkTbl.getRow(r);
    const bg   = (r % 2 === 0) ? LGREY : WHITE;
    for (let c = 0; c < 8; c++) {
      dRow.getCell(c).setBackgroundColor(bg)
        .editAsText().setFontSize(9).setBold(false).setForegroundColor('#222222');
    }
    dRow.getCell(0).editAsText().setBold(true).setForegroundColor(NAVY);
    dRow.getCell(7).editAsText().setBold(true).setForegroundColor(NAVY);
  }

  // Subtotal row: white bg, blue amount
  const sIdx = wkTbl.getNumRows() - 2;
  const sRow = wkTbl.getRow(sIdx);
  for (let c = 0; c < 8; c++) sRow.getCell(c).setBackgroundColor(WHITE)
    .editAsText().setFontSize(9).setBold(true).setForegroundColor(GREY);
  sRow.getCell(7).editAsText().setForegroundColor(BLUE);

  // Grand total row: white bg, gold amount
  const gRow = wkTbl.getRow(wkTbl.getNumRows() - 1);
  for (let c = 0; c < 8; c++) gRow.getCell(c).setBackgroundColor(WHITE)
    .editAsText().setFontSize(9).setBold(true).setForegroundColor(GREY);
  gRow.getCell(7).editAsText().setForegroundColor(GOLD);

  // Column widths (points)
  // WEEK column wide enough so "PAY PERIOD: APRILPP2" never wraps to 2 lines
  wkTbl.setColumnWidth(0, 130); wkTbl.setColumnWidth(1, 65);
  wkTbl.setColumnWidth(2, 50);  wkTbl.setColumnWidth(3, 60);
  wkTbl.setColumnWidth(4, 46);  wkTbl.setColumnWidth(5, 52);
  wkTbl.setColumnWidth(6, 75);  wkTbl.setColumnWidth(7, 65);

  // ── 5. FOOTER ──────────────────────────────────────────────
  body.appendParagraph('').editAsText().setFontSize(4);
  const footer = body.appendParagraph(
    'Generated automatically by the JOI Payroll Dashboard system. ' +
    'This document is confidential and intended solely for the named agent.'
  );
  footer.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  footer.editAsText().setFontSize(7).setForegroundColor('#AAAAAA').setItalic(true);

  doc.saveAndClose();

  // ── Export as PDF blob + trash temp Doc ───────────────────
  const pdfBlob = DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF);
  const safeName = agent.name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
  pdfBlob.setName(
    `${safeName}_${ppCode}_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')}.pdf`
  );
  DriveApp.getFileById(doc.getId()).setTrashed(true);

  return pdfBlob;
}

/**
 * collectWeekRowsForAgent_
 * Reads all Payroll Run blocks matching ppCode and collects
 * the rows for a specific agentId.
 *
 * @param {number} agentId
 * @param {string} ppCode
 * @returns {Array} - array of row objects
 */
function collectWeekRowsForAgent_(agentId, ppCode) {
  const ss     = ss_();
  const sh     = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) return [];

  const blocks = getPayrollRunBlocks_().filter(b => b.ppCode === ppCode);
  const rows   = [];

  blocks.forEach(block => {
    if (!block.firstDataRow || !block.lastDataRow) return;
    const nr   = block.lastDataRow - block.firstDataRow + 1;
    if (nr < 1) return;
    const data = sh.getRange(block.firstDataRow, 1, nr, PR_COL.LAST_COL).getValues();
    data.forEach(row => {
      if (Number(row[PR_COL.AGENT_ID - 1]) !== agentId) return;
      rows.push({
        weekLabel   : block.weekLabel,
        weekRange   : block.dateRange,
        basePay     : Number(row[PR_COL.WEEKLY_BASE   - 1]) || 0,
        kpiBonus    : Number(row[PR_COL.KPI_BONUS     - 1]) || 0,
        missedDed   : Number(row[PR_COL.MISSED_DED    - 1]) || 0,
        overtimePay : Number(row[PR_COL.OVERTIME_PAY  - 1]) || 0,
        sundayPay   : Number(row[PR_COL.SUNDAY_PAY    - 1]) || 0,
        vacationPay : Number(row[PR_COL.VACATION_PAY  - 1]) || 0,
        extraBonus  : Number(row[PR_COL.EXTRA_BONUS   - 1]) || 0,
        totalPay    : Number(row[PR_COL.TOTAL_PAY     - 1]) || 0,
        status      : cleanText_(row[PR_COL.STATUS     - 1]),
        memo        : cleanText_(row[PR_COL.MEMO       - 1]),
      });
    });
  });

  return rows;
}

/**
 * generateAllPaystubs
 * Main menu action: prompts for pay period, generates one PDF per agent,
 * saves all PDFs to the "JOI Paystubs/PPCODE" subfolder in Drive.
 * Does NOT email — separate step.
 */
function generateAllPaystubs() {
  const ui = SpreadsheetApp.getUi();

  // ── Step 1: Ask for pay period ────────────────────────────
  const blocks = getPayrollRunBlocks_();
  if (blocks.length === 0) {
    ui.alert('No week blocks found in Payroll Run. Add at least one week first.');
    return;
  }

  // Build unique list of pay periods
  const ppSet = new Set(blocks.map(b => b.ppCode).filter(Boolean));
  const ppList = Array.from(ppSet).sort();

  const listText = ppList.map((pp, i) => `${i + 1}. ${payPeriodLabel_(pp)}`).join('\n');
  const resp = ui.prompt(
    '📄 Generate All Paystubs',
    `Select a pay period to generate paystubs for:\n\n${listText}\n\nEnter the number:`,
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const choice = parseInt(resp.getResponseText().trim(), 10);
  if (isNaN(choice) || choice < 1 || choice > ppList.length) {
    ui.alert('Invalid selection.');
    return;
  }
  const ppCode  = ppList[choice - 1];
  const ppLabel = payPeriodLabel_(ppCode);

  // ── Step 2: Confirm ────────────────────────────────────────
  const agentMap = getAgentMap_();
  const confirm  = ui.alert(
    'Generate Paystubs',
    `Generating paystubs for:\n${ppLabel}\n\n${agentMap.size} agents\n\nPDFs will be saved to:\nGoogle Drive → JOI Paystubs → ${ppCode}\n\nContinue?`,
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  // ── Step 3: Create Drive subfolder ─────────────────────────
  const rootFolder = getOrCreatePaystubsFolder_();
  const subFolders = rootFolder.getFoldersByName(ppCode);
  const folder     = subFolders.hasNext() ? subFolders.next() : rootFolder.createFolder(ppCode);

  // ── Step 4: Generate PDFs ─────────────────────────────────
  let generated = 0;
  let skipped   = 0;

  agentMap.forEach((agent, agentId) => {
    const weekRows = collectWeekRowsForAgent_(agentId, ppCode);
    if (weekRows.length === 0 || weekRows.every(r => r.totalPay === 0)) {
      skipped++;
      return;
    }

    const pdfBlob = generateAgentPaystub_(agent, ppCode, weekRows);
    if (pdfBlob) {
      folder.createFile(pdfBlob);
      generated++;
    }
  });

  SpreadsheetApp.flush();
  ui.alert(
    `✅ Paystubs Generated\n\n` +
    `Pay Period: ${ppLabel}\n` +
    `Generated: ${generated} paystubs\n` +
    `Skipped (no pay data): ${skipped}\n\n` +
    `Files saved to:\nGoogle Drive → JOI Paystubs → ${ppCode}\n\n` +
    `Ready to email? Use "📧 Email All Paystubs" from the Paystubs menu.`
  );
}

/**
 * emailAllPaystubs
 * Reads paystubs already saved in the Drive folder for a pay period
 * and emails each one to the matching agent's email address.
 * Only agents with an email in the Agents sheet receive the email.
 */
function emailAllPaystubs() {
  const ui = SpreadsheetApp.getUi();

  // ── Step 1: Pick pay period ────────────────────────────────
  const blocks = getPayrollRunBlocks_();
  const ppSet  = new Set(blocks.map(b => b.ppCode).filter(Boolean));
  const ppList = Array.from(ppSet).sort();

  const listText = ppList.map((pp, i) => `${i + 1}. ${payPeriodLabel_(pp)}`).join('\n');
  const resp = ui.prompt(
    '📧 Email All Paystubs',
    `Email paystubs for which pay period?\n\n${listText}\n\nEnter the number:`,
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const choice = parseInt(resp.getResponseText().trim(), 10);
  if (isNaN(choice) || choice < 1 || choice > ppList.length) {
    ui.alert('Invalid selection.'); return;
  }
  const ppCode  = ppList[choice - 1];
  const ppLabel = payPeriodLabel_(ppCode);

  // ── Step 2: Check Drive folder exists ─────────────────────
  const rootFolder = getOrCreatePaystubsFolder_();
  const subFolders = rootFolder.getFoldersByName(ppCode);
  if (!subFolders.hasNext()) {
    ui.alert(
      `No paystubs found for ${ppCode}.\n\nRun "📄 Generate All Paystubs" first, then email them.`
    );
    return;
  }
  const folder = subFolders.next();

  // ── Step 3: Preview before sending ────────────────────────
  const agentMap  = getAgentMap_();
  const withEmail = Array.from(agentMap.values()).filter(a => a.email);
  const noEmail   = Array.from(agentMap.values()).filter(a => !a.email);

  const confirm = ui.alert(
    '📧 Confirm Email Send',
    `Pay Period: ${ppLabel}\n\n` +
    `Will email: ${withEmail.length} agents (have email addresses)\n` +
    `Will skip:  ${noEmail.length} agents (no email on file)\n\n` +
    `⚠️ This will send real emails. Proceed?`,
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  // ── Step 4: Send emails ───────────────────────────────────
  let sent   = 0;
  let failed = 0;
  const errors = [];

  agentMap.forEach((agent, agentId) => {
    if (!agent.email) return;

    // Find their PDF file in the Drive folder
    const files = folder.getFilesByName(
      `${agent.name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_')}_${ppCode}_`
    );

    // If exact match fails, search by agent name prefix
    let pdfFile = null;
    const allFiles = folder.getFiles();
    while (allFiles.hasNext()) {
      const f = allFiles.next();
      const n = f.getName();
      if (n.includes(agent.name.replace(/\s+/g, '_')) && n.includes(ppCode)) {
        pdfFile = f;
        break;
      }
    }

    // If still not found, regenerate on the fly
    if (!pdfFile) {
      const weekRows = collectWeekRowsForAgent_(agentId, ppCode);
      if (weekRows.length === 0) return; // no data for this agent this period
      const pdfBlob = generateAgentPaystub_(agent, ppCode, weekRows);
      if (!pdfBlob) return;

      try {
        MailApp.sendEmail({
          to      : agent.email,
          subject : `Your Pay Stub — ${ppLabel}`,
          body    :
            `Hi ${agent.name.split(' ')[0]},\n\n` +
            `Please find attached your pay stub for ${ppLabel}.\n\n` +
            `If you have any questions about your pay, please reach out to your manager.\n\n` +
            `JOI Payroll System`,
          attachments : [pdfBlob],
        });
        sent++;
      } catch (e) {
        failed++;
        errors.push(`${agent.name}: ${e.message}`);
      }
      return;
    }

    // Send from Drive file
    try {
      MailApp.sendEmail({
        to      : agent.email,
        subject : `Your Pay Stub — ${ppLabel}`,
        body    :
          `Hi ${agent.name.split(' ')[0]},\n\n` +
          `Please find attached your pay stub for ${ppLabel}.\n\n` +
          `If you have any questions about your pay, please reach out to your manager.\n\n` +
          `JOI Payroll System`,
        attachments : [pdfFile.getAs(MimeType.PDF)],
      });
      sent++;
    } catch (e) {
      failed++;
      errors.push(`${agent.name}: ${e.message}`);
    }
  });

  let resultMsg = `✅ Emails Sent\n\nPay Period: ${ppLabel}\nSent: ${sent}\nFailed: ${failed}`;
  if (errors.length > 0) resultMsg += `\n\nErrors:\n${errors.join('\n')}`;
  ui.alert(resultMsg);
}

/**
 * generateOnePaystub
 * Admin menu action: generate a paystub for ONE agent.
 * Prompts for agent ID and pay period.
 */
function generateOnePaystub() {
  const ui  = SpreadsheetApp.getUi();

  const idResp = ui.prompt(
    '📄 Generate Single Paystub',
    'Enter the Agent ID:',
    ui.ButtonSet.OK_CANCEL
  );
  if (idResp.getSelectedButton() !== ui.Button.OK) return;

  const agentId  = parseInt(idResp.getResponseText().trim(), 10);
  const agentMap = getAgentMap_();
  const agent    = agentMap.get(agentId);

  if (!agent) {
    ui.alert(`Agent ID ${agentId} not found in the Agents sheet.`);
    return;
  }

  const blocks = getPayrollRunBlocks_();
  const ppSet  = new Set(blocks.map(b => b.ppCode).filter(Boolean));
  const ppList = Array.from(ppSet).sort();
  const listText = ppList.map((pp, i) => `${i + 1}. ${payPeriodLabel_(pp)}`).join('\n');

  const ppResp = ui.prompt(
    `Paystub for ${agent.name}`,
    `Select pay period:\n\n${listText}\n\nEnter number:`,
    ui.ButtonSet.OK_CANCEL
  );
  if (ppResp.getSelectedButton() !== ui.Button.OK) return;

  const choice = parseInt(ppResp.getResponseText().trim(), 10);
  if (isNaN(choice) || choice < 1 || choice > ppList.length) {
    ui.alert('Invalid selection.'); return;
  }
  const ppCode   = ppList[choice - 1];
  const weekRows = collectWeekRowsForAgent_(agentId, ppCode);

  if (weekRows.length === 0) {
    ui.alert(`No payroll data found for ${agent.name} in ${ppCode}.`);
    return;
  }

  const pdfBlob = generateAgentPaystub_(agent, ppCode, weekRows);
  if (!pdfBlob) { ui.alert('Error generating paystub.'); return; }

  // Save a copy to Drive for records
  const folder = getOrCreatePaystubsFolder_();
  folder.createFile(pdfBlob);

  // Trigger direct browser download via base64 data URL (no 403 errors)
  showDownloadDialog_(pdfBlob.getName(), pdfBlob);
}


// ─────────────────────────────────────────────────────────────
//  LAYER 11 — INDIVIDUAL AGENT BREAKDOWN
// ─────────────────────────────────────────────────────────────

/**
 * agentPayrollBreakdown
 * Prompts for an agent ID, shows a popup summary of ALL their weeks,
 * and generates a full history PDF saved to Drive.
 * Designed for when an agent questions their pay — you pull it up
 * in seconds and can share the PDF with them.
 */
function agentPayrollBreakdown() {
  const ui  = SpreadsheetApp.getUi();

  const resp = ui.prompt(
    '🔍 Agent Payroll Breakdown',
    'Enter the Agent ID to pull full payroll history:',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const agentId  = parseInt(resp.getResponseText().trim(), 10);
  const agentMap = getAgentMap_();
  let agent      = agentMap.get(agentId);

  // Also check Alumni if not found in active agents
  if (!agent) {
    const alumniMap = getAgentMap_();
    const ss  = ss_();
    const alSh = ss.getSheetByName(SH.ALUMNI);
    if (alSh) {
      const lastRow = alSh.getLastRow();
      if (lastRow >= 4) {
        const alData = alSh.getRange(4, 1, lastRow - 3, AL_COL.LAST_COL).getValues();
        alData.forEach(row => {
          if (Number(row[AL_COL.AGENT_ID - 1]) === agentId) {
            agent = {
              agentId    : agentId,
              name       : cleanText_(row[AL_COL.AGENT_NAME  - 1]),
              campaign   : cleanText_(row[AL_COL.CAMPAIGN    - 1]),
              department : cleanText_(row[AL_COL.DEPARTMENT  - 1]),
              ruleKey    : cleanText_(row[AL_COL.RULE_KEY    - 1]),
              email      : cleanText_(row[AL_COL.EMAIL       - 1]),
            };
          }
        });
      }
    }
  }

  if (!agent) {
    ui.alert(`Agent ID ${agentId} not found in Agents or Alumni sheets.`);
    return;
  }

  // ── Collect ALL weeks for this agent ──────────────────────
  const ss   = ss_();
  const sh   = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) { ui.alert('Payroll Run sheet not found.'); return; }

  const allBlocks = getPayrollRunBlocks_();
  const allWeeks  = [];
  let   grandTotal = 0;
  let   paidTotal  = 0;
  let   unpaidTotal = 0;

  allBlocks.forEach(block => {
    if (!block.firstDataRow || !block.lastDataRow) return;
    const nr   = block.lastDataRow - block.firstDataRow + 1;
    if (nr < 1) return;
    const data = sh.getRange(block.firstDataRow, 1, nr, PR_COL.LAST_COL).getValues();
    data.forEach(row => {
      if (Number(row[PR_COL.AGENT_ID - 1]) !== agentId) return;
      const pay    = Number(row[PR_COL.TOTAL_PAY - 1]) || 0;
      const status = cleanText_(row[PR_COL.STATUS - 1]);
      allWeeks.push({
        weekLabel   : block.weekLabel,
        weekRange   : block.dateRange,
        ppCode      : block.ppCode,
        basePay     : Number(row[PR_COL.WEEKLY_BASE   - 1]) || 0,
        kpiBonus    : Number(row[PR_COL.KPI_BONUS     - 1]) || 0,
        missedDed   : Number(row[PR_COL.MISSED_DED    - 1]) || 0,
        overtimePay : Number(row[PR_COL.OVERTIME_PAY  - 1]) || 0,
        sundayPay   : Number(row[PR_COL.SUNDAY_PAY    - 1]) || 0,
        vacationPay : Number(row[PR_COL.VACATION_PAY  - 1]) || 0,
        extraBonus  : Number(row[PR_COL.EXTRA_BONUS   - 1]) || 0,
        totalPay    : pay,
        status,
        memo        : cleanText_(row[PR_COL.MEMO - 1]),
      });
      grandTotal += pay;
      if (status === STATUS.PAID) paidTotal += pay;
      else unpaidTotal += pay;
    });
  });

  if (allWeeks.length === 0) {
    ui.alert(`No payroll records found for ${agent.name} (ID: ${agentId}).`);
    return;
  }

  // ── Popup summary ─────────────────────────────────────────
  // Group by pay period for the popup
  const byPP = new Map();
  allWeeks.forEach(w => {
    if (!byPP.has(w.ppCode)) byPP.set(w.ppCode, { weeks: [], total: 0, status: w.status });
    byPP.get(w.ppCode).weeks.push(w);
    byPP.get(w.ppCode).total += w.totalPay;
    byPP.get(w.ppCode).status = w.status; // last status wins
  });

  let popupMsg  = `👤 ${agent.name}  (ID: #${agentId})\n`;
  popupMsg     += `🏢 ${agent.campaign} — ${agent.department}\n`;
  popupMsg     += '─'.repeat(48) + '\n';

  Array.from(byPP.entries()).forEach(([pp, data]) => {
    const icon = data.status === STATUS.PAID ? '✅' :
                 data.status === STATUS.COMPLETE ? '🔵' : '🟡';
    popupMsg += `\n${icon} ${payPeriodLabel_(pp)}\n`;
    data.weeks.forEach(w => {
      popupMsg += `   ${w.weekLabel.padEnd(8)} ${(w.weekRange || '').padEnd(26)} ${fmt_(w.totalPay)}\n`;
    });
    popupMsg += `   ${'PP TOTAL'.padEnd(36)} ${fmt_(data.total)}\n`;
  });

  popupMsg += '\n' + '─'.repeat(48) + '\n';
  popupMsg += `   ${'✅ PAID'.padEnd(36)} ${fmt_(paidTotal)}\n`;
  popupMsg += `   ${'🟡 OUTSTANDING'.padEnd(36)} ${fmt_(unpaidTotal)}\n`;
  popupMsg += `   ${'💼 ALL-TIME TOTAL'.padEnd(36)} ${fmt_(grandTotal)}\n`;
  popupMsg += '\nGenerating full PDF breakdown…';

  ui.alert('Agent Payroll Breakdown', popupMsg, ui.ButtonSet.OK);

  // ── Generate full breakdown PDF ───────────────────────────
  const pdfBlob = generateAgentBreakdownPDF_(agent, allWeeks, byPP, grandTotal, paidTotal, unpaidTotal);
  if (!pdfBlob) { ui.alert('Error generating breakdown PDF.'); return; }

  const folder = getOrCreatePaystubsFolder_();
  folder.createFile(pdfBlob);

  ui.alert(
    `✅ Breakdown PDF Saved\n\n` +
    `${agent.name} — Full Payroll History\n\n` +
    `Saved to: Google Drive → JOI Paystubs\n` +
    `File: ${pdfBlob.getName()}\n\n` +
    `You can open, print, or share this file directly from Drive.`
  );
}

/**
 * generateAgentBreakdownPDF_
 * Creates a detailed full-history PDF for one agent.
 * Includes every week, every pay component, grouped by pay period.
 * Used for answering agent pay questions.
 */
function generateAgentBreakdownPDF_(agent, allWeeks, byPP, grandTotal, paidTotal, unpaidTotal) {
  const today   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy');
  const docTitle = `BREAKDOWN_${agent.name.replace(/\s+/g, '_')}_FULL_HISTORY`;

  const doc  = DocumentApp.create(docTitle);
  const body = doc.getBody();
  body.clear();
  body.setMarginTop(40).setMarginBottom(40).setMarginLeft(54).setMarginRight(54);

  // ── Header ─────────────────────────────────────────────────
  const h1 = body.appendParagraph('JOI');
  h1.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  h1.editAsText().setFontSize(28).setBold(true).setForegroundColor('#e94560');

  const h2 = body.appendParagraph('Payroll History — Full Breakdown');
  h2.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  h2.editAsText().setFontSize(13).setBold(true).setForegroundColor('#1a1a2e');

  body.appendParagraph(`Generated: ${today}`)
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
    .editAsText().setFontSize(8).setForegroundColor('#888888');

  body.appendParagraph('');

  // ── Agent card ─────────────────────────────────────────────
  const cardTable = body.appendTable([
    ['AGENT NAME', 'AGENT ID', 'CAMPAIGN', 'DEPARTMENT'],
    [agent.name, '#' + agent.agentId, agent.campaign || '—', agent.department || '—'],
  ]);
  const cardHead = cardTable.getRow(0);
  for (let c = 0; c < 4; c++) {
    cardHead.getCell(c).setBackgroundColor('#1a1a2e')
      .editAsText().setFontSize(8).setBold(true).setForegroundColor('#FFFFFF');
  }
  cardTable.getRow(1).getCell(0).editAsText().setFontSize(10).setBold(true);

  body.appendParagraph('');

  // ── Summary totals box ────────────────────────────────────
  const sumTable = body.appendTable([
    ['💼 ALL-TIME TOTAL', '✅ PAID', '🟡 OUTSTANDING'],
    [fmt_(grandTotal), fmt_(paidTotal), fmt_(unpaidTotal)],
  ]);
  const sumHead = sumTable.getRow(0);
  const sumData = sumTable.getRow(1);
  ['#1a1a2e', '#2E7D32', '#7a4f00'].forEach((color, i) => {
    sumHead.getCell(i).setBackgroundColor(color)
      .editAsText().setFontSize(9).setBold(true).setForegroundColor('#FFFFFF');
    sumData.getCell(i).editAsText().setFontSize(13).setBold(true);
  });

  body.appendParagraph('');

  // ── Per pay period breakdown ──────────────────────────────
  Array.from(byPP.entries()).forEach(([ppCode, ppData]) => {
    const ppLabel  = payPeriodLabel_(ppCode);
    const ppStatus = ppData.status || STATUS.UNPAID;

    const secPara = body.appendParagraph(`${ppLabel}  —  ${ppStatus}`);
    secPara.editAsText().setFontSize(10).setBold(true).setForegroundColor('#1a1a2e');
    secPara.setSpacingBefore(10);

    // Week detail table for this pay period
    const tData = [['WEEK', 'DATES', 'BASE', 'KPI', 'DEDUCTION', 'OT', 'SUN', 'VAC/SPIFF', 'TOTAL']];
    ppData.weeks.forEach(w => {
      const spiff = (w.vacationPay || 0) + (w.extraBonus || 0);
      tData.push([
        w.weekLabel,
        w.weekRange || '',
        fmt_(w.basePay),
        w.kpiBonus    ? fmt_(w.kpiBonus)    : '—',
        w.missedDed   ? fmt_(w.missedDed)   : '—',
        w.overtimePay ? fmt_(w.overtimePay) : '—',
        w.sundayPay   ? fmt_(w.sundayPay)   : '—',
        spiff         ? fmt_(spiff)         : '—',
        fmt_(w.totalPay),
      ]);
    });
    tData.push(['PAY PERIOD TOTAL', '', '', '', '', '', '', '', fmt_(ppData.total)]);

    const t = body.appendTable(tData);

    // Style header row
    const th = t.getRow(0);
    for (let c = 0; c < 9; c++) {
      th.getCell(c).setBackgroundColor('#0f3460')
        .editAsText().setFontSize(7).setBold(true).setForegroundColor('#FFFFFF');
    }
    // Style data rows
    for (let r = 1; r < t.getNumRows() - 1; r++) {
      const bg = (r % 2 === 0) ? '#F8F9FA' : '#FFFFFF';
      for (let c = 0; c < 9; c++) {
        t.getRow(r).getCell(c).setBackgroundColor(bg)
          .editAsText().setFontSize(8);
      }
    }
    // Totals row
    const lastRow = t.getRow(t.getNumRows() - 1);
    for (let c = 0; c < 9; c++) {
      lastRow.getCell(c).setBackgroundColor('#16213e')
        .editAsText().setFontSize(8).setBold(true).setForegroundColor('#FFFFFF');
    }

    // Column widths
    t.setColumnWidth(0, 52); t.setColumnWidth(1, 110);
    t.setColumnWidth(2, 58); t.setColumnWidth(3, 50);
    t.setColumnWidth(4, 60); t.setColumnWidth(5, 45);
    t.setColumnWidth(6, 45); t.setColumnWidth(7, 58);
    t.setColumnWidth(8, 60);

    body.appendParagraph('');
  });

  // ── Footer ─────────────────────────────────────────────────
  const ftPara = body.appendParagraph(
    `This document contains confidential payroll information for ${agent.name} only. ` +
    `Generated by JOI Payroll System on ${today}.`
  );
  ftPara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  ftPara.editAsText().setFontSize(7).setForegroundColor('#AAAAAA').setItalic(true);

  doc.saveAndClose();

  const pdfBlob = DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF);
  const safeName = agent.name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
  pdfBlob.setName(
    `${safeName}_FULL_HISTORY_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')}.pdf`
  );
  DriveApp.getFileById(doc.getId()).setTrashed(true);

  return pdfBlob;
}


// ─────────────────────────────────────────────────────────────
//  UPDATED onOpen — adds Paystubs menu + new items
// ─────────────────────────────────────────────────────────────

/**
 * unlockCompletedWeek
 * Reverts a 🔵 COMPLETE week back to 🟡 UNPAID so you can
 * edit values, fix mistakes, and re-complete it.
 * Only affects COMPLETE weeks — PAID weeks use "Unlock PAID Period" in Admin.
 */
function unlockCompletedWeek() {
  const ui = SpreadsheetApp.getUi();
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) { ui.alert('Payroll Run sheet not found.'); return; }

  const blocks = getPayrollRunBlocks_().filter(b => b.status === STATUS.COMPLETE);
  if (blocks.length === 0) {
    ui.alert(
      'No completed weeks to unlock.\n\n' +
      'Only weeks marked "🔵 COMPLETE" can be unlocked here.\n' +
      'For PAID periods use: Admin → Unlock PAID Period.'
    );
    return;
  }

  const list = blocks.map((b, i) =>
    `${i + 1}. ${b.weekLabel}  |  ${b.dateRange || ''}  |  ${b.ppCode}`
  ).join('\n');

  const resp = ui.prompt(
    '🔓 Unlock Completed Week',
    `Which week do you need to edit?\n\n${list}\n\nEnter the number:`,
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const choice = parseInt(resp.getResponseText().trim(), 10);
  if (isNaN(choice) || choice < 1 || choice > blocks.length) {
    ui.alert('Invalid selection.'); return;
  }
  const block = blocks[choice - 1];

  const go = ui.alert(
    '⚠️ Confirm Unlock',
    `Unlock "${block.weekLabel}" back to UNPAID?\n\n` +
    `All rows will be set to 🟡 UNPAID so you can edit values.\n` +
    `Re-run "Mark Week as Complete" when you're done fixing it.`,
    ui.ButtonSet.YES_NO
  );
  if (go !== ui.Button.YES) return;

  // Reset block header
  sh.getRange(block.headerRow, PR_COL.STATUS).setValue(STATUS.UNPAID);
  sh.getRange(block.headerRow, 1, 1, PR_COL.LAST_COL)
    .setBackground(BRAND.blockBg).setFontColor(BRAND.blockFg);
  applyStatusColor_(sh.getRange(block.headerRow, PR_COL.STATUS), STATUS.UNPAID);

  // Reset every agent row in the block
  for (let r = block.firstDataRow; r <= block.lastDataRow; r++) {
    const raw = sh.getRange(r, PR_COL.AGENT_ID).getValue();
    const id  = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!Number.isFinite(id) || id <= 0 || Math.floor(id) !== id) continue;
    sh.getRange(r, PR_COL.STATUS).setValue(STATUS.UNPAID);
    applyStatusColor_(sh.getRange(r, PR_COL.STATUS), STATUS.UNPAID);
    // Restore normal row color (remove complete styling)
    sh.getRange(r, 1, 1, PR_COL.LAST_COL).setFontColor(null).setBackground(null);
  }

  refreshPayrollRunTotals_();
  SpreadsheetApp.flush();
  ui.alert(
    `✅ "${block.weekLabel}" is now UNPAID.\n\n` +
    `Edit any values you need to fix, then run\n` +
    `"🔵 Mark Week as Complete" when ready.`
  );
}


/**
 * addNewAgent
 * Menu action: step-by-step prompts to add a brand-new agent to the Agents sheet.
 * Auto-assigns the next available Agent ID (max existing + 1).
 * Prompts for: Name, Campaign, Department, Shift, Rule Key, Email, Start Date.
 */
function addNewAgent() {
  const ui = SpreadsheetApp.getUi();
  const ss = ss_();
  const sh = ss.getSheetByName(SH.AGENTS);
  if (!sh) { ui.alert('Agents sheet not found. Run Setup first.'); return; }

  // ── 1. Name ──────────────────────────────────────────────
  const nameR = ui.prompt('➕ Add New Agent (1/7)', 'Agent full name:', ui.ButtonSet.OK_CANCEL);
  if (nameR.getSelectedButton() !== ui.Button.OK) return;
  const agentName = nameR.getResponseText().trim();
  if (!agentName) { ui.alert('Name is required.'); return; }

  // ── 2. Campaign ──────────────────────────────────────────
  const campR = ui.prompt(
    '➕ Add New Agent (2/7)',
    'Campaign:\n(e.g. Torro, HFB, BTC, BLB, Scoop, Admin)',
    ui.ButtonSet.OK_CANCEL
  );
  if (campR.getSelectedButton() !== ui.Button.OK) return;
  const campaign = campR.getResponseText().trim();

  // ── 3. Department ────────────────────────────────────────
  const deptR = ui.prompt(
    '➕ Add New Agent (3/7)',
    'Department / Role:\n(e.g. Declines, TL, Designer, Doc Collector, Recruitment)',
    ui.ButtonSet.OK_CANCEL
  );
  if (deptR.getSelectedButton() !== ui.Button.OK) return;
  const department = deptR.getResponseText().trim();

  // ── 4. Shift ─────────────────────────────────────────────
  const shiftR = ui.prompt(
    '➕ Add New Agent (4/7)',
    'Shift:\n(e.g. Weekday, Weekend, Full-time)',
    ui.ButtonSet.OK_CANCEL
  );
  if (shiftR.getSelectedButton() !== ui.Button.OK) return;
  const shift = shiftR.getResponseText().trim();

  // ── 5. Rule Key (show available rules to pick from) ──────
  const ruleMap  = getRuleMap_();
  const ruleList = Array.from(ruleMap.keys()).sort().join('\n');
  const rkR = ui.prompt(
    '➕ Add New Agent (5/7)',
    'Rule Key — copy exact key from the list below:\n\n' + ruleList,
    ui.ButtonSet.OK_CANCEL
  );
  if (rkR.getSelectedButton() !== ui.Button.OK) return;
  const ruleKey = normalizeRuleKey_(rkR.getResponseText().trim());

  if (ruleKey && !ruleMap.has(ruleKey)) {
    const cont = ui.alert(
      '⚠️ Rule Key Not Found',
      `"${ruleKey}" was not found in Pay Rules.\n\n` +
      `The agent will show $0 pay until a matching rule is added.\n\nContinue anyway?`,
      ui.ButtonSet.YES_NO
    );
    if (cont !== ui.Button.YES) return;
  }

  // ── 6. Email ─────────────────────────────────────────────
  const emailR = ui.prompt(
    '➕ Add New Agent (6/7)',
    'Email address (optional — used for paystub delivery):\n\nLeave blank if none.',
    ui.ButtonSet.OK_CANCEL
  );
  if (emailR.getSelectedButton() !== ui.Button.OK) return;
  const email = emailR.getResponseText().trim();

  // ── 7. Start Date ────────────────────────────────────────
  const dateR = ui.prompt(
    '➕ Add New Agent (7/7)',
    'Start Date (MM/DD/YYYY):\n\nExample: 05/05/2026\nUsed to calculate partial first week.',
    ui.ButtonSet.OK_CANCEL
  );
  if (dateR.getSelectedButton() !== ui.Button.OK) return;
  const startDateRaw = dateR.getResponseText().trim();

  let startDate = null;
  if (startDateRaw) {
    const p = startDateRaw.split('/');
    if (p.length === 3) {
      startDate = new Date(Number(p[2]), Number(p[0]) - 1, Number(p[1]));
      if (isNaN(startDate.getTime())) startDate = null;
    }
    if (!startDate) { ui.alert('Invalid date format. Use MM/DD/YYYY.'); return; }
  }

  // ── Auto-assign Agent ID (max existing + 1) ──────────────
  const lastRow = sh.getLastRow();
  let newId = 1;
  if (lastRow >= 4) {
    const ids = sh.getRange(4, AG_COL.AGENT_ID, lastRow - 3, 1).getValues()
      .flat().map(v => Number(v)).filter(v => v > 0 && Number.isFinite(v));
    if (ids.length > 0) newId = Math.max(...ids) + 1;
  }

  // ── Confirmation summary ──────────────────────────────────
  const confirmMsg =
    `New Agent Summary:\n\n` +
    `  ID:         ${newId}\n` +
    `  Name:       ${agentName}\n` +
    `  Campaign:   ${campaign || '(blank)'}\n` +
    `  Department: ${department || '(blank)'}\n` +
    `  Shift:      ${shift || '(blank)'}\n` +
    `  Rule Key:   ${ruleKey || '(none)'}\n` +
    `  Email:      ${email || '(none)'}\n` +
    `  Start Date: ${startDateRaw || '(none)'}\n\n` +
    `Add this agent to the Agents sheet?`;

  const confirm = ui.alert('Confirm New Agent', confirmMsg, ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  // ── Write to Agents sheet ─────────────────────────────────
  const writeRow = lastRow < 4 ? 4 : lastRow + 1;
  const rowData  = [
    newId, agentName, campaign, department,
    shift, ruleKey, email, startDate || '', '',
  ];
  sh.getRange(writeRow, 1, 1, AG_COL.LAST_COL).setValues([rowData]);
  if (startDate) sh.getRange(writeRow, AG_COL.START_DATE).setNumberFormat('MM/DD/YYYY');
  if (writeRow % 2 === 1) sh.getRange(writeRow, 1, 1, AG_COL.LAST_COL).setBackground(BRAND.altRow);

  SpreadsheetApp.flush();
  ui.alert(
    `✅ Agent Added!\n\n` +
    `${agentName} (ID #${newId}) is now in the Agents sheet.\n\n` +
    `They will appear in the next week you add via "Add New Week".`
  );
}


/**
 * onOpen (v2 — replaces original)
 * Adds the full menu including Paystubs submenu and Agent Breakdown.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💼 JOI Payroll')
    // ── Core workflow ────────────────────────────────────────
    .addItem('➕  Add New Week',               'addNewWeek')
    .addItem('👤  Add New Agent',              'addNewAgent')
    .addItem('🔵  Mark Week as Complete',      'markWeekAsComplete')
    .addItem('🔓  Unlock Completed Week',      'unlockCompletedWeek')
    .addItem('✅  Mark Pay Period as PAID',    'markPayPeriodAsPaid')
    .addSeparator()
    .addItem('📋  Week Status Overview',       'weekStatusOverview')
    .addItem('🔄  Refresh Dashboard',          'refreshDashboard')
    .addSeparator()
    // ── Paystubs submenu ─────────────────────────────────────
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('📄  Paystubs')
        .addItem('📄  Generate All Paystubs',     'generateAllPaystubs')
        .addItem('📧  Email All Paystubs',         'emailAllPaystubs')
        .addSeparator()
        .addItem('📄  Generate One Agent Paystub', 'generateOnePaystub')
    )
    // ── Agent Breakdown ──────────────────────────────────────
    .addItem('🔍  Agent Payroll Breakdown',    'agentPayrollBreakdown')
    .addSeparator()
    // ── Admin submenu ─────────────────────────────────────────
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('⚙️  Admin')
        .addItem('🚀  First-Time Setup',           'firstTimeSetup')
        .addSeparator()
        .addItem('🔧  Fix Pay Rules Data',          'fixPayRulesData')
        .addItem('👥  Rebuild Agents Sheet',        'ensureAgentsSheet')
        .addItem('🎓  Rebuild Alumni Sheet',        'ensureAlumniSheet')
        .addItem('📋  Rebuild Payroll Run Sheet',   'ensurePayrollRunSheet')
        .addSeparator()
        .addItem('📅  Sync Monthly Sheet…',         'syncMonthlySheetPrompt')
        .addItem('🏠  Rebuild Dashboard',           'ensureDashboardSheet')
        .addSeparator()
        .addItem('⚠️  Unlock PAID Period',          'unlockPayPeriod')
        .addItem('✔️   Validate Pay Rules',          'validatePayRulesDialog')
    )
    .addToUi();
}
