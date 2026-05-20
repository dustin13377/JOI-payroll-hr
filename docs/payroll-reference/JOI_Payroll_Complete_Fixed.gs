/**
 * ============================================================
 *  JOI PAYROLL SYSTEM  —  VERSION 9  (PAYSTUB FIXES APPLIED)
 *  Fresh rebuild based on full analysis of original file
 *  Build decisions locked May 4, 2026
 *
 *  PAYSTUB FIXES (May 5, 2026):
 *  FIX-01  hideBorders_(agTbl) added — removes cell borders from agent info table
 *  FIX-02  KPI BONUS column width: 50 → 68pt
 *  FIX-03  VAC/SPIFF column width: 75 → 108pt
 *  FIX-04  Columns 0,3,4,5 rebalanced — total 563pt
 *  FIX-05  cleanWeekLabel_ now receives weekRange for year extraction
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

const SH = {
  DASHBOARD   : 'Dashboard',
  PAY_RULES   : 'Pay Rules',
  AGENTS      : 'Agents',
  ALUMNI      : 'Alumni',
  PAYROLL_RUN : 'Payroll Run',
};

function monthSheetName_(monthName, year) {
  return `${monthName} ${String(year).slice(-2)} PayRoll`;
}

const BRAND = {
  headerBg      : '#1a1a2e',
  headerFg      : '#FFFFFF',
  accentBg      : '#16213e',
  accentFg      : '#e94560',
  unpaidBg      : '#FFF9C4',
  unpaidFg      : '#7a4f00',
  completeBg    : '#E3F2FD',
  completeFg    : '#1565C0',
  paidBg        : '#E8F5E9',
  paidFg        : '#2E7D32',
  frozenBg      : '#F5F5F5',
  frozenFg      : '#9E9E9E',
  sectionBg     : '#16213e',
  sectionFg     : '#FFFFFF',
  colHeaderBg   : '#F4A623',
  colHeaderFg   : '#1a1a2e',
  altRow        : '#F8F9FA',
  blockBg       : '#2d2d2d',
  blockFg       : '#FFFFFF',
  totalsBg      : '#1a1a2e',
  totalsFg      : '#e94560',
  borderColor   : '#DADCE0',
};

function payPeriodCode_(endDate) {
  const d = (endDate instanceof Date) ? endDate : new Date(endDate);
  const month = d.toLocaleString('en-US', { month: 'long' }).toUpperCase();
  const year  = String(d.getFullYear()).slice(-2);
  const half  = d.getDate() <= 15 ? 'PP1' : 'PP2';
  return `${month}${year}${half}`;
}

function payPeriodLabel_(code) {
  let m = code.match(/^([A-Z]+?)(\d{2})(PP[12])$/);
  if (m) {
    const month = m[1].charAt(0) + m[1].slice(1).toLowerCase();
    const year  = '20' + m[2];
    const pp    = m[3] === 'PP1' ? 'Pay Period 1' : 'Pay Period 2';
    return `${month} ${year} — ${pp}`;
  }
  m = code.match(/^([A-Z]+?)(PP[12])$/);
  if (m) {
    const month = m[1].charAt(0) + m[1].slice(1).toLowerCase();
    const pp    = m[2] === 'PP1' ? 'Pay Period 1' : 'Pay Period 2';
    return `${month} — ${pp}`;
  }
  return code;
}

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
  STATUS         : 19,
  PAY_PERIOD     : 20,
  MEMO           : 21,
  LAST_COL       : 21,
};

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

const MO_WEEK_OFFSET = 4;
const MO_COL = {
  weekStart : (weekNum) => (weekNum - 1) * MO_WEEK_OFFSET + 1,
  ID        : (weekNum) => (weekNum - 1) * MO_WEEK_OFFSET + 1,
  NAME      : (weekNum) => (weekNum - 1) * MO_WEEK_OFFSET + 2,
  PAY       : (weekNum) => (weekNum - 1) * MO_WEEK_OFFSET + 3,
  NOTES     : (weekNum) => (weekNum - 1) * MO_WEEK_OFFSET + 4,
  PP1_TOTAL : 17,
  PP2_TOTAL : 18,
  GRAND     : 19,
  LAST_COL  : 19,
};

const STATUS = {
  UNPAID   : '🟡 UNPAID',
  COMPLETE : '🔵 COMPLETE',
  PAID     : '✅ PAID',
};

function normalizeRuleKey_(rk) {
  if (!rk) return '';
  return rk
    .toString()
    .toUpperCase()
    .replace(/\s*\|\s*/g, '|')
    .replace(/\bRECUIRTMENT\b/g, 'RECRUITMENT')
    .replace(/\bRECUITMENT\b/g,  'RECRUITMENT')
    .replace(/\s+$/, '')
    .replace(/^\s+/, '')
    .trim();
}

function cleanText_(v) {
  if (v === null || v === undefined) return '';
  return v.toString().trim();
}

function fmt_(n) {
  if (n === null || n === undefined || n === '') return '$0.00';
  const num = parseFloat(n);
  if (isNaN(num)) return '$0.00';
  return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function getOrCreateSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

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

function currentPayPeriodCode_() {
  return payPeriodCode_(new Date());
}

function parseDate_(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate_(d) {
  if (!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }


// ─────────────────────────────────────────────────────────────
//  LAYER 2 — PAY RULES SHEET
// ─────────────────────────────────────────────────────────────

function ensurePayRulesSheet() {
  const ss = ss_();
  const sh = getOrCreateSheet_(ss, SH.PAY_RULES);
  sh.clearFormats();

  const numCols = RULE_COL.LAST_COL;

  sh.setRowHeight(1, 8);

  writeBanner_(sh, '⚡ PAY RULES & COMPENSATION STRUCTURE', 2, numCols);

  writeColHeaders_(sh, 3, [
    'Rule Key', 'Campaign', 'Department', 'Shift',
    'Full Attend Days', 'Weekly Base Pay', 'Daily Salary',
    'KPI Bonus', 'Missed Day Deduction', 'Overtime Day Pay',
    'Sunday Bonus', 'Vacation Premium %',
  ]);

  sh.setFrozenRows(3);

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

  const payRange = sh.getRange(4, RULE_COL.WEEKLY_BASE, 100, 6);
  payRange.setNumberFormat('$#,##0.00');

  SpreadsheetApp.flush();
  Logger.log('Pay Rules sheet structure ready.');
}

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
    if (!rk) return;

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

    const fixed = normalizeRuleKey_(rk);
    if (fixed !== rk) {
      data[i][RULE_COL.RULE_KEY - 1] = fixed;
      fixCount++;
    }

    const dept = cleanText_(row[RULE_COL.DEPARTMENT - 1]);
    const deptFixed = dept.replace(/\bRecuirtment\b/gi, 'Recruitment').trimEnd();
    if (deptFixed !== dept) {
      data[i][RULE_COL.DEPARTMENT - 1] = deptFixed;
      fixCount++;
    }

    const base = row[RULE_COL.WEEKLY_BASE - 1];
    if (typeof base === 'string' && base.trim() !== '') {
      const num = parseFloat(base.replace(/[$,]/g, ''));
      if (!isNaN(num)) {
        data[i][RULE_COL.WEEKLY_BASE - 1] = num;
        fixCount++;
      }
    }

    const ded = row[RULE_COL.MISSED_DED - 1];
    if (typeof ded === 'number') {
      const rounded = Math.round(ded * 100) / 100;
      if (rounded !== ded) {
        data[i][RULE_COL.MISSED_DED - 1] = rounded;
        fixCount++;
      }
    }

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

  sh.getRange(4, AG_COL.AGENT_ID,   200, 1).setNumberFormat('0');
  sh.getRange(4, AG_COL.START_DATE, 200, 1).setNumberFormat('MM/DD/YYYY');

  SpreadsheetApp.flush();
  Logger.log('Agents sheet structure ready.');
}

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

function ensurePayrollRunSheet() {
  const ss = ss_();
  const sh = getOrCreateSheet_(ss, SH.PAYROLL_RUN);

  sh.setRowHeight(1, 8);

  writeBanner_(sh, '📋 PAYROLL RUN — WEEKLY DATA', 2, PR_COL.LAST_COL);

  writeColHeaders_(sh, 3, [
    'Agent ID', 'Agent Name', 'Rule Key', 'Include', 'Missed Days',
    'OT Days', 'Sundays', 'Vacation Days', 'KPI ✓',
    'Weekly Base Pay', 'KPI Bonus', 'Missed Deduction',
    'Overtime Pay', 'Sunday Pay', 'Vacation Pay', 'Extra Bonus',
    'Total Pay', 'Partial Week', 'Status', 'Pay Period', 'Memo',
  ]);

  sh.setFrozenRows(3);

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

function writeBlockHeader_(sh, row, weekLabel, startDate, endDate, status, ppCode) {
  const dateRange = `${fmtDate_(startDate)} – ${fmtDate_(endDate)}`;
  const rowVals   = new Array(PR_COL.LAST_COL).fill('');
  rowVals[PR_COL.AGENT_ID   - 1] = weekLabel;
  rowVals[PR_COL.AGENT_NAME - 1] = dateRange;
  rowVals[PR_COL.STATUS     - 1] = status;
  rowVals[PR_COL.PAY_PERIOD - 1] = ppCode;

  sh.getRange(row, 1, 1, PR_COL.LAST_COL).setValues([rowVals]);

  sh.getRange(row, 1, 1, PR_COL.LAST_COL)
    .setBackground(BRAND.blockBg)
    .setFontColor(BRAND.blockFg)
    .setFontWeight('bold')
    .setFontSize(10);

  applyStatusColor_(sh.getRange(row, PR_COL.STATUS), status);
  sh.setRowHeight(row, 26);
}

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
  const partial  = Number(inputs.partialWeek  || 0);

  const weeklyBase  = rule.weeklyBase;
  const missedDed   = Math.round(missed   * rule.missedDed   * 100) / 100;
  const overtimePay = Math.round(overtime * rule.overtimePay * 100) / 100;
  const sundayPay   = Math.round(sundays  * rule.sundayBonus * 100) / 100;
  const kpiBonus    = kpi ? rule.kpiBonus : 0;

  const vacationPay = Math.round(vacation * rule.dailySalary * (1 + rule.vacationPct) * 100) / 100;

  let totalPay;
  if (partial > 0) {
    totalPay = Math.round((partial * rule.dailySalary + overtimePay + sundayPay + extra) * 100) / 100;
  } else {
    totalPay = Math.round(
      (weeklyBase - missedDed + kpiBonus + overtimePay + sundayPay + vacationPay + extra) * 100
    ) / 100;
  }

  return { weeklyBase, kpiBonus, missedDed, overtimePay, sundayPay, vacationPay, extraBonus: extra, totalPay };
}

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

  sh.getRange(rowNum, PR_COL.WEEKLY_BASE, 1, 8).setNumberFormat('$#,##0.00');

  applyStatusColor_(sh.getRange(rowNum, PR_COL.STATUS), status);

  sh.setRowHeight(rowNum, 22);
}

function refreshPayrollRunTotals_() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) return;

  const lastRow = sh.getLastRow();

  let lastDataRow = 3;
  for (let r = 4; r <= lastRow; r++) {
    const v = cleanText_(sh.getRange(r, PR_COL.AGENT_ID).getValue());
    if (v.toUpperCase().includes('TOTAL')) {
      sh.getRange(r, 1, lastRow - r + 1, PR_COL.LAST_COL).clearContent().clearFormat();
      break;
    }
    if (v !== '') lastDataRow = r;
  }

  let totalPaid   = 0;
  let totalUnpaid = 0;
  let totalComplete = 0;

  const data = sh.getRange(4, 1, lastDataRow - 3, PR_COL.LAST_COL).getValues();
  data.forEach(row => {
    const status = cleanText_(row[PR_COL.STATUS - 1]);
    const pay    = Number(row[PR_COL.TOTAL_PAY - 1]) || 0;
    const id     = row[PR_COL.AGENT_ID - 1];

    if (typeof id !== 'number' && isNaN(parseFloat(id))) return;

    if (status === STATUS.PAID)     totalPaid     += pay;
    else if (status === STATUS.COMPLETE) totalComplete += pay;
    else                                 totalUnpaid   += pay;
  });

  const totalsRow = lastDataRow + 2;

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
        lastDataRow  : null,
      });
    }
  });

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

function ensureMonthlySheet(monthName, year) {
  const ss = ss_();
  const name = monthSheetName_(monthName, year);
  const sh   = getOrCreateSheet_(ss, name);
  sh.clear();

  const numCols = MO_COL.LAST_COL;

  sh.setRowHeight(1, 8);

  writeBanner_(sh, `📅 ${monthName.toUpperCase()} ${year} — MONTHLY PAY SHEET`, 2, numCols);

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

  const colHeaders = [];
  for (let w = 1; w <= 4; w++) {
    colHeaders.push('ID', 'Agent Name', 'Weekly Pay', 'Notes');
  }
  colHeaders.push('PP1 Total', 'PP2 Total', 'Grand Total');

  writeColHeaders_(sh, 4, colHeaders);
  sh.setFrozenRows(4);

  for (let w = 1; w <= 4; w++) {
    const base = MO_COL.weekStart(w);
    sh.setColumnWidth(base,     55);
    sh.setColumnWidth(base + 1, 150);
    sh.setColumnWidth(base + 2, 95);
    sh.setColumnWidth(base + 3, 130);
  }
  sh.setColumnWidth(MO_COL.PP1_TOTAL, 95);
  sh.setColumnWidth(MO_COL.PP2_TOTAL, 95);
  sh.setColumnWidth(MO_COL.GRAND,     105);

  SpreadsheetApp.flush();
  Logger.log(`Monthly sheet "${name}" structure ready.`);
  return sh;
}

function syncMonthlySheetFromPayrollRun(monthName, year) {
  const ss   = ss_();
  const sh   = ensureMonthlySheet(monthName, year);
  const shPR = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!shPR) {
    SpreadsheetApp.getUi().alert('Payroll Run sheet not found.');
    return;
  }

  const allBlocks = getPayrollRunBlocks_();
  const monthUpper = monthName.toUpperCase().slice(0, 3);
  const fullUpper  = monthName.toUpperCase();

  const monthBlocks = allBlocks.filter(b => {
    const pp = b.ppCode.toUpperCase();
    return pp.startsWith(fullUpper) || pp.startsWith(monthUpper);
  });

  if (monthBlocks.length === 0) {
    SpreadsheetApp.getUi().alert(`No payroll blocks found for ${monthName} ${year}.`);
    return;
  }

  const agentIds = new Set();
  const weekData = {};

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

  const sortedIds = Array.from(agentIds).sort((a, b) => a - b);
  const firstDataRow = 5;

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

    for (let w = 1; w <= 4; w++) {
      sh.getRange(rowNum, MO_COL.PAY(w)).setNumberFormat('$#,##0.00');
    }
    sh.getRange(rowNum, MO_COL.PP1_TOTAL, 1, 3).setNumberFormat('$#,##0.00');

    if (i % 2 === 1) {
      sh.getRange(rowNum, 1, 1, MO_COL.LAST_COL).setBackground(BRAND.altRow);
    }
    sh.setRowHeight(rowNum, 22);
  });

  const lastAgentRow = firstDataRow + sortedIds.length - 1;

  const summaryStartRow = lastAgentRow + 3;
  buildMonthlySummary_(sh, summaryStartRow, monthBlocks, weekData, sortedIds, monthName, year);

  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(`✅ ${monthName} ${year} monthly sheet synced successfully.`);
}

function buildMonthlySummary_(sh, startRow, monthBlocks, weekData, sortedIds, monthName, year) {
  let r = startRow;
  const numCols = MO_COL.LAST_COL;

  sh.getRange(r, 1, 1, numCols).merge()
    .setValue(`📊 PAY PERIOD SUMMARY — ${monthName.toUpperCase()} ${year} PAYROLL`)
    .setBackground(BRAND.sectionBg)
    .setFontColor(BRAND.sectionFg)
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('center');
  sh.setRowHeight(r, 32);
  r++;

  const pp1Status = (monthBlocks[0] && monthBlocks[0].status) || STATUS.UNPAID;
  const pp2Status = (monthBlocks[2] && monthBlocks[2].status) || STATUS.UNPAID;

  sh.getRange(r, 1, 1, 5).merge().setValue(`PAY PERIOD 1  ${pp1Status}`)
    .setBackground(BRAND.colHeaderBg).setFontColor(BRAND.colHeaderFg).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(r, 6, 1, 5).merge().setValue(`PAY PERIOD 2  ${pp2Status}`)
    .setBackground(BRAND.colHeaderBg).setFontColor(BRAND.colHeaderFg).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(r, 11, 1, 3).merge().setValue('TOTALS')
    .setBackground(BRAND.headerBg).setFontColor(BRAND.headerFg).setFontWeight('bold').setHorizontalAlignment('center');
  r++;

  const sumHeaders = ['ID', 'Agent Name', 'Week 1', 'Week 2', 'PP1 Total',
                      'ID', 'Agent Name', 'Week 3', 'Week 4', 'PP2 Total',
                      'Grand Total', 'Status'];
  writeColHeaders_(sh, r, sumHeaders);
  r++;

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

  sh.getRange(r, 1, 1, numCols)
    .setBackground(BRAND.totalsBg)
    .setFontColor(BRAND.totalsFg)
    .setFontWeight('bold');
  sh.getRange(r, 1).setValue('GRAND TOTAL (payable)');
  sh.getRange(r, 11).setValue(grandTotal).setNumberFormat('$#,##0.00').setFontWeight('bold');
  sh.setRowHeight(r, 28);
}

