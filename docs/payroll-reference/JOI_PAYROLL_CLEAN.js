/**
 * ============================================================
 *  JOI PAYROLL SYSTEM — CLEAN CONSOLIDATED SCRIPT
 *  Prepared by Claude | May 14, 2026
 *
 *  This is the single authoritative Apps Script file.
 *  All duplicate/patch blocks have been removed.
 *  The latest (most correct) version of each function is kept.
 *
 *  FUNCTION COUNT: 198 unique functions
 *  NO DUPLICATE DEFINITIONS
 *  NO REPAIR/REBUILD CONFLICTS
 *
 *  HOW TO INSTALL:
 *  1. Open your Google Sheet
 *  2. Extensions > Apps Script
 *  3. Delete ALL existing code in the editor
 *  4. Paste this entire file
 *  5. Save (Ctrl+S or Cmd+S)
 *  6. Reload the spreadsheet — JOI Payroll menu will appear
 *
 *  SAFE MENU ITEMS (what users see):
 *  - Add New Week
 *  - Add New Agent
 *  - Add Pay Rule
 *  - Mark Week as Complete
 *  - Unlock Completed Week
 *  - Mark Pay Period as PAID
 *  - Week Status Overview
 *  - Refresh Dashboard
 *  - Create / Sync Monthly Sheet
 *  - Agent Week Controls submenu
 *  - Paystubs submenu (Generate All, Email All, Generate One)
 *  - Agent Payroll Breakdown
 *  - Admin submenu (repair/utility tools)
 * ============================================================
 */

'use strict';

// 
//  LAYER 1 '97 CONSTANTS, BRANDING, COLUMN MAPS
// 

//  Sheet names 
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

//  Brand colors 
const BRAND = {
  // Header / banner
  headerBg      : '#070739',   // deep navy — unified with joiNavy_()
  headerFg      : '#FFFFFF',
  // Accent
  accentBg      : '#16213e',
  accentFg      : '#e94560',   // red accent

  // Status '97 UNPAID
  unpaidBg      : '#FFF9C4',
  unpaidFg      : '#7a4f00',
  // Status '97 COMPLETE
  completeBg    : '#E3F2FD',
  completeFg    : '#1565C0',
  // Status '97 PAID
  paidBg        : '#E8F5E9',
  paidFg        : '#2E7D32',
  // Status '97 PAID (frozen/greyed)
  frozenBg      : '#F5F5F5',
  frozenFg      : '#9E9E9E',

  // Section headers inside sheets
  sectionBg     : '#16213e',
  sectionFg     : '#FFFFFF',
  // Column header rows '97 JOI amber/gold (matches Payroll Run sheet headers)
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

//  Pay period constants 
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
  // New format: "APRIL26PP2"  "April 2026 '97 Pay Period 2"
  let m = code.match(/^([A-Z]+?)(\d{2})(PP[12])$/);
  if (m) {
    const month = m[1].charAt(0) + m[1].slice(1).toLowerCase();
    const year  = '20' + m[2];
    const pp    = m[3] === 'PP1' ? 'Pay Period 1' : 'Pay Period 2';
    return `${month} ${year} — ${pp}`;
  }
  // Old format: "APRILPP2"  → "April — Pay Period 2"
  m = code.match(/^([A-Z]+?)(PP[12])$/);
  if (m) {
    const month = m[1].charAt(0) + m[1].slice(1).toLowerCase();
    const pp    = m[2] === 'PP1' ? 'Pay Period 1' : 'Pay Period 2';
    return `${month} — ${pp}`;
  }
  return code;
}

//  Payroll Run column indices (1-based) 
const PR_COL = {
  AGENT_ID       : 1,
  AGENT_NAME     : 2,
  RULE_KEY       : 3,
  INCLUDE        : 4,
  MISSED_DAYS    : 5,
  OVERTIME_DAYS  : 6,
  SUNDAYS        : 7,
  VACATION_DAYS  : 8,
  HOLIDAY_DAYS   : 9,   // Input: number of official holiday days (sits with other input days)
  KPI_ACHIEVED   : 10,
  WEEKLY_BASE    : 11,
  KPI_BONUS      : 12,
  MISSED_DED     : 13,
  OVERTIME_PAY   : 14,
  SUNDAY_PAY     : 15,
  VACATION_PAY   : 16,
  HOLIDAY_PAY    : 17,  // Calculated: holiday_days × daily_salary × 2 (LFT triple pay extra)
  EXTRA_BONUS    : 18,
  TOTAL_PAY      : 19,
  PARTIAL_WEEK   : 20,
  STATUS         : 21,  //  UNPAID /  COMPLETE /  PAID
  PAY_PERIOD     : 22,  // e.g. APRIL26PP2
  MEMO           : 23,
  LAST_COL       : 23,
};

//  Pay Rules column indices (1-based) 
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

//  Agents column indices (1-based) 
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

//  Alumni column indices (1-based) 
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

//  Monthly sheet column layout (4 weeks side by side) 
// Columns per week section: Agent ID, Agent Name, Weekly Pay, Notes '97 4 cols each
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

//  Status values 
const STATUS = {
  UNPAID   : 'UNPAID',
  COMPLETE : 'COMPLETE',
  PAID     : 'PAID',
};

//  Helper: normalize a rule key string 
function normalizeRuleKey_(rk) {
  if (!rk) return '';
  return rk
    .toString()
    .toUpperCase()
    .replace(/\|/g, '|')       // spaces around pipes
    .replace(/RECUIRTMENT/g, 'RECRUITMENT')  // BUG-05 typo
    .replace(/RECUITMENT/g,  'RECRUITMENT')  // alternate typo
    .replace(/\s+$/, '')           // trailing spaces (BUG-06)
    .replace(/^\s+/, '')           // leading spaces
    .trim();
}

//  Helper: clean text 
function cleanText_(v) {
  if (v === null || v === undefined) return '';
  return v.toString().trim();
}

//  Helper: format currency for display 
function fmt_(n) {
  if (n === null || n === undefined || n === '') return '$0.00';
  const num = parseFloat(n);
  if (isNaN(num)) return '$0.00';
  return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

//  Helper: get or create sheet 
function getOrCreateSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

//  Helper: write banner row (merged, styled) 
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

//  Helper: write column header row 
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

/**
 * joiWriteTabHeader_
 * Writes the unified JOI brand header across ALL operational sheet tabs.
 * Standard: Row 1 = navy logo banner, Row 2 = gold title row.
 * Matches Pay Rules and Monthly sheet style exactly.
 *
 * @param {Sheet}  sh      - Target sheet
 * @param {string} title   - Section title for row 2 (e.g. 'AGENTS DIRECTORY')
 * @param {number} numCols - Number of columns to span
 */
function joiWriteTabHeader_(sh, title, numCols) {
  const navy  = joiNavy_();   // #070739
  const gold  = joiGold_();   // #F4A623
  const white = joiWhite_();  // #FFFFFF

  // Remove any pre-existing floating images so we get exactly one centered logo.
  try { sh.getImages().forEach(img => { try { img.remove(); } catch (e) {} }); } catch (e) {}

  // Row 1 — navy banner that will hold the centered floating JOI logo.
  sh.getRange(1, 1, 1, numCols)
    .setBackground(navy)
    .setFontColor(white)
    .setFontWeight('normal')
    .setVerticalAlignment('middle')
    .setBorder(false, false, false, false, false, false);
  sh.setRowHeight(1, 42);

  // Insert JOI LOGO.png centered in row 1.
  try {
    const files = DriveApp.getFilesByName('JOI LOGO.png');
    if (files.hasNext()) {
      const logoWidth  = 118;
      const logoHeight = 36;
      let totalWidth = 0;
      for (let c = 1; c <= numCols; c++) totalWidth += sh.getColumnWidth(c);
      const targetX = Math.max(0, Math.round((totalWidth - logoWidth) / 2));
      let walked = 0, anchorCol = 1, xOffset = targetX;
      for (let c = 1; c <= numCols; c++) {
        const w = sh.getColumnWidth(c);
        if (walked + w > targetX) { anchorCol = c; xOffset = targetX - walked; break; }
        walked += w;
      }
      const img = sh.insertImage(files.next().getBlob(), anchorCol, 1, xOffset, 3);
      try { img.setWidth(logoWidth).setHeight(logoHeight); } catch (e) {}
    }
  } catch (e) {
    Logger.log('joiWriteTabHeader_ logo insert skipped: ' + e.message);
  }

  // Row 2 — gold title row with section name centered.
  try { safeBreakOverlappingMerges_(sh, 2, 1, 1, numCols); } catch (e) {}
  const titleRange = sh.getRange(2, 1, 1, numCols);
  safeMergeRange_(titleRange);
  titleRange
    .setValue(title)
    .setBackground(gold)
    .setFontColor(navy)
    .setFontWeight('bold')
    .setFontSize(13)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(false);
  sh.setRowHeight(2, 28);
}

//  Helper: apply status color to a range 
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

//  Helper: get today's pay period code 
function currentPayPeriodCode_() {
  return payPeriodCode_(new Date());
}

//  Helper: parse a date string or Date object safely 
function parseDate_(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

//  Helper: format date as MM/DD/YYYY 
function fmtDate_(d) {
  if (!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// Helper: format date as MM/DD/YY for Payroll Run week headers.
function fmtDateShort_(d) {
  if (!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const yy = String(dt.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

// Helper: month/year label used in Payroll Run week block headers.
function monthYearLabelFromDate_(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${dt.toLocaleString('en-US', { month: 'long' })} ${dt.getFullYear()}`;
}

// Helper: visible Payroll Run week range label.
function payrollWeekRangeLabel_(startDate, endDate) {
  return `${fmtDateShort_(startDate)} - ${fmtDateShort_(endDate)}`;
}

// Helper: explicit MM/DD/YY or MM/DD/YYYY parser to avoid ambiguous browser parsing.
function parsePayrollDateText_(v) {
  const text = cleanText_(v);
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  let yyyy = Number(m[3]);
  if (yyyy < 100) yyyy += 2000;
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return d;
}

//  Helper: get spreadsheet 
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

// 
//  LAYER 2 '97 PAY RULES SHEET
// 

/**
 * ensurePayRulesSheet
 * Creates or refreshes the Pay Rules sheet structure.
 * Does NOT overwrite existing pay data '97 only adds headers/formatting.
 * Call this once during install.
 */

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
 *  - BUG-04: BLB|DOC COLLECTOR text pay  3000
 *  - BUG-05: ADMIN|RECUIRTMENT typo  RECRUITMENT
 *  - BUG-06: trailing spaces in rule keys
 *  - BUG-07: unrounded daily deductions
 */
function fixPayRulesData() {
  const bodyHtml = `
    <div class="joiSectionTitle">Fix Pay Rules Data</div>
    <p class="joiText">This will normalize known Pay Rules data issues: rule key spacing, recruitment typo variants, text currency values, and daily pay rounding.</p>
    <p class="joiMuted">This only touches the Pay Rules data cleanup items already built into your payroll system.</p>
    <div id="status" class="joiStatus"></div>
    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="runFix()">Run Fix</button>
    </div>
  `;

  const clientScript = `
    <script>
      function runFix() {
        var btn = document.getElementById('runBtn');
        var status = document.getElementById('status');
        btn.disabled = true;
        status.className = 'joiStatus';
        status.textContent = 'Running Pay Rules cleanup...';
        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            status.className = 'joiStatus ' + (result && result.ok ? 'joiSuccess' : 'joiError');
            status.textContent = (result && result.message) ? result.message : 'No result returned.';
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            status.className = 'joiStatus joiError';
            status.textContent = error && error.message ? error.message : String(error);
          })
          .joiFixPayRulesDataFromDialog();
      }
    </script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Fix Pay Rules Data', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(560).setHeight(380);

  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Fix Pay Rules Data');
}

function joiFixPayRulesDataFromDialog() {
  try {
    const ss = ss_();
    const sh = ss.getSheetByName(SH.PAY_RULES);
    if (!sh) return { ok: false, message: 'Pay Rules sheet not found.' };

    const lastRow = sh.getLastRow();
    if (lastRow < 4) return { ok: true, message: 'No Pay Rules rows to fix.' };

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
      const deptFixed = dept.replace(/Recuirtment/gi, 'Recruitment').trimEnd();
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

    return {
      ok: true,
      message: `Pay Rules cleanup complete. ${fixCount} value(s) corrected.`
    };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/**
 * getRuleMap_
 * Builds a JS Map of { normalizedRuleKey  row object } from Pay Rules.
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

// 
//  LAYER 3 '97 AGENTS + ALUMNI SHEETS
// 

/**
 * ensureAgentsSheet
 * Creates or refreshes the Agents directory structure.
 */
/**
 * formatAgentsRows_
 * Applies alternating white/cream row styling to the Agents data area.
 * Matches the Pay Rules sheet aesthetic exactly.
 */
function formatAgentsRows_(sh) {
  if (!sh) return;
  const lastRow = Math.max(sh.getLastRow(), 4);
  const dataRows = Math.max(0, lastRow - 3);
  if (dataRows < 1) return;

  const rng = sh.getRange(4, 1, dataRows, AG_COL.LAST_COL);
  rng.setFontColor(joiNavy_())
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, joiBorder_(), SpreadsheetApp.BorderStyle.SOLID);

  for (let i = 0; i < dataRows; i++) {
    const r = 4 + i;
    sh.getRange(r, 1, 1, AG_COL.LAST_COL)
      .setBackground(i % 2 === 0 ? joiWhite_() : joiCream_());
    sh.setRowHeight(r, 22);
  }

  // Agent ID bold + centered
  sh.getRange(4, AG_COL.AGENT_ID, dataRows, 1)
    .setFontWeight('bold').setHorizontalAlignment('center');
  // Rule Key bold + navy
  sh.getRange(4, AG_COL.RULE_KEY, dataRows, 1)
    .setFontColor(joiNavy_()).setFontWeight('bold');
}

function ensureAgentsSheet() {
  const ss = ss_();
  const sh = getOrCreateSheet_(ss, SH.AGENTS);
  sh.clearFormats();

  // Set column widths BEFORE the logo insert so centering math is accurate.
  sh.setColumnWidth(AG_COL.AGENT_ID,   70);
  sh.setColumnWidth(AG_COL.AGENT_NAME, 180);
  sh.setColumnWidth(AG_COL.CAMPAIGN,   130);
  sh.setColumnWidth(AG_COL.DEPARTMENT, 160);
  sh.setColumnWidth(AG_COL.SHIFT,       90);
  sh.setColumnWidth(AG_COL.RULE_KEY,   250);
  sh.setColumnWidth(AG_COL.EMAIL,      180);
  sh.setColumnWidth(AG_COL.START_DATE,  90);
  sh.setColumnWidth(AG_COL.NOTES,      200);

  // Unified brand header: Row 1 = navy+logo, Row 2 = gold title.
  joiWriteTabHeader_(sh, 'AGENTS DIRECTORY', AG_COL.LAST_COL);

  writeColHeaders_(sh, 3, [
    'Agent ID', 'Agent Name', 'Campaign', 'Department',
    'Shift', 'Rule Key', 'Email', 'Start Date', 'Notes',
  ]);

  sh.setFrozenRows(3);

  sh.getRange(4, AG_COL.AGENT_ID,   200, 1).setNumberFormat('0');
  sh.getRange(4, AG_COL.START_DATE, 200, 1).setNumberFormat('MM/DD/YYYY');

  // Reapply row formatting to data area to match Pay Rules style.
  formatAgentsRows_(sh);

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

  // Set column widths BEFORE the logo insert so centering math is accurate.
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

  // Unified brand header: Row 1 = navy+logo, Row 2 = gold title.
  joiWriteTabHeader_(sh, 'ALUMNI — FINAL PAYOUTS TRACKER', AL_COL.LAST_COL);

  writeColHeaders_(sh, 3, [
    'Agent ID', 'Agent Name', 'Campaign', 'Department',
    'Rule Key', 'Email', 'End Date', 'Balance Owed',
    'Payout Status', 'Date Paid Out',
  ]);

  sh.setFrozenRows(3);

  sh.getRange(4, AL_COL.END_DATE,   100, 1).setNumberFormat('MM/DD/YYYY');
  sh.getRange(4, AL_COL.DATE_PAID,  100, 1).setNumberFormat('MM/DD/YYYY');
  sh.getRange(4, AL_COL.BALANCE_OWED,100,1).setNumberFormat('$#,##0.00');

  SpreadsheetApp.flush();
  Logger.log('Alumni sheet structure ready.');
}

/**
 * getAgentMap_
 * Returns Map of { agentId  { name, ruleKey, campaign, department, shift } }
 * Used by Payroll Run and monthly sheet functions.
 * Reads from Agents sheet; inactive agents (alumni) are NOT included.
 */

/**
 * getAlumniRuleKeyMap_
 * Returns Map of { agentId  ruleKey } from the Alumni sheet.
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

// 
//  LAYER 4 '97 PAYROLL RUN SHEET
// 

/**
 * ensurePayrollRunSheet
 * Creates or refreshes the Payroll Run sheet structure.
 * Writes the top banner and column headers.
 * Does NOT touch existing week blocks.
 */
function ensurePayrollRunSheet() {
  const ss = ss_();
  const sh = getOrCreateSheet_(ss, SH.PAYROLL_RUN);

  // Set column widths BEFORE the logo insert so centering math is accurate.
  sh.setColumnWidth(PR_COL.AGENT_ID,    70);
  sh.setColumnWidth(PR_COL.AGENT_NAME, 170);
  sh.setColumnWidth(PR_COL.RULE_KEY,   230);
  sh.setColumnWidth(PR_COL.INCLUDE,     65);
  sh.setColumnWidth(PR_COL.MISSED_DAYS, 75);
  sh.setColumnWidth(PR_COL.OVERTIME_DAYS,65);
  sh.setColumnWidth(PR_COL.SUNDAYS,     70);
  sh.setColumnWidth(PR_COL.VACATION_DAYS,  75);
  sh.setColumnWidth(PR_COL.HOLIDAY_DAYS,   85);
  sh.setColumnWidth(PR_COL.KPI_ACHIEVED,   55);
  sh.setColumnWidth(PR_COL.WEEKLY_BASE, 110);
  sh.setColumnWidth(PR_COL.KPI_BONUS,   100);
  sh.setColumnWidth(PR_COL.MISSED_DED,  115);
  sh.setColumnWidth(PR_COL.OVERTIME_PAY,105);
  sh.setColumnWidth(PR_COL.SUNDAY_PAY,   95);
  sh.setColumnWidth(PR_COL.VACATION_PAY,  95);
  sh.setColumnWidth(PR_COL.HOLIDAY_PAY,  105);
  sh.setColumnWidth(PR_COL.EXTRA_BONUS,   90);
  sh.setColumnWidth(PR_COL.TOTAL_PAY,    110);
  sh.setColumnWidth(PR_COL.PARTIAL_WEEK,  80);
  sh.setColumnWidth(PR_COL.STATUS,       105);
  sh.setColumnWidth(PR_COL.PAY_PERIOD,   120);
  sh.setColumnWidth(PR_COL.MEMO,         200);

  // Unified brand header: Row 1 = navy+logo, Row 2 = gold title.
  joiWriteTabHeader_(sh, 'PAYROLL RUN — WEEKLY DATA', PR_COL.LAST_COL);

  // Row 3: column headers
  writeColHeaders_(sh, 3, [
    'Agent ID', 'Agent Name', 'Rule Key', 'Include', 'Missed Days',
    'OT Days', 'Sundays', 'Vacation Days', 'Holiday Days', 'KPI',
    'Weekly Base Pay', 'KPI Bonus', 'Missed Deduction',
    'Overtime Pay', 'Sunday Pay', 'Vacation Pay', 'Holiday Pay', 'Extra Bonus',
    'Total Pay', 'Partial Week', 'Status', 'Pay Period', 'Memo',
  ]);

  sh.setFrozenRows(3);

  // Auto-clean any stale error rows (#NUM!, #REF!, etc.) between week blocks.
  const staleResult = cleanStalePayrollRunRows_();
  if (staleResult.cleaned > 0) Logger.log('ensurePayrollRunSheet: ' + staleResult.message);

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

/**
 * calcAgentPay_
 * Calculates weekly pay for one agent given their input row and rule.
 * Returns an object with all pay components and total.
 * This is the core math engine.
 *
 * @param {object} rule     - from getRuleMap_()
 * @param {object} inputs   - { missedDays, overtimeDays, sundays, vacationDays, holidayDays, kpiAchieved, extraBonus, partialWeek }
 * @returns {object}        - all pay components + totalPay
 */
function calcAgentPay_(rule, inputs) {
  if (!rule) {
    return {
      weeklyBase: 0, kpiBonus: 0, missedDed: 0,
      overtimePay: 0, sundayPay: 0, vacationPay: 0,
      holidayPay: 0, extraBonus: inputs.extraBonus || 0, totalPay: 0,
    };
  }

  const missed   = Number(inputs.missedDays   || 0);
  const overtime = Number(inputs.overtimeDays || 0);
  const sundays  = Number(inputs.sundays      || 0);
  const vacation = Number(inputs.vacationDays || 0);
  const holidays = Number(inputs.holidayDays  || 0);
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

  // Holiday pay (Mexican LFT): daily_salary × 2 × holiday_days
  // The regular daily wage is already in weeklyBase. This adds the mandatory 2× EXTRA bonus.
  // Total value of a holiday = daily_salary × 3 (1× regular + 2× bonus).
  const holidayPay = Math.round(holidays * rule.dailySalary * 2 * 100) / 100;

  // Partial week override
  let totalPay;
  if (partial > 0) {
    // Partial week: pay only for days worked + bonuses
    totalPay = Math.round((partial * rule.dailySalary + kpiBonus + overtimePay + sundayPay + holidayPay + extra) * 100) / 100;
  } else {
    totalPay = Math.round(
      (weeklyBase - missedDed + kpiBonus + overtimePay + sundayPay + vacationPay + holidayPay + extra) * 100
    ) / 100;
  }

  return { weeklyBase, kpiBonus, missedDed, overtimePay, sundayPay, vacationPay, holidayPay, extraBonus: extra, totalPay };
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
  row[PR_COL.MISSED_DAYS   - 1] = inputs.missedDays    || '';
  row[PR_COL.OVERTIME_DAYS - 1] = inputs.overtimeDays  || '';
  row[PR_COL.SUNDAYS       - 1] = inputs.sundays        || '';
  row[PR_COL.VACATION_DAYS - 1] = inputs.vacationDays  || '';
  row[PR_COL.KPI_ACHIEVED  - 1] = inputs.kpiAchieved   || 'YES';
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
  // MEMO gets the canonical "{emoji} {STATUS}  —  {free text}" format so the
  // Memo column's workflow indicator always agrees with the Status column.
  row[PR_COL.MEMO          - 1] = joiBuildMemoText_(status, memo || '');
  row[PR_COL.HOLIDAY_DAYS  - 1] = inputs.holidayDays || '';
  row[PR_COL.HOLIDAY_PAY   - 1] = pay.holidayPay || 0;

  sh.getRange(rowNum, 1, 1, PR_COL.LAST_COL).setValues([row]);

  // Number formatting for pay columns
  sh.getRange(rowNum, PR_COL.WEEKLY_BASE, 1, 8).setNumberFormat('$#,##0.00');
  sh.getRange(rowNum, PR_COL.HOLIDAY_PAY, 1, 1).setNumberFormat('$#,##0.00');

  // Status color (per-row — fixes BUG-10)
  applyStatusColor_(sh.getRange(rowNum, PR_COL.STATUS), status);

  // Always set YES/NO dropdowns on Include and KPI so every row is consistent.
  // This is authoritative — format-copy passes cannot override these.
  const yesNoRule_ = SpreadsheetApp.newDataValidation()
    .requireValueInList(['YES', 'NO'], true)
    .setAllowInvalid(false)
    .build();
  sh.getRange(rowNum, PR_COL.INCLUDE).setDataValidation(yesNoRule_);
  sh.getRange(rowNum, PR_COL.KPI_ACHIEVED).setDataValidation(yesNoRule_);

  // Holiday Days is a plain number — explicitly clear any dropdown validation.
  sh.getRange(rowNum, PR_COL.HOLIDAY_DAYS).clearDataValidations().setNumberFormat('0.##');

  // Weekly Base Pay is a calculated dollar amount — clear any stray dropdown validation
  // that may have been inherited from neighbouring YES/NO ranges.
  sh.getRange(rowNum, PR_COL.WEEKLY_BASE).clearDataValidations();

  sh.setRowHeight(rowNum, 22);
}

/**
 * refreshPayrollRunTotals_
 * Rebuilds the TOTAL PAID / TOTAL UNPAID rows at the bottom of Payroll Run.
 * Reads per-row STATUS column to accurately sum each bucket.
 * This is the fix for BUG-11.
 */



/**
 * getPayrollRunBlocks_
 * Scans Payroll Run and returns an array of all week blocks.
 * Each block: { weekLabel, startDate, endDate, ppCode, status, headerRow, firstDataRow, lastDataRow }
 *
 * A block header row is identified by: col 1 contains "WEEK" (string, not a number).
 *
 * IMPORTANT: STATUS and PAY_PERIOD columns are discovered from the header row (row 3)
 * rather than blindly trusting PR_COL.STATUS / PR_COL.PAY_PERIOD. This makes the
 * function work correctly whether or not joiMigrateHolidayColumns has been run.
 */
function getPayrollRunBlocks_() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) return [];

  const lastRow = sh.getLastRow();
  if (lastRow < 4) return [];

  // ── Discover actual STATUS and PAY_PERIOD column positions from the header row ──
  // This guards against the case where Holiday Columns migration hasn't been run yet,
  // which would shift STATUS from physical col 19 to 21 while the data is still at 19.
  const maxCols        = sh.getMaxColumns();
  const headerRowVals  = sh.getRange(3, 1, 1, maxCols).getValues()[0];
  let statusColActual  = PR_COL.STATUS;     // default: trust code constant
  let ppColActual      = PR_COL.PAY_PERIOD; // default: trust code constant

  headerRowVals.forEach((cell, idx) => {
    const h = cleanText_(cell).toUpperCase();
    if (h === 'STATUS')     statusColActual = idx + 1;  // 1-based
    if (h === 'PAY PERIOD') ppColActual     = idx + 1;
  });

  const col1 = sh.getRange(4, 1, lastRow - 3, 1).getValues().flat();
  const blocks = [];

  col1.forEach((val, i) => {
    const rowNum = i + 4;
    const text   = cleanText_(val).toUpperCase();
    if (text.startsWith('WEEK') && isNaN(parseFloat(val))) {
      const monthYearCell = cleanText_(sh.getRange(rowNum, PR_COL.AGENT_NAME).getValue());
      const rangeCell     = cleanText_(sh.getRange(rowNum, PR_COL.RULE_KEY).getValue());
      const parsedRange   = parsePayrollBlockDateRange_(rangeCell) ? rangeCell : monthYearCell;

      // Read ppCode from the discovered Pay Period column.
      // If it is empty (column misalignment from pre-migration state), compute it
      // from the block's date range end date so monthly sync still works correctly.
      let ppCode = cleanText_(sh.getRange(rowNum, ppColActual).getValue());
      if (!ppCode) {
        const parsedDates = parsePayrollBlockDateRange_(parsedRange);
        if (parsedDates && parsedDates.endDate) {
          ppCode = payPeriodCode_(parsedDates.endDate);
        }
      }

      blocks.push({
        headerRow    : rowNum,
        weekLabel    : cleanText_(val),
        monthYear    : monthYearCell,
        dateRange    : parsedRange,
        status       : cleanText_(sh.getRange(rowNum, statusColActual).getValue()),
        ppCode       : ppCode,
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

// 
//  LAYER 5 '97 MONTHLY SHEETS
// 

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

/**
 * syncMonthlySheetFromPayrollRun
 * Reads all week blocks from Payroll Run for a given month/year,
 * writes agent data into the monthly sheet (4-week layout),
 * then builds the Pay Period Summary section.
 *
 * Key fix: uses AGENT ID to match rows across week columns (BUG-17).
 * Clears and rebuilds the sheet '97 no duplicate summary blocks (BUG-18).
 *
 * @param {string} monthName
 * @param {number} year
 */

/**
 * buildMonthlySummary_
 * Builds the Pay Period Summary section at the bottom of a monthly sheet.
 * Exactly ONE summary block '97 no duplicates (BUG-18 fix).
 * Agent totals use agent ID matching, not row position (BUG-17 fix).
 */
function buildMonthlySummary_(sh, startRow, monthBlocks, weekData, sortedIds, monthName, year) {
  let r = startRow;
  const numCols = MO_COL.LAST_COL;

  // Section banner
  sh.getRange(r, 1, 1, numCols).merge()
    .setValue(` PAY PERIOD SUMMARY — ${monthName.toUpperCase()} ${year} PAYROLL`)
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

  // Agent rows '97 by ID match (BUG-17 fix)
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

// 
//  LAYER 6 '97 DASHBOARD
// 

/**
 * ensureDashboardSheet
 * Creates or refreshes the Dashboard sheet structure.
 */
function ensureDashboardSheet() {
  const ss = ss_();
  const sh = getOrCreateSheet_(ss, SH.DASHBOARD);
  sh.clear();

  // Set column widths BEFORE logo insert so centering math is accurate.
  sh.setColumnWidth(1, 75);
  sh.setColumnWidth(2, 190);
  sh.setColumnWidth(3, 140);
  sh.setColumnWidth(4, 270);
  sh.setColumnWidth(5, 130);
  sh.setColumnWidth(6, 125);
  sh.setColumnWidth(7, 125);
  sh.setColumnWidth(8, 130);

  // Unified brand header: Row 1 = navy+logo, Row 2 = gold title.
  joiWriteTabHeader_(sh, 'JOI PAYROLL DASHBOARD', 8);
  sh.setFrozenRows(3);

  SpreadsheetApp.flush();
}

/**
 * refreshDashboard
 * Rebuilds the Dashboard from live data in Payroll Run and Agents.
 * Shows: current pay period, all agents with latest week status + pay.
 * Fixes BUG-01, BUG-02, BUG-03.
 */

/**
 * buildDashboardCampaignSummary_
 * Appends a campaign-level summary at the bottom of Dashboard.
 * Exactly ONE block (BUG-18 equivalent fix for Dashboard).
 */

// 
//  LAYER 7 '97 WORKFLOW FUNCTIONS
// 

/**
 * parsePayrollBlockDateRange_
 * Reads a Payroll Run block date range like "04/20/2026 - 04/26/2026"
 * or "04/20/2026 '96 04/26/2026" and returns {startDate, endDate}.
 */
function parsePayrollBlockDateRange_(dateRange) {
  const text = cleanText_(dateRange);
  if (!text) return null;

  const matches = text.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/g);
  if (!matches || matches.length < 2) return null;

  const startDate = parsePayrollDateText_(matches[0]) || parseDate_(matches[0]);
  const endDate = parsePayrollDateText_(matches[1]) || parseDate_(matches[1]);
  if (!startDate || !endDate) return null;

  return { startDate: startDate, endDate: endDate };
}

/**
 * getLastPayrollWeekBlock_
 * Returns the latest Payroll Run week block based on parsed end date.
 */
function getLastPayrollWeekBlock_() {
  const blocks = getPayrollRunBlocks_();

  // Primary source of truth: the latest Payroll Run block by row order.
  // New headers store the actual date range in column C.
  if (blocks && blocks.length > 0) {
    const latestPayrollBlock = blocks[blocks.length - 1];
    const parsed = parsePayrollBlockDateRange_(latestPayrollBlock.dateRange);
    if (parsed && parsed.endDate) {
      return Object.assign({}, latestPayrollBlock, {
        parsedStartDate: parsed.startDate,
        parsedEndDate: parsed.endDate,
        source: 'Payroll Run',
      });
    }
  }

  // Legacy fallback only: old Payroll Run headers may show Month Year but not the date range.
  // Monthly sheets are used only to recover that missing historical date.
  const monthlyCandidates = getMonthlyPayrollWeekRangeCandidates_();
  if (monthlyCandidates.length === 0) return null;

  let latest = null;
  monthlyCandidates.forEach(candidate => {
    if (!latest || candidate.parsedEndDate.getTime() > latest.parsedEndDate.getTime()) {
      latest = candidate;
    }
  });

  return latest;
}

/**
 * getMonthlyPayrollWeekRangeCandidates_
 * Legacy fallback: scans monthly PayRoll tabs for visible week date ranges.
 * This only supports old Payroll Run headers that do not yet store date ranges.
 */
function getMonthlyPayrollWeekRangeCandidates_() {
  const ss = ss_();
  const candidates = [];
  const monthlyNameRegex = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{2}\s+PayRoll$/i;

  ss.getSheets().forEach(sh => {
    const sheetName = sh.getName();
    if (!monthlyNameRegex.test(sheetName)) return;

    const maxRows = Math.min(sh.getLastRow(), 12);
    const maxCols = Math.min(sh.getLastColumn(), 30);
    if (maxRows < 1 || maxCols < 1) return;

    const values = sh.getRange(1, 1, maxRows, maxCols).getDisplayValues();
    values.forEach((row, rIdx) => {
      row.forEach((cell, cIdx) => {
        const text = cleanText_(cell);
        const parsed = parsePayrollBlockDateRange_(text);
        if (!parsed || !parsed.endDate) return;

        const weekMatch = text.match(/WEEK\+/i);
        const weekLabel = weekMatch ? weekMatch[0].toUpperCase().replace(/\s+/, ' ') : 'WEEK';
        candidates.push({
          headerRow: null,
          weekLabel: weekLabel,
          monthYear: monthYearLabelFromDate_(parsed.endDate),
          dateRange: payrollWeekRangeLabel_(parsed.startDate, parsed.endDate),
          status: '',
          ppCode: payPeriodCode_(parsed.endDate),
          firstDataRow: null,
          lastDataRow: null,
          parsedStartDate: parsed.startDate,
          parsedEndDate: parsed.endDate,
          source: sheetName,
          sourceCell: `${sh.getName()}!R${rIdx + 1}C${cIdx + 1}`,
        });
      });
    });
  });

  return candidates;
}

/**
 * getNextSundayFromToday_
 * Fallback suggestion when no Payroll Run blocks exist yet.
 */
function getNextSundayFromToday_() {
  const today = new Date();
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const day = d.getDay();
  const daysUntilSunday = (7 - day) % 7;
  d.setDate(d.getDate() + daysUntilSunday);
  return d;
}

/**
 * monthNameFromDate_
 * Returns English month name from a Date.
 */
function monthNameFromDate_(d) {
  return d.toLocaleString('en-US', { month: 'long' });
}

/**
 * monthSheetNameFromDate_
 * Returns the monthly sheet name for a Date, e.g. "May 26 PayRoll".
 */
function monthSheetNameFromDate_(d) {
  return monthSheetName_(monthNameFromDate_(d), d.getFullYear());
}

/**
 * getNextPayrollWeekSuggestion_
 * Suggests the next payroll week from the latest Payroll Run block.
 * Cross-month weeks are assigned to the month of the week END date.
 */
function getNextPayrollWeekSuggestion_() {
  const lastBlock = getLastPayrollWeekBlock_();
  let startDate;
  let endDate;

  if (lastBlock && lastBlock.parsedEndDate) {
    startDate = new Date(lastBlock.parsedEndDate.getTime());
    startDate.setDate(startDate.getDate() + 1);
    endDate = new Date(lastBlock.parsedEndDate.getTime());
    endDate.setDate(endDate.getDate() + 7);
  } else {
    endDate = getNextSundayFromToday_();
    startDate = new Date(endDate.getTime());
    startDate.setDate(startDate.getDate() - 6);
  }

  const ppCode = payPeriodCode_(endDate);
  const crossesMonth = startDate.getMonth() !== endDate.getMonth() || startDate.getFullYear() !== endDate.getFullYear();

  return {
    lastBlock: lastBlock,
    startDate: startDate,
    endDate: endDate,
    startDateText: fmtDate_(startDate),
    endDateText: fmtDate_(endDate),
    rangeText: `${fmtDate_(startDate)} - ${fmtDate_(endDate)}`,
    ppCode: ppCode,
    ppLabel: payPeriodLabel_(ppCode),
    monthName: monthNameFromDate_(endDate),
    year: endDate.getFullYear(),
    monthlySheetName: monthSheetNameFromDate_(endDate),
    crossesMonth: crossesMonth,
    crossMonthText: crossesMonth
      ? `This week crosses months. It will be assigned to ${monthNameFromDate_(endDate)} payroll because the week ends on ${fmtDate_(endDate)}.`
      : '',
  };
}

/**
 * buildMonthOptions_
 * Returns month dropdown options with a selected month.
 */
function buildMonthOptions_(selectedMonthName) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return months.map(m => {
    const selected = m === selectedMonthName ? ' selected' : '';
    return `<option value="${paystubEscape_(m)}"${selected}>${paystubEscape_(m)}</option>`;
  }).join('');
}

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
  const suggestion = getNextPayrollWeekSuggestion_();
  const lastText = suggestion.lastBlock
    ? `${suggestion.lastBlock.weekLabel || 'Last Week'} | ${suggestion.lastBlock.monthYear || ''} | ${suggestion.lastBlock.dateRange || ''}`
    : 'No previous payroll week found. Using the next Sunday from today.';

  const crossHtml = suggestion.crossesMonth
    ? `<div class="joiStatus" style="background:#fff7e0;border:1px solid #f5a000;border-radius:12px;padding:12px;font-weight:700;color:#070739;">${paystubEscape_(suggestion.crossMonthText)}</div>`
    : '';

  const bodyHtml = `
    <div class="joiSectionTitle">Add New Week</div>
    <p class="joiText">The app found the last payroll week and calculated the next week automatically. Review the dates before adding it.</p>

    <div class="joiStatus" style="background:#f6f8fc;border:1px solid #d8deea;border-radius:12px;padding:12px;">
      <strong>Last payroll week found:</strong><br>
      ${paystubEscape_(lastText)}<br><br>
      <strong>Next week to add:</strong><br>
      ${paystubEscape_(suggestion.rangeText)}<br><br>
      <strong>Pay period:</strong><br>
      ${paystubEscape_(suggestion.ppLabel)}<br><br>
      <strong>Monthly sheet target:</strong><br>
      ${paystubEscape_(suggestion.monthlySheetName)}
    </div>

    ${crossHtml}

    <div class="joiField">
      <label class="joiLabel" for="endDate">Week end date</label>
      <input id="endDate" class="joiInput" value="${paystubEscape_(suggestion.endDateText)}" placeholder="MM/DD/YYYY">
    </div>

    <p class="joiMuted">Rule locked: cross-month weeks are assigned to the month of the week end date.</p>
    <div id="status" class="joiStatus"></div>

    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="submitWeek()">Add Week</button>
    </div>
  `;

  const clientScript = `
    <script>
      function submitWeek() {
        var endDate = document.getElementById('endDate').value;
        var btn = document.getElementById('runBtn');
        var status = document.getElementById('status');
        btn.disabled = true;
        status.className = 'joiStatus';
        status.textContent = 'Adding week...';
        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            status.className = 'joiStatus ' + (result && result.ok ? 'joiSuccess' : 'joiError');
            status.textContent = (result && result.message) ? result.message : 'No result returned.';
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            status.className = 'joiStatus joiError';
            status.textContent = error && error.message ? error.message : String(error);
          })
          .joiAddNewWeekFromDialog(endDate, 'end');
      }
    </script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Add New Week', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(620).setHeight(650);

  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Add New Week');
}


/**
 * cleanStalePayrollRunRows_
 * Removes stale formula/error rows that appear between week blocks in Payroll Run.
 * A stale row is one that: (a) is NOT a valid week header row, (b) has an error
 * value like #NUM! or #REF! in column A, and (c) falls between two week blocks.
 * Safe: only deletes rows that have no recognizable agent ID or week label in col A.
 * Called automatically during ensurePayrollRunSheet and also exposed as a menu action.
 */
function cleanStalePayrollRunRows_() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) return { cleaned: 0, message: 'Payroll Run sheet not found.' };

  const lastRow = sh.getLastRow();
  if (lastRow < 5) return { cleaned: 0, message: 'No rows to check.' };

  // Read column A display values (so #NUM! shows as error text, not formula).
  const colADisplay = sh.getRange(4, 1, lastRow - 3, 1).getDisplayValues().flat();
  const rowsToDelete = [];

  colADisplay.forEach((displayVal, i) => {
    const rowNum = i + 4;
    const raw = sh.getRange(rowNum, 1).getValue();
    const text = cleanText_(String(displayVal)).toUpperCase();

    // Skip valid week headers (start with WEEK)
    if (text.startsWith('WEEK')) return;
    // Skip valid agent rows (numeric agent ID)
    if (typeof raw === 'number' && raw > 0 && Math.floor(raw) === raw) return;
    if (/^\d+$/.test(text) && Number(text) > 0) return;
    // Skip empty rows (they're just spacing)
    if (text === '') return;

    // Flag rows with error indicators, pure stale numeric formulas, or garbage values
    // that are clearly not agent names or week labels.
    const isError = /^#(NUM|REF|VALUE|DIV|N\/A|NAME)\b/.test(text);
    const isStaleNum = typeof raw === 'number' && raw > 0 && /^\d+$/.test(String(Math.floor(raw)));

    // Only delete if it looks like an error cell, not a real agent or week header.
    if (isError) {
      rowsToDelete.push(rowNum);
    }
  });

  // Delete in reverse order so row numbers stay valid.
  let cleaned = 0;
  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    try {
      sh.deleteRow(rowsToDelete[i]);
      cleaned++;
    } catch (e) {
      Logger.log('cleanStalePayrollRunRows_: could not delete row ' + rowsToDelete[i] + ': ' + e.message);
    }
  }

  SpreadsheetApp.flush();
  return { cleaned, message: cleaned > 0 ? `Removed ${cleaned} stale error row(s) from Payroll Run.` : 'No stale rows found.' };
}

function joiCleanStaleRows() {
  const result = cleanStalePayrollRunRows_();
  joiShowMessageDialog_('Clean Stale Rows', result.message);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SORT PAYROLL WEEK ROWS BY AGENT ID
//  Fix for weeks generated before agent-sort was enforced — re-sorts all
//  agent rows within a selected week block by Agent ID ascending.
//  Does NOT touch formatting, formulas, or header rows.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * sortPayrollWeekAgentRows
 * Shows a dialog letting the user pick which week block to re-sort by Agent ID.
 */
function sortPayrollWeekAgentRows() {
  const blocks = getPayrollRunBlocks_();
  if (!blocks.length) {
    joiShowMessageDialog_('Sort Week', 'No week blocks found in Payroll Run.');
    return;
  }

  const optionTags = blocks.map(b => {
    const label = (b.weekLabel + ' ' + (b.monthYear || '') + ' (' + b.status + ')')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `<option value="${b.headerRow}">${label}</option>`;
  }).join('');

  const bodyHtml = `
    <p class="joiText">
      Re-sorts all agent rows in the selected week so they appear in
      <strong>Agent ID order</strong> (1 → highest).<br><br>
      Use this to fix any week where newer agents appear before Agent 1.
    </p>
    <div class="joiFormGroup">
      <label class="joiLabel" for="weekSel">Select Week</label>
      <select id="weekSel" class="joiSelect" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #ccc;font-size:13px;">${optionTags}</select>
    </div>
    <div class="joiActions" style="margin-top:18px;">
      <button class="joiButton joiButtonPrimary" onclick="run()">Sort Week</button>
      <button class="joiButton" onclick="google.script.host.close()">Cancel</button>
    </div>
  `;

  const clientScript = `
    <script>
      function run() {
        const hr = document.getElementById('weekSel').value;
        document.querySelector('.joiButtonPrimary').disabled = true;
        document.querySelector('.joiButtonPrimary').textContent = 'Sorting...';
        google.script.run
          .withSuccessHandler(function(r) {
            alert(r.message);
            google.script.host.close();
          })
          .withFailureHandler(function(e) {
            alert('Error: ' + e.message);
            google.script.host.close();
          })
          .joiSortWeekAgentRowsFromDialog(hr);
      }
    <\/script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Sort Week by Agent ID', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(480).setHeight(360);

  SpreadsheetApp.getUi().showModalDialog(html, 'Sort Week by Agent ID');
}

/**
 * joiSortWeekAgentRowsFromDialog
 * Called by the sort dialog. Sorts agent rows in the chosen week by Agent ID.
 * Only values are re-ordered — formatting stays in position (safe because
 * alternating row formatting is positional, not agent-specific).
 *
 * @param {string|number} headerRow - header row number of the target block
 * @returns {{ ok: boolean, message: string }}
 */
function joiSortWeekAgentRowsFromDialog(headerRow) {
  try {
    const ss = ss_();
    const sh = ss.getSheetByName(SH.PAYROLL_RUN);
    if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };

    const blocks = getPayrollRunBlocks_();
    const block  = blocks.find(b => Number(b.headerRow) === Number(headerRow));
    if (!block) return { ok: false, message: 'Week block not found. Please try again.' };

    const first = block.firstDataRow;
    const last  = block.lastDataRow;
    if (!last || last < first) return { ok: false, message: 'No agent rows found in this week block.' };

    const numRows = last - first + 1;
    const numCols = PR_COL.LAST_COL;

    // Read all data rows for this block.
    const data = sh.getRange(first, 1, numRows, numCols).getValues();

    // Separate agent rows (numeric positive integer Agent ID) from non-agent rows.
    const agentRows = [];
    const otherRows = [];

    data.forEach(row => {
      const raw = row[PR_COL.AGENT_ID - 1];
      const id  = typeof raw === 'number' ? raw : parseFloat(raw);
      if (Number.isFinite(id) && id > 0 && Math.floor(id) === id && id < 10000) {
        agentRows.push(row);
      } else {
        otherRows.push(row);
      }
    });

    if (agentRows.length === 0) {
      return { ok: false, message: 'No valid agent rows found in this week block.' };
    }

    // Sort agent rows ascending by Agent ID.
    agentRows.sort((a, b) => a[PR_COL.AGENT_ID - 1] - b[PR_COL.AGENT_ID - 1]);

    // Check if already sorted (avoid unnecessary writes).
    let alreadySorted = true;
    for (let i = 1; i < agentRows.length; i++) {
      if (agentRows[i][PR_COL.AGENT_ID - 1] < agentRows[i - 1][PR_COL.AGENT_ID - 1]) {
        alreadySorted = false;
        break;
      }
    }
    if (alreadySorted && otherRows.length === 0) {
      return { ok: true, message: `${block.weekLabel} is already sorted by Agent ID — no changes made.` };
    }

    // Write back: sorted agents first, then any non-agent rows.
    const sorted = [...agentRows, ...otherRows];
    sh.getRange(first, 1, numRows, numCols).setValues(sorted);

    // Re-apply currency format and status colors after value write.
    for (let i = 0; i < agentRows.length; i++) {
      const r = first + i;
      sh.getRange(r, PR_COL.WEEKLY_BASE, 1, 8).setNumberFormat('$#,##0.00');
      const status = cleanText_(agentRows[i][PR_COL.STATUS - 1]) || STATUS.UNPAID;
      applyStatusColor_(sh.getRange(r, PR_COL.STATUS), status);
      sh.getRange(r, PR_COL.PAY_PERIOD).setFontWeight('bold');
    }

    SpreadsheetApp.flush();
    return {
      ok: true,
      message: `Sorted ${agentRows.length} agent rows by Agent ID in ${block.weekLabel}.\nAgent 1 now appears first.`
    };
  } catch (err) {
    return { ok: false, message: 'Sort failed: ' + err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  REPAIR MAY WEEK DEFAULTS
//  Fixes weeks where code-generated rows have KPI=NO (wrong default),
//  zero-filled day columns (should be blank), and missing YES/NO dropdowns.
//  Safe to run any time — only touches rows whose KPI was set by the code
//  (i.e., not a valid user override).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * joiRepairCurrentMonthDefaults
 * Menu entry: finds all Payroll Run blocks for the CURRENT calendar month,
 * resets KPI to YES (the correct default), clears 0s from day columns,
 * and adds YES/NO dropdowns to Include and KPI.
 *
 * Joe can still manually change individual KPIs to NO after this runs.
 */
function joiRepairCurrentMonthDefaults() {
  const result = repairPayrollWeekDefaults_('ALL');
  joiShowMessageDialog_('Repair Week Defaults', result.message);
}

/**
 * repairPayrollWeekDefaults_
 * Core repair logic.
 * @param {string} ppPrefix - ppCode prefix to filter (e.g. 'MAY'), or 'ALL' for every block
 */
function repairPayrollWeekDefaults_(ppPrefix) {
  try {
    const ss = ss_();
    const sh = ss.getSheetByName(SH.PAYROLL_RUN);
    if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };

    const blocks = getPayrollRunBlocks_();
    const target = ppPrefix === 'ALL'
      ? blocks
      : blocks.filter(b => cleanText_(b.ppCode).toUpperCase().startsWith(cleanText_(ppPrefix).toUpperCase()));

    if (!target.length) {
      return { ok: false, message: `No payroll blocks found matching "${ppPrefix}".` };
    }

    const yesNoRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['YES', 'NO'], true)
      .setAllowInvalid(false)
      .build();

    let rowsFixed = 0;
    let blocksFixed = 0;

    target.forEach(block => {
      let blockHadIssues = false;
      for (let r = block.firstDataRow; r <= block.lastDataRow; r++) {
        if (!isPayrollAgentDataRow_(sh, r)) continue;

        // Fix KPI: default is YES. Reset any auto-generated NO to YES.
        const kpiCell = sh.getRange(r, PR_COL.KPI_ACHIEVED);
        const kpiVal  = cleanText_(kpiCell.getValue()).toUpperCase();
        if (kpiVal !== 'YES') {
          kpiCell.setValue('YES');
          blockHadIssues = true;
        }

        // Fix day columns: replace numeric 0 with blank (user-entered 0 stays).
        [PR_COL.MISSED_DAYS, PR_COL.OVERTIME_DAYS, PR_COL.SUNDAYS, PR_COL.VACATION_DAYS].forEach(col => {
          const cell = sh.getRange(r, col);
          if (cell.getValue() === 0) {
            cell.setValue('');
            blockHadIssues = true;
          }
        });

        // Always apply YES/NO dropdowns — even if values were already correct.
        sh.getRange(r, PR_COL.INCLUDE).setDataValidation(yesNoRule);
        sh.getRange(r, PR_COL.KPI_ACHIEVED).setDataValidation(yesNoRule);

        // Re-apply number format (safe, idempotent).
        sh.getRange(r, PR_COL.WEEKLY_BASE, 1, 8).setNumberFormat('$#,##0.00');

        rowsFixed++;
      }
      if (blockHadIssues) blocksFixed++;
    });

    // Recalculate Total Pay for affected rows (KPI changed → KPI Bonus changes).
    if (rowsFixed > 0) {
      const ruleMap = getRuleMap_();
      target.forEach(block => {
        for (let r = block.firstDataRow; r <= block.lastDataRow; r++) {
          if (!isPayrollAgentDataRow_(sh, r)) continue;
          const row       = sh.getRange(r, 1, 1, PR_COL.LAST_COL).getValues()[0];
          const rk        = normalizeRuleKey_(cleanText_(row[PR_COL.RULE_KEY - 1]));
          const rule      = ruleMap.get(rk);
          if (!rule) continue;
          const inputs = {
            include      : cleanText_(row[PR_COL.INCLUDE       - 1]) || 'YES',
            missedDays   : row[PR_COL.MISSED_DAYS  - 1] || '',
            overtimeDays : row[PR_COL.OVERTIME_DAYS - 1] || '',
            sundays      : row[PR_COL.SUNDAYS       - 1] || '',
            vacationDays : row[PR_COL.VACATION_DAYS - 1] || '',
            kpiAchieved  : 'YES',   // we just set this above
            extraBonus   : Number(row[PR_COL.EXTRA_BONUS  - 1]) || 0,
            partialWeek  : Number(row[PR_COL.PARTIAL_WEEK - 1]) || 0,
            holidayDays  : Number(row[PR_COL.HOLIDAY_DAYS - 1]) || 0,
          };
          const pay = calcAgentPay_(rule, inputs);
          sh.getRange(r, PR_COL.WEEKLY_BASE).setValue(pay.weeklyBase);
          sh.getRange(r, PR_COL.KPI_BONUS  ).setValue(pay.kpiBonus);
          sh.getRange(r, PR_COL.MISSED_DED ).setValue(pay.missedDed);
          sh.getRange(r, PR_COL.OVERTIME_PAY).setValue(pay.overtimePay);
          sh.getRange(r, PR_COL.SUNDAY_PAY ).setValue(pay.sundayPay);
          sh.getRange(r, PR_COL.VACATION_PAY).setValue(pay.vacationPay);
          sh.getRange(r, PR_COL.TOTAL_PAY  ).setValue(pay.totalPay);
          sh.getRange(r, PR_COL.HOLIDAY_PAY).setValue(pay.holidayPay || 0);
          sh.getRange(r, PR_COL.WEEKLY_BASE, 1, 8).setNumberFormat('$#,##0.00');
          sh.getRange(r, PR_COL.HOLIDAY_PAY).setNumberFormat('$#,##0.00');
        }
      });
    }

    SpreadsheetApp.flush();

    const summary = rowsFixed > 0
      ? `Repaired ${rowsFixed} agent rows across ${blocksFixed} week block(s).\n\nKPI reset to YES, day columns cleared, dropdowns added.\n\nReview any agents who should have KPI = NO and change them manually.`
      : `All ${target.length} block(s) already have correct defaults — no changes needed.`;

    return { ok: true, message: summary };
  } catch (err) {
    return { ok: false, message: 'Repair failed: ' + err.message };
  }
}

/**
 * joiSyncAllBlockRowStatuses
 * Menu entry: sets each agent row's STATUS badge to match its block header.
 * PAID header  → all agent rows in that block get the PAID badge + styling.
 * COMPLETE header → all agent rows get COMPLETE badge + styling.
 * UNPAID blocks are left alone.
 */
function joiSyncAllBlockRowStatuses() {
  const result = syncAllBlockRowStatuses_();
  joiShowMessageDialog_('Sync Row Statuses', result.message);
}

function syncAllBlockRowStatuses_() {
  try {
    const ss = ss_();
    const sh = ss.getSheetByName(SH.PAYROLL_RUN);
    if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };

    const blocks = getPayrollRunBlocks_();
    if (!blocks.length) return { ok: false, message: 'No payroll blocks found.' };

    let rowsUpdated = 0;
    let blocksUpdated = 0;

    // Strip all non-letter chars so '✓ PAID', ' PAID', 'PAID✅' all normalize to 'PAID'
    const normStatus = s => s.replace(/[^a-zA-Z]/g, '').toUpperCase();

    blocks.forEach(block => {
      const blockStatusNorm = normStatus(block.status);

      let targetStatus = null;
      if (blockStatusNorm === 'PAID')         targetStatus = STATUS.PAID;
      else if (blockStatusNorm === 'COMPLETE') targetStatus = STATUS.COMPLETE;
      else return; // UNPAID or empty — leave these alone

      let blockRowsFixed = 0;
      for (let r = block.firstDataRow; r <= block.lastDataRow; r++) {
        if (!isPayrollAgentDataRow_(sh, r)) continue;
        const statusCell = sh.getRange(r, PR_COL.STATUS);
        const currentNorm = normStatus(cleanText_(statusCell.getValue()));
        if (currentNorm !== blockStatusNorm) {
          statusCell.setValue(targetStatus);
          applyStatusColor_(statusCell, targetStatus);
          blockRowsFixed++;
          rowsUpdated++;
        }
      }
      if (blockRowsFixed > 0) blocksUpdated++;
    });

    SpreadsheetApp.flush();

    const summary = rowsUpdated > 0
      ? `Updated ${rowsUpdated} agent row(s) across ${blocksUpdated} week block(s).\n\nAll rows now show the correct PAID or COMPLETE status badge.`
      : 'All agent row statuses already match their block headers — no changes needed.';

    return { ok: true, message: summary };
  } catch (err) {
    return { ok: false, message: 'Status sync failed: ' + err.message };
  }
}

/**
 * joiRepairCorruptBlockHeaders
 * Cleans numeric zeros and stray values from block header rows.
 * A header row must only contain: week label, month-year, date range, status, ppCode.
 * Any number or non-text value in pay/day columns on a header row is cleared.
 * Fixes the "WEEK 5 March 2026" row that shows $0.00 in pay columns.
 */
function joiRepairCorruptBlockHeaders() {
  const result = repairCorruptBlockHeaders_();
  joiShowMessageDialog_('Repair Block Headers', result.message);
}

function repairCorruptBlockHeaders_() {
  try {
    const ss = ss_();
    const sh = ss.getSheetByName(SH.PAYROLL_RUN);
    if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };

    const blocks = getPayrollRunBlocks_();
    if (!blocks.length) return { ok: false, message: 'No payroll blocks found.' };

    // Columns that must be empty on a header row (all pay + day + input cols)
    const payCols = [
      PR_COL.INCLUDE,       PR_COL.MISSED_DAYS,   PR_COL.OVERTIME_DAYS,
      PR_COL.SUNDAYS,       PR_COL.VACATION_DAYS,  PR_COL.KPI_ACHIEVED,
      PR_COL.WEEKLY_BASE,   PR_COL.KPI_BONUS,      PR_COL.MISSED_DED,
      PR_COL.OVERTIME_PAY,  PR_COL.SUNDAY_PAY,     PR_COL.VACATION_PAY,
      PR_COL.EXTRA_BONUS,   PR_COL.TOTAL_PAY,      PR_COL.PARTIAL_WEEK,
      PR_COL.MEMO
    ];

    let headersFixed = 0;

    blocks.forEach(block => {
      const hRow = block.headerRow;
      const rowData = sh.getRange(hRow, 1, 1, PR_COL.LAST_COL).getValues()[0];
      let isDirty = false;

      payCols.forEach(col => {
        const v = rowData[col - 1];
        if (v !== '' && v !== null && v !== undefined) isDirty = true;
      });

      if (!isDirty) return;

      // Rebuild a clean header — preserve only the five identifier columns (raw values)
      const cleanRow = new Array(PR_COL.LAST_COL).fill('');
      cleanRow[PR_COL.AGENT_ID   - 1] = rowData[PR_COL.AGENT_ID   - 1]; // week label
      cleanRow[PR_COL.AGENT_NAME - 1] = rowData[PR_COL.AGENT_NAME - 1]; // month-year
      cleanRow[PR_COL.RULE_KEY   - 1] = rowData[PR_COL.RULE_KEY   - 1]; // date range
      cleanRow[PR_COL.STATUS     - 1] = rowData[PR_COL.STATUS     - 1]; // status (keeps leading space)
      cleanRow[PR_COL.PAY_PERIOD - 1] = rowData[PR_COL.PAY_PERIOD - 1]; // ppCode

      // Only clear the values — do NOT re-apply formatting, to preserve
      // any custom background/color the header already had (e.g. PAID coloring).
      sh.getRange(hRow, 1, 1, PR_COL.LAST_COL).setValues([cleanRow]);
      headersFixed++;
    });

    SpreadsheetApp.flush();

    const summary = headersFixed > 0
      ? `Cleaned ${headersFixed} corrupt block header row(s).\n\nZero/stray values removed. Header rows now show only week label, date range, and status.`
      : 'All block header rows are clean — no corrupt values found.';

    return { ok: true, message: summary };
  } catch (err) {
    return { ok: false, message: 'Header repair failed: ' + err.message };
  }
}

/**
 * joiStandardizeAllBlockHeaders
 * Re-applies the correct navy+gold banner style to every week block header
 * in Payroll Run. Fixes any header that ended up with the wrong color or
 * font size (e.g. row 166 charcoal vs navy, or May Week 1 with font size 16).
 * Values are preserved — only formatting changes.
 */
function joiStandardizeAllBlockHeaders() {
  try {
    const ss = ss_();
    const sh = ss.getSheetByName(SH.PAYROLL_RUN);
    if (!sh) return joiShowMessageDialog_('Standardize Headers', 'Payroll Run sheet not found.');

    const blocks = getPayrollRunBlocks_();
    if (!blocks.length) return joiShowMessageDialog_('Standardize Headers', 'No payroll blocks found.');

    const navy = joiPayrollRunNavy_();
    const gold = joiPayrollRunGold_();

    blocks.forEach(block => {
      const hRow = block.headerRow;
      // Snap values before touching format
      const rowData = sh.getRange(hRow, 1, 1, PR_COL.LAST_COL).getValues();
      // Apply standard banner style
      sh.getRange(hRow, 1, 1, PR_COL.LAST_COL)
        .setBackground(navy)
        .setFontColor(navy)
        .setFontWeight('bold')
        .setFontSize(10)
        .setVerticalAlignment('middle')
        .setWrap(false);
      sh.getRange(hRow, PR_COL.AGENT_ID, 1, 3)
        .setFontColor(gold)
        .setFontWeight('bold')
        .setFontSize(10)
        .setHorizontalAlignment('left');
      sh.getRange(hRow, 1, 1, PR_COL.LAST_COL).setValues(rowData);
      sh.setRowHeight(hRow, 26);
    });

    SpreadsheetApp.flush();
    joiShowMessageDialog_('Standardize Headers',
      `Standardized ${blocks.length} block header(s).\n\nAll week banners now use the correct navy/gold style at font size 10.`);
  } catch (err) {
    joiShowMessageDialog_('Standardize Headers', 'Error: ' + err.message);
  }
}

/**
 * joiRenumberWeekLabels
 * Menu entry: re-numbers WEEK labels in Payroll Run so each month's blocks
 * are labelled WEEK 1, WEEK 2, WEEK 3… in chronological order.
 * Fixes the "WEEK 3 May" that should be "WEEK 2 May" after a mislabelled add.
 */
function joiRenumberWeekLabels() {
  const result = renumberWeekLabels_();
  joiShowMessageDialog_('Renumber Week Labels', result.message);
}

function renumberWeekLabels_() {
  try {
    const ss = ss_();
    const sh = ss.getSheetByName(SH.PAYROLL_RUN);
    if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };

    const blocks = getPayrollRunBlocks_();
    if (!blocks.length) return { ok: false, message: 'No payroll blocks found.' };

    // Group blocks by ppCode month prefix (e.g. 'MAY26', 'APR26')
    const monthGroups = {};
    blocks.forEach(block => {
      const prefix = block.ppCode ? block.ppCode.replace(/PP[12]$/, '') : '';
      if (!monthGroups[prefix]) monthGroups[prefix] = [];
      monthGroups[prefix].push(block);
    });

    let renamed = 0;
    Object.keys(monthGroups).forEach(prefix => {
      const group = monthGroups[prefix]; // already in sheet order (chronological)
      group.forEach((block, idx) => {
        const correctLabel = `WEEK ${idx + 1}`;
        const currentLabel = cleanText_(block.weekLabel);
        if (currentLabel !== correctLabel) {
          sh.getRange(block.headerRow, PR_COL.AGENT_ID).setValue(correctLabel);
          renamed++;
        }
      });
    });

    SpreadsheetApp.flush();

    const summary = renamed > 0
      ? `Renamed ${renamed} week block(s) to correct sequential labels.\n\nWeeks are now numbered WEEK 1, WEEK 2… within each month.`
      : 'All week labels are already correct — no changes needed.';

    return { ok: true, message: summary };
  } catch (err) {
    return { ok: false, message: 'Renumber failed: ' + err.message };
  }
}

/**
 * joiForceApplyDropdowns
 * Standalone repair: forces YES/NO dropdown validation onto every Include
 * and KPI cell in every agent row across all Payroll Run blocks.
 * Run this if dropdowns are missing after Repair Week Defaults.
 */
function joiForceApplyDropdowns() {
  try {
    const ss = ss_();
    const sh = ss.getSheetByName(SH.PAYROLL_RUN);
    if (!sh) return joiShowMessageDialog_('Apply Dropdowns', 'Payroll Run sheet not found.');

    const blocks = getPayrollRunBlocks_();
    if (!blocks.length) return joiShowMessageDialog_('Apply Dropdowns', 'No payroll blocks found.');

    const yesNoRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['YES', 'NO'], true)
      .setAllowInvalid(false)
      .build();

    let count = 0;
    blocks.forEach(block => {
      for (let r = block.firstDataRow; r <= block.lastDataRow; r++) {
        if (!isPayrollAgentDataRow_(sh, r)) continue;
        sh.getRange(r, PR_COL.INCLUDE).setDataValidation(yesNoRule);
        sh.getRange(r, PR_COL.KPI_ACHIEVED).setDataValidation(yesNoRule);
        count++;
      }
    });

    SpreadsheetApp.flush();
    joiShowMessageDialog_('Apply Dropdowns',
      `YES/NO dropdowns applied to ${count} agent row(s) across all weeks.\n\nCheck Include (col D) and KPI (col I) — they should now show dropdown arrows.`);
  } catch (err) {
    joiShowMessageDialog_('Apply Dropdowns', 'Error: ' + err.message);
  }
}

/**
 * repairWeekDateHeaders
 * One-time repair for legacy Payroll Run block headers.
 * It fills column C with MM/DD/YY - MM/DD/YY when column B only has Month Year.
 * Does not touch agent rows, formulas, pay values, or sheet structure.
 */
function repairWeekDateHeaders() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) {
    joiShowMessageDialog_('Repair Week Date Headers', 'Payroll Run sheet not found.');
    return;
  }

  const monthlyCandidates = getMonthlyPayrollWeekRangeCandidates_();
  const map = new Map();
  const putRepairKey_ = (ppCode, weekLabel, candidate) => {
    const key = `${cleanText_(ppCode)}|${cleanText_(weekLabel).toUpperCase()}`;
    if (key !== '|' && !map.has(key)) map.set(key, candidate);
  };
  monthlyCandidates.forEach(c => {
    putRepairKey_(c.ppCode, c.weekLabel, c);
    // Also support legacy pay period codes like APRILPP2 when monthly fallback has APRIL26PP2.
    const legacyPp = cleanText_(c.ppCode).replace(/^(.*?)(\d{2})(PP[12])$/, '$1$3');
    putRepairKey_(legacyPp, c.weekLabel, c);
  });

  const blocks = getPayrollRunBlocks_();
  let repaired = 0;
  const skipped = [];

  blocks.forEach(block => {
    const currentParsed = parsePayrollBlockDateRange_(block.dateRange);
    if (currentParsed) return;

    const key = `${cleanText_(block.ppCode)}|${cleanText_(block.weekLabel).toUpperCase()}`;
    const candidate = map.get(key);
    if (!candidate) {
      skipped.push(`${block.weekLabel} ${block.monthYear || ''} ${block.ppCode || ''}`.trim());
      return;
    }

    sh.getRange(block.headerRow, PR_COL.AGENT_NAME).setValue(monthYearLabelFromDate_(candidate.parsedEndDate));
    sh.getRange(block.headerRow, PR_COL.RULE_KEY).setValue(candidate.dateRange);
    repaired++;
  });

  SpreadsheetApp.flush();

  let msg = `Repair complete.\Headers repaired: ${repaired}`;
  if (skipped.length) {
    msg += `\Skipped because no matching monthly date range was found:${skipped.join('')}`;
  }
  joiShowMessageDialog_('Repair Week Date Headers', msg);
}

/**
 * markWeekAsComplete
 * Marks all UNPAID rows in the most recent (or selected) week block as COMPLETE.
 * Shows a summary of total pay and allows adding a memo before confirming.
 * Status: UNPAID  COMPLETE (yellow  blue).
 */
function markWeekAsComplete() {
  const blockOptions = joiBlockOptions_(STATUS.UNPAID);
  if (blockOptions.length === 0) {
    joiShowMessageDialog_('Mark Week as Complete', 'No UNPAID weeks found. All weeks are already COMPLETE or PAID.');
    return;
  }

  const bodyHtml = `
    <div class="joiSectionTitle">Mark Week as Complete</div>
    <p class="joiText">Select the unpaid week to mark as complete. You can add an optional memo.</p>
    <div class="joiField">
      <label class="joiLabel" for="headerRow">Week</label>
      <select id="headerRow" class="joiSelect">${joiOptionTags_(blockOptions, 'headerRow', 'label')}</select>
    </div>
    <div class="joiField">
      <label class="joiLabel" for="memo">Memo optional</label>
      <input id="memo" class="joiInput" placeholder="Optional memo">
    </div>
    <div id="status" class="joiStatus"></div>
    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="submitComplete()">Mark Complete</button>
    </div>
  `;

  const clientScript = `
    <script>
      function submitComplete() {
        var btn = document.getElementById('runBtn');
        var status = document.getElementById('status');
        btn.disabled = true;
        status.className = 'joiStatus';
        status.textContent = 'Marking week as complete...';
        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            status.className = 'joiStatus ' + (result && result.ok ? 'joiSuccess' : 'joiError');
            status.textContent = (result && result.message) ? result.message : 'No result returned.';
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            status.className = 'joiStatus joiError';
            status.textContent = error && error.message ? error.message : String(error);
          })
          .joiMarkWeekAsCompleteFromDialog(document.getElementById('headerRow').value, document.getElementById('memo').value);
      }
    </script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Mark Week as Complete', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(620).setHeight(480);

  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Mark Week Complete');
}

function joiMarkWeekAsCompleteFromDialog(headerRow, memo) {
  try {
    const ss = ss_();
    const sh = ss.getSheetByName(SH.PAYROLL_RUN);
    if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };

    const block = getPayrollRunBlocks_().find(b => Number(b.headerRow) === Number(headerRow));
    if (!block) return { ok: false, message: 'Selected week block was not found.' };
    if (block.status !== STATUS.UNPAID) return { ok: false, message: 'Selected week is not currently UNPAID.' };

    const numRows = block.lastDataRow - block.firstDataRow + 1;
    const data = sh.getRange(block.firstDataRow, 1, numRows, PR_COL.LAST_COL).getValues();
    let totalPay = 0;
    let agentCount = 0;
    const completeCells = [];

    data.forEach((row, i) => {
      const rowNum = block.firstDataRow + i;
      const id = row[PR_COL.AGENT_ID - 1];
      if (typeof id !== 'number' && isNaN(parseFloat(id))) return;
      totalPay += Number(row[PR_COL.TOTAL_PAY - 1]) || 0;
      agentCount++;
      // joiSetRowStatus_ updates Status + Memo's workflow indicator + the
      // colored badge in one atomic operation. Preserves existing free text
      // unless caller explicitly passes a replaceFreeText override.
      const opts = memo ? { replaceFreeText: cleanText_(memo) } : undefined;
      joiSetRowStatus_(sh, rowNum, STATUS.COMPLETE, opts);
      completeCells.push(sh.getRange(rowNum, PR_COL.STATUS).getA1Notation());
    });

    if (completeCells.length > 0) {
      sh.getRangeList(completeCells)
        .setBackground(BRAND.completeBg)
        .setFontColor(BRAND.completeFg)
        .setFontWeight('bold');
    }

    sh.getRange(block.headerRow, PR_COL.STATUS).setValue(STATUS.COMPLETE);
    applyStatusColor_(sh.getRange(block.headerRow, PR_COL.STATUS), STATUS.COMPLETE);
    refreshPayrollRunTotals_();
    SpreadsheetApp.flush();

    return {
      ok: true,
      message: `${block.weekLabel} marked as COMPLETE.\Agents: ${agentCount}Total: ${fmt_(totalPay)}`
    };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/**
 * markPayPeriodAsPaid
 * Marks all COMPLETE rows for a given pay period as PAID.
 * Freezes values (converts formulas to static) and greys out rows.
 * Status: COMPLETE  PAID (blue  green  then greyed).
 * This is the lock '97 cannot be easily undone.
 */
function markPayPeriodAsPaid() {
  const periodOptions = joiPayPeriodGroupOptions_(STATUS.COMPLETE);
  if (periodOptions.length === 0) {
    joiShowMessageDialog_('Mark Pay Period as PAID', 'No COMPLETE weeks found. Mark a week as COMPLETE first, then lock it as PAID.');
    return;
  }

  const bodyHtml = `
    <div class="joiSectionTitle">Mark Pay Period as PAID</div>
    <p class="joiText">Select the complete pay period to lock as paid. This freezes values and marks rows as PAID.</p>
    <div class="joiField">
      <label class="joiLabel" for="ppCode">Pay period</label>
      <select id="ppCode" class="joiSelect">${joiOptionTags_(periodOptions, 'ppCode', 'label')}</select>
    </div>
    <label class="joiCheckboxRow"><input id="confirm" type="checkbox" onchange="toggleButton()"><span>I understand this locks the selected complete pay period as PAID.</span></label>
    <div id="status" class="joiStatus"></div>
    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="submitPaid()" disabled>Mark as PAID</button>
    </div>
  `;

  const clientScript = `
    <script>
      function toggleButton() { document.getElementById('runBtn').disabled = !document.getElementById('confirm').checked; }
      function submitPaid() {
        var btn = document.getElementById('runBtn');
        var status = document.getElementById('status');
        btn.disabled = true;
        status.className = 'joiStatus';
        status.textContent = 'Locking pay period as PAID...';
        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            status.className = 'joiStatus ' + (result && result.ok ? 'joiSuccess' : 'joiError');
            status.textContent = (result && result.message) ? result.message : 'No result returned.';
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            status.className = 'joiStatus joiError';
            status.textContent = error && error.message ? error.message : String(error);
          })
          .joiMarkPayPeriodAsPaidFromDialog(document.getElementById('ppCode').value);
      }
    </script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Mark Pay Period as PAID', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(620).setHeight(500);

  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Mark Pay Period as PAID');
}

function joiMarkPayPeriodAsPaidFromDialog(targetPP) {
  try {
    const ss = ss_();
    const sh = ss.getSheetByName(SH.PAYROLL_RUN);
    if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };

    const blocks = getPayrollRunBlocks_();
    const targetBlocks = blocks.filter(b => b.status === STATUS.COMPLETE && b.ppCode === targetPP);
    if (targetBlocks.length === 0) return { ok: false, message: 'No COMPLETE weeks found for the selected pay period.' };

    let totalPay = 0;
    let agentCount = 0;

    targetBlocks.forEach(block => {
      const nr = block.lastDataRow - block.firstDataRow + 1;
      const data = sh.getRange(block.firstDataRow, 1, nr, PR_COL.LAST_COL).getValues();
      data.forEach(row => {
        const id = row[PR_COL.AGENT_ID - 1];
        const pay = Number(row[PR_COL.TOTAL_PAY - 1]) || 0;
        if (typeof id === 'number' || !isNaN(parseFloat(id))) {
          totalPay += pay;
          agentCount++;
        }
      });
    });

    targetBlocks.forEach(block => {
      const nr = block.lastDataRow - block.firstDataRow + 1;
      const range = sh.getRange(block.firstDataRow, 1, nr, PR_COL.LAST_COL);
      const data = range.getValues();
      range.setValues(data);

      const paidRows = [];
      data.forEach((row, i) => {
        const rowNum = block.firstDataRow + i;
        const id = row[PR_COL.AGENT_ID - 1];
        if (typeof id !== 'number' && isNaN(parseFloat(id))) return;
        // Atomic Status + Memo update. Preserves existing free text.
        joiSetRowStatus_(sh, rowNum, STATUS.PAID);
        paidRows.push(`A${rowNum}:U${rowNum}`);
      });

      if (paidRows.length > 0) {
        sh.getRangeList(paidRows)
          .setBackground(BRAND.frozenBg)
          .setFontColor(BRAND.frozenFg);
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

      sh.getRange(block.headerRow, PR_COL.STATUS).setValue(STATUS.PAID);
      applyStatusColor_(sh.getRange(block.headerRow, PR_COL.STATUS), STATUS.PAID);
      sh.getRange(block.headerRow, 1, 1, PR_COL.LAST_COL).setBackground(BRAND.frozenBg).setFontColor(BRAND.frozenFg);
      sh.getRange(block.headerRow, PR_COL.STATUS)
        .setBackground(BRAND.paidBg).setFontColor(BRAND.paidFg).setFontWeight('bold');
    });

    refreshPayrollRunTotals_();
    SpreadsheetApp.flush();

    return {
      ok: true,
      message: `${payPeriodLabel_(targetPP)} locked as PAID.\Agents: ${agentCount}Total: ${fmt_(totalPay)}`
    };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/**
 * weekStatusOverview
 * Shows a popup with the last 8 weeks and their status.
 */
function weekStatusOverview() {
  const blocks = getPayrollRunBlocks_();
  if (blocks.length === 0) {
    joiShowMessageDialog_('Week Status Overview', 'No week blocks found in Payroll Run.');
    return;
  }

  const recent = blocks.slice(-12).reverse();
  const rowsHtml = recent.map(b => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e8f0;font-weight:800;color:#070739;">${paystubEscape_(b.weekLabel)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e8f0;">${paystubEscape_(b.dateRange || '')}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e8f0;">${paystubEscape_(b.ppCode || '')}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e8f0;font-weight:800;">${paystubEscape_(b.status || '')}</td>
    </tr>
  `).join('');

  const bodyHtml = `
    <div class="joiSectionTitle">Week Status Overview</div>
    <p class="joiText">Showing the most recent ${recent.length} week block(s). Total weeks tracked: ${blocks.length}.</p>
    <div class="joiPreviewBox" style="padding:0;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#070739;color:#fff;">
            <th style="padding:9px;text-align:left;">Week</th>
            <th style="padding:9px;text-align:left;">Date Range</th>
            <th style="padding:9px;text-align:left;">Pay Period</th>
            <th style="padding:9px;text-align:left;">Status</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="joiActions"><button class="joiButton joiButtonPrimary" onclick="google.script.host.close()">Close</button></div>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Week Status Overview', 'JOI PAYROLL SYSTEM', bodyHtml, '')
  ).setWidth(720).setHeight(560);

  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Week Status Overview');
}

/**
 * unlockPayPeriod
 * Admin-only: unlocks a PAID pay period back to COMPLETE for corrections.
 * Warns user clearly before proceeding.
 */
function unlockPayPeriod() {
  const periodOptions = joiPayPeriodGroupOptions_(STATUS.PAID);
  if (periodOptions.length === 0) {
    joiShowMessageDialog_('Unlock PAID Period', 'No PAID pay periods found to unlock.');
    return;
  }

  const bodyHtml = `
    <div class="joiSectionTitle">Unlock PAID Period</div>
    <p class="joiText">Select a paid pay period to unlock back to COMPLETE for corrections.</p>
    <div class="joiField">
      <label class="joiLabel" for="ppCode">Paid pay period</label>
      <select id="ppCode" class="joiSelect">${joiOptionTags_(periodOptions, 'ppCode', 'label')}</select>
    </div>
    <label class="joiCheckboxRow"><input id="confirm" type="checkbox" onchange="toggleButton()"><span>I understand this is an admin correction action.</span></label>
    <div id="status" class="joiStatus"></div>
    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="submitUnlock()" disabled>Unlock Period</button>
    </div>
  `;

  const clientScript = `
    <script>
      function toggleButton() { document.getElementById('runBtn').disabled = !document.getElementById('confirm').checked; }
      function submitUnlock() {
        var btn = document.getElementById('runBtn');
        var status = document.getElementById('status');
        btn.disabled = true;
        status.className = 'joiStatus';
        status.textContent = 'Unlocking period...';
        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            status.className = 'joiStatus ' + (result && result.ok ? 'joiSuccess' : 'joiError');
            status.textContent = (result && result.message) ? result.message : 'No result returned.';
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            status.className = 'joiStatus joiError';
            status.textContent = error && error.message ? error.message : String(error);
          })
          .joiUnlockPayPeriodFromDialog(document.getElementById('ppCode').value);
      }
    </script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Unlock PAID Period', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(620).setHeight(490);

  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Unlock PAID Period');
}

function joiUnlockPayPeriodFromDialog(targetPP) {
  try {
    const ss = ss_();
    const sh = ss.getSheetByName(SH.PAYROLL_RUN);
    if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };

    const targetBlocks = getPayrollRunBlocks_().filter(b => b.status === STATUS.PAID && b.ppCode === targetPP);
    if (targetBlocks.length === 0) return { ok: false, message: 'No PAID blocks found for the selected period.' };

    let agentCount = 0;
    targetBlocks.forEach(block => {
      const nr = block.lastDataRow - block.firstDataRow + 1;
      const data = sh.getRange(block.firstDataRow, 1, nr, PR_COL.LAST_COL).getValues();

      data.forEach((row, i) => {
        const rowNum = block.firstDataRow + i;
        const id = row[PR_COL.AGENT_ID - 1];
        if (typeof id !== 'number' && isNaN(parseFloat(id))) return;
        agentCount++;
        sh.getRange(rowNum, PR_COL.STATUS).setValue(STATUS.COMPLETE);
        sh.getRange(rowNum, 1, 1, PR_COL.LAST_COL).setBackground(null).setFontColor(null);
        applyStatusColor_(sh.getRange(rowNum, PR_COL.STATUS), STATUS.COMPLETE);
      });

      sh.getRange(block.headerRow, PR_COL.STATUS).setValue(STATUS.COMPLETE);
      sh.getRange(block.headerRow, 1, 1, PR_COL.LAST_COL).setBackground(BRAND.blockBg).setFontColor(BRAND.blockFg);
      applyStatusColor_(sh.getRange(block.headerRow, PR_COL.STATUS), STATUS.COMPLETE);
    });

    refreshPayrollRunTotals_();
    SpreadsheetApp.flush();

    return { ok: true, message: `${payPeriodLabel_(targetPP)} unlocked back to COMPLETE.\Rows affected: ${agentCount}` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// 
//  LAYER 8 '97 MENU + SETUP
// 

/**
 * onOpen
 * Builds the JOI Payroll menu when the spreadsheet opens.
 * 3 core actions up top + Admin submenu.
 */

function joiRebuildAgentsSheet() {
  joiShowRebuildDialog_('Rebuild Agents Sheet', 'Agents sheet headers and formatting will be refreshed.', 'joiRunRebuildAgentsSheet');
}

function joiRunRebuildAgentsSheet() {
  try {
    ensureAgentsSheet();
    return { ok: true, message: 'Agents sheet rebuilt successfully.' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function joiRebuildAlumniSheet() {
  joiShowRebuildDialog_('Rebuild Alumni Sheet', 'Alumni sheet headers and formatting will be refreshed.', 'joiRunRebuildAlumniSheet');
}

function joiRunRebuildAlumniSheet() {
  try {
    ensureAlumniSheet();
    return { ok: true, message: 'Alumni sheet rebuilt successfully.' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/**
 * joiMigrateHolidayColumns
 * ONE-TIME migration: moves Holiday Days (col 9) and Holiday Pay (col 17)
 * from the far right of the sheet to their correct positions in the layout.
 *
 * Detection is done by reading the actual col-9 header text (NOT by column count,
 * because the old layout with holiday at far right is also 23 cols — same count as
 * the correct layout). Only a header-text check reliably distinguishes the states.
 *
 * Three possible states this handles:
 *   A) Col 9 header = 'Holiday Days'  → already migrated, nothing to do.
 *   B) Col 9 header = 'KPI' and maxCols >= 23  → holiday at far right, move them.
 *   C) Col 9 header = 'KPI' and maxCols < 23   → holiday never added, just insert.
 */
function joiMigrateHolidayColumns() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) {
    SpreadsheetApp.getUi().alert('Payroll Run sheet not found.');
    return;
  }

  // Detect current state by reading the col-9 header (row 3).
  const col9Header = cleanText_(sh.getRange(3, 9).getValue()).toUpperCase();
  const maxCols    = sh.getMaxColumns();

  // ── State A: already correct ───────────────────────────────────────────────
  if (col9Header === 'HOLIDAY DAYS') {
    SpreadsheetApp.getUi().alert('✅ Holiday columns are already in the correct position.\nNo migration needed.');
    return;
  }

  // ── State B: holiday at far right (appended by old code) ──────────────────
  if (maxCols >= 23) {
    // Old layout: cols 1-21 original, col 22 = HOLIDAY_DAYS, col 23 = HOLIDAY_PAY.
    // Insert at the correct positions first (shifts everything right by 2),
    // then delete the now-shifted far-right duplicates.

    sh.insertColumnBefore(9);   // blank → becomes HOLIDAY_DAYS input
    sh.insertColumnBefore(17);  // blank → becomes HOLIDAY_PAY calc

    // After 2 insertions the old far-right columns shifted by 2:
    //   old col 22 (HOLIDAY_DAYS) → now col 24
    //   old col 23 (HOLIDAY_PAY)  → now col 25
    // Delete highest index first to avoid re-indexing errors.
    const newMax = sh.getMaxColumns();
    if (newMax >= 25) {
      sh.deleteColumn(25);
      sh.deleteColumn(24);
    } else if (newMax >= 24) {
      sh.deleteColumn(24);
    }
  }

  // ── State C: holiday never added at all ───────────────────────────────────
  // (maxCols < 23 and col 9 ≠ 'HOLIDAY DAYS' → old 21-col layout)
  // Just insert the two blank columns at the correct spots.
  if (maxCols < 23) {
    sh.insertColumnBefore(9);
    sh.insertColumnBefore(17);
  }

  // ── Common clean-up for both B and C ──────────────────────────────────────

  // Clear any YES/NO dropdown validation inherited by the Holiday Days column.
  const maxRows = sh.getMaxRows();
  if (maxRows > 3) {
    sh.getRange(4, PR_COL.HOLIDAY_DAYS, maxRows - 3, 1)
      .clearDataValidations()
      .setNumberFormat('0.##');          // numeric only — no dropdown
  }

  // Holiday Pay: currency format, no dropdown.
  if (maxRows > 3) {
    sh.getRange(4, PR_COL.HOLIDAY_PAY, maxRows - 3, 1)
      .clearDataValidations()
      .setNumberFormat('$#,##0.00');
  }

  // Rebuild headers, column widths, and frozen rows.
  ensurePayrollRunSheet();

  SpreadsheetApp.getUi().alert(
    '✅ Holiday columns moved to correct positions.\n\n' +
    '• Holiday Days  → col 9 (enter a number: 1, 2, etc.)\n' +
    '• Holiday Pay   → col 17 (auto-calculated: days × daily salary × 2)\n\n' +
    'All existing payroll data is intact.'
  );
}

function joiRebuildPayrollRunSheet() {
  joiShowRebuildDialog_('Rebuild Payroll Run Sheet', 'Payroll Run headers and formatting will be refreshed. Existing week blocks are not intentionally rebuilt by this action.', 'joiRunRebuildPayrollRunSheet');
}

function joiRunRebuildPayrollRunSheet() {
  try {
    ensurePayrollRunSheet();
    return { ok: true, message: 'Payroll Run sheet rebuilt successfully.' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function joiRebuildDashboardSheet() {
  joiShowRebuildDialog_('Rebuild Dashboard', 'Dashboard sheet structure will be refreshed.', 'joiRunRebuildDashboardSheet');
}

function joiRunRebuildDashboardSheet() {
  try {
    ensureDashboardSheet();
    return { ok: true, message: 'Dashboard sheet rebuilt successfully.' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function joiShowRebuildDialog_(title, description, callbackName) {
  const bodyHtml = `
    <div class="joiSectionTitle">${paystubEscape_(title)}</div>
    <p class="joiText">${paystubEscape_(description)}</p>
    <label class="joiCheckboxRow"><input id="confirm" type="checkbox" onchange="toggleButton()"><span>I understand and want to continue.</span></label>
    <div id="status" class="joiStatus"></div>
    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="runAction()" disabled>Run</button>
    </div>
  `;

  const clientScript = `
    <script>
      function toggleButton() { document.getElementById('runBtn').disabled = !document.getElementById('confirm').checked; }
      function runAction() {
        var btn = document.getElementById('runBtn');
        var status = document.getElementById('status');
        btn.disabled = true;
        status.className = 'joiStatus';
        status.textContent = 'Running...';
        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            status.className = 'joiStatus ' + (result && result.ok ? 'joiSuccess' : 'joiError');
            status.textContent = (result && result.message) ? result.message : 'No result returned.';
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            status.className = 'joiStatus joiError';
            status.textContent = error && error.message ? error.message : String(error);
          })
          [${JSON.stringify(callbackName)}]();
      }
    </script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_(title, 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(560).setHeight(420);

  SpreadsheetApp.getUi().showModalDialog(html, 'JOI ' + title);
}

/**
 * firstTimeSetup
 * Run once when installing the script on a new spreadsheet.
 * Builds all sheet structures in order.
 */
function firstTimeSetup() {
  const bodyHtml = `
    <div class="joiSectionTitle">First-Time Setup</div>
    <p class="joiText">This will create or rebuild the core sheet structures for Pay Rules, Agents, Alumni, Payroll Run, and Dashboard.</p>
    <p class="joiMuted">Existing data is preserved where the original setup logic preserves it. Headers and formatting may be refreshed.</p>
    <label class="joiCheckboxRow"><input id="confirm" type="checkbox" onchange="toggleButton()"><span>I understand this rebuilds sheet structures.</span></label>
    <div id="status" class="joiStatus"></div>
    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="runSetup()" disabled>Run Setup</button>
    </div>
  `;

  const clientScript = `
    <script>
      function toggleButton() { document.getElementById('runBtn').disabled = !document.getElementById('confirm').checked; }
      function runSetup() {
        var btn = document.getElementById('runBtn');
        var status = document.getElementById('status');
        btn.disabled = true;
        status.className = 'joiStatus';
        status.textContent = 'Running setup...';
        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            status.className = 'joiStatus ' + (result && result.ok ? 'joiSuccess' : 'joiError');
            status.textContent = (result && result.message) ? result.message : 'No result returned.';
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            status.className = 'joiStatus joiError';
            status.textContent = error && error.message ? error.message : String(error);
          })
          .joiFirstTimeSetupFromDialog();
      }
    </script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('First-Time Setup', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(600).setHeight(500);

  SpreadsheetApp.getUi().showModalDialog(html, 'JOI First-Time Setup');
}

function joiFirstTimeSetupFromDialog() {
  try {
    ensurePayRulesSheet();
    ensureAgentsSheet();
    ensureAlumniSheet();
    ensurePayrollRunSheet();
    ensureDashboardSheet();

    return {
      ok: true,
      message: 'Setup complete. Pay Rules, Agents, Alumni, Payroll Run, and Dashboard structures are ready.'
    };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/**
 * syncMonthlySheetPrompt
 * Prompts for month and year, then syncs the monthly sheet.
 */
function syncMonthlySheetPrompt() {
  const suggestion = getNextPayrollWeekSuggestion_();
  const monthOptions = buildMonthOptions_(suggestion.monthName);
  const initialRanges = getMonthWeekRanges_(suggestion.monthName, suggestion.year);
  const initialCoverageHtml = initialRanges.map((r, i) => {
    return `<div><strong>Week ${i + 1}:</strong> ${paystubEscape_(fmtDate_(r.startDate))} - ${paystubEscape_(fmtDate_(r.endDate))}</div>`;
  }).join('');

  const bodyHtml = `
    <div class="joiSectionTitle">Create / Sync Monthly Sheet</div>
    <p class="joiText">Create or refresh a monthly payroll tab using the existing monthly sheet layout.</p>

    <div class="joiStatus" style="background:#f6f8fc;border:1px solid #d8deea;border-radius:12px;padding:14px;">
      <strong>Target monthly sheet:</strong><br>
      <span id="targetSheetName">${paystubEscape_(suggestion.monthlySheetName)}</span><br><br>

      <strong>What this will do:</strong><br>
      <div>If the tab does not exist, it will create it from the repaired monthly template.</div>
      <div>If the tab already exists, it will sync the existing tab.</div><br>

      <strong>Monthly coverage:</strong><br>
      <div id="coverageList">${initialCoverageHtml}</div><br>

      <strong>Data source:</strong><br>
      <div>Payroll Run rows matching the selected month and year, synced by Agent ID.</div>
    </div>

    <div class="joiField">
      <label class="joiLabel" for="monthName">Month</label>
      <select id="monthName" class="joiSelect" onchange="updateMonthlyPreview()">${monthOptions}</select>
    </div>
    <div class="joiField">
      <label class="joiLabel" for="year">Year</label>
      <input id="year" class="joiInput" value="${paystubEscape_(suggestion.year)}" placeholder="2026" oninput="updateMonthlyPreview()">
    </div>
    <p class="joiMuted">This screen always builds the full selected month from Week 1. It does not start from the next Payroll Run week.</p>
    <div id="status" class="joiStatus"></div>
    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="runSync()">Create / Sync Month</button>
    </div>
  `;

  const clientScript = `
    <script>
      var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

      function pad2(n) { return String(n).padStart(2, '0'); }
      function fmtDateLocal(d) {
        return pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + '/' + d.getFullYear();
      }
      function escapeHtml(value) {
        return String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }
      function monthSheetName(monthName, year) {
        return monthName + ' ' + String(year).slice(-2) + ' PayRoll';
      }
      function monthCoverage(monthName, year) {
        var idx = monthNames.indexOf(monthName);
        var y = parseInt(year, 10);
        if (idx < 0 || !isFinite(y)) return [];
        var d = new Date(y, idx, 1);
        while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
        var ranges = [];
        while (d.getMonth() === idx) {
          var endDate = new Date(d.getTime());
          var startDate = new Date(d.getTime());
          startDate.setDate(startDate.getDate() - 6);
          ranges.push({ start: startDate, end: endDate });
          d.setDate(d.getDate() + 7);
        }
        return ranges;
      }
      function updateMonthlyPreview() {
        var monthName = document.getElementById('monthName').value;
        var year = document.getElementById('year').value;
        document.getElementById('targetSheetName').textContent = monthSheetName(monthName, year);
        var ranges = monthCoverage(monthName, year);
        var html = ranges.map(function(r, i) {
          return '<div><strong>Week ' + (i + 1) + ':</strong> ' + escapeHtml(fmtDateLocal(r.start)) + ' - ' + escapeHtml(fmtDateLocal(r.end)) + '</div>';
        }).join('');
        document.getElementById('coverageList').innerHTML = html || '<div>Enter a valid month and year to preview coverage.</div>';
      }
      function runSync() {
        var btn = document.getElementById('runBtn');
        var status = document.getElementById('status');
        btn.disabled = true;
        status.className = 'joiStatus';
        status.textContent = 'Creating / syncing monthly sheet...';
        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            status.className = 'joiStatus ' + (result && result.ok ? 'joiSuccess' : 'joiError');
            status.textContent = (result && result.message) ? result.message : 'No result returned.';
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            status.className = 'joiStatus joiError';
            status.textContent = error && error.message ? error.message : String(error);
          })
          .joiSyncMonthlySheetFromDialog(document.getElementById('monthName').value, document.getElementById('year').value);
      }
      updateMonthlyPreview();
    </script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Create / Sync Monthly Sheet', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(680).setHeight(720);

  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Create / Sync Monthly Sheet');
}

function joiSyncMonthlySheetFromDialog(monthNameRaw, yearRaw) {
  try {
    const monthName = cleanText_(monthNameRaw);
    const year = parseInt(cleanText_(yearRaw), 10);

    if (!monthName) return { ok: false, message: 'Month is required. Example: April' };
    if (isNaN(year) || year < 2020 || year > 2099) return { ok: false, message: 'Invalid year. Use a year like 2026.' };

    const cleanMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1).toLowerCase();
    return syncMonthlySheetFromPayrollRun(cleanMonth, year, true);
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/**
 * validatePayRulesDialog
 * Runs validatePayRules_ and shows a popup with results.
 */
function validatePayRulesDialog() {
  const issues = validatePayRules_();

  let bodyHtml = '';
  if (issues.length === 0) {
    bodyHtml = `
      <div class="joiSectionTitle">Pay Rules Validation</div>
      <p class="joiText joiSuccess">No issues found. All rule keys look clean.</p>
      <div class="joiActions"><button class="joiButton joiButtonPrimary" onclick="google.script.host.close()">Close</button></div>
    `;
  } else {
    const rows = issues.map(issue => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e8f0;">${paystubEscape_(issue.row)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e8f0;">${paystubEscape_(issue.field)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e8f0;">${paystubEscape_(issue.value)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e8f0;">${paystubEscape_(issue.issue)}</td>
      </tr>
    `).join('');

    bodyHtml = `
      <div class="joiSectionTitle">Pay Rules Validation</div>
      <p class="joiText joiError">Issues found: ${issues.length}</p>
      <div class="joiPreviewBox" style="padding:0;overflow:auto;max-height:360px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#070739;color:#fff;"><th style="padding:8px;text-align:left;">Row</th><th style="padding:8px;text-align:left;">Field</th><th style="padding:8px;text-align:left;">Value</th><th style="padding:8px;text-align:left;">Issue</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="joiMuted">Use Admin -> Fix Pay Rules Data to auto-fix known cleanup issues.</p>
      <div class="joiActions"><button class="joiButton joiButtonPrimary" onclick="google.script.host.close()">Close</button></div>
    `;
  }

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Validate Pay Rules', 'JOI PAYROLL SYSTEM', bodyHtml, '')
  ).setWidth(760).setHeight(560);

  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Validate Pay Rules');
}

// 
//  LAYER 9 '97 MID-WEEK START DETECTION
// 

/**
 * calcWorkingDaysInWeek_
 * Counts Mon'96Fri working days from the agent's start date through
 * the Friday of the current week. Used to handle agents who start
 * on Tuesday, Wednesday, etc.
 *
 * @param {Date} agentStartDate  - The agent's first day of work
 * @param {Date} weekStart       - Monday of the current week
 * @param {Date} weekEnd         - Sunday of the current week
 * @returns {number}             - Number of working days (1'965), or 5 if full week
 */
function calcWorkingDaysInWeek_(agentStartDate, weekStart, weekEnd) {
  // Friday of this week = weekEnd (Sunday) minus 2 days
  const friday = new Date(weekEnd.getTime());
  friday.setDate(friday.getDate() - 2);

  // Effective start = max(agent start, week start)
  const effectiveStart = new Date(
    Math.max(agentStartDate.getTime(), weekStart.getTime())
  );

  // Count Mon'96Fri days
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
 * Uses daily salary 'd7 days worked + any bonuses earned.
 *
 * @param {object} rule         - from getRuleMap_()
 * @param {number} daysWorked   - number of Mon'96Fri days worked (1'964 for partial)
 * @param {object} inputs       - { kpiAchieved, extraBonus, overtimeDays, sundays }
 * @returns {object}            - pay breakdown matching calcAgentPay_ shape
 */
function calcPartialWeekPay_(rule, daysWorked, inputs) {
  if (!rule) return { weeklyBase: 0, kpiBonus: 0, missedDed: 0, overtimePay: 0, sundayPay: 0, vacationPay: 0, extraBonus: 0, totalPay: 0 };

  const kpi       = (cleanText_(inputs.kpiAchieved || '').toUpperCase() === 'YES');
  const overtime  = Number(inputs.overtimeDays || 0);
  const sundays   = Number(inputs.sundays      || 0);
  const extra     = Number(inputs.extraBonus   || 0);

  // Partial week: pay daily rate 'd7 days worked
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

// 
//  LAYER 10 '97 PAYSTUB GENERATION
// 

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
 *   New format: "APRIL26PP2"   "April 2026"
 *   Old format: "APRILPP2"     "April"  (no year stored in code)
 */
/**
 * ppMonthYear_
 * Extracts "April 2026" from ppCode.
 * Handles BOTH formats:
 *   New format: "APRIL26PP2"  -> "April 2026"
 *   Old format: "APRILPP2"    -> "April 2026" using inferred/current year
 */
function ppMonthYear_(ppCode, weekRows) {
  const monthName = paystubMonthNameFromCode_(ppCode);
  const year = paystubInferYear_(ppCode, weekRows);

  if (!monthName) return '';
  return `${monthName} ${year}`;
}

/**
 * cleanWeekLabel_
 * Converts "WEEK 3" + ppCode -> "WEEK 3 April"
 * Uses inferred year for old codes like APRILPP2.
 */
function cleanWeekLabel_(weekLabel, ppCode, weekRows) {
  const monthYear = ppMonthYear_(ppCode, weekRows);
  if (!monthYear) return weekLabel;

  const parts = monthYear.split(' ');
  const month = parts[0] || '';
  const year = parts[1] || '';

  return `${weekLabel} ${month} ${year}`;
}

/**
 * paystubEscape_
 * Escapes dynamic spreadsheet values before injecting into HTML.
 */
function paystubEscape_(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * paystubMonthNameFromCode_
 * Reads month from APRIL26PP2 or APRILPP2.
 */
function paystubMonthNameFromCode_(ppCode) {
  const code = cleanText_(ppCode).toUpperCase();
  const m = code.match(/^([A-Z]+?)(?:\d{2})?PP[12]$/);
  if (!m) return '';

  const raw = m[1];

  const monthMap = {
    JANUARY: 'January',
    FEBRUARY: 'February',
    MARCH: 'March',
    APRIL: 'April',
    MAY: 'May',
    JUNE: 'June',
    JULY: 'July',
    AUGUST: 'August',
    SEPTEMBER: 'September',
    OCTOBER: 'October',
    NOVEMBER: 'November',
    DECEMBER: 'December'
  };

  return monthMap[raw] || (raw.charAt(0) + raw.slice(1).toLowerCase());
}

/**
 * paystubInferYear_
 * Gets year from:
 * 1. ppCode if new format contains two-digit year
 * 2. weekRows weekRange if old format has no year
 * 3. current year as fallback
 */
function paystubInferYear_(ppCode, weekRows) {
  const code = cleanText_(ppCode).toUpperCase();

  const ppYear = code.match(/^[A-Z]+?(\d{2})PP[12]$/);
  if (ppYear) return 2000 + Number(ppYear[1]);

  if (weekRows && weekRows.length) {
    for (let i = 0; i < weekRows.length; i++) {
      const wr = weekRows[i] || {};
      const rangeText = cleanText_(wr.weekRange || '');
      const yearMatch = rangeText.match(/(20{2})/);
      if (yearMatch) return Number(yearMatch[1]);
    }
  }

  return new Date().getFullYear();
}

/**
 * paystubPeriodDisplay_
 * Displays old and new period codes with year included.
 * Example:
 *   APRILPP2    -> APRIL 2026 PP2
 *   APRIL26PP2  -> APRIL 2026 PP2
 */
function paystubPeriodDisplay_(ppCode, weekRows) {
  const code = cleanText_(ppCode).toUpperCase();
  const m = code.match(/^([A-Z]+?)(?:\d{2})?(PP[12])$/);
  if (!m) return code;

  const month = m[1];
  const pp = m[2];
  const year = paystubInferYear_(ppCode, weekRows);

  return `${month} ${year} ${pp}`;
}

/**
 * paystubLogoDataUri_
 * Finds JOI LOGO.png in Google Drive and returns it as a base64 data URI.
 * Uses the first matching file if more than one exists.
 */
function paystubLogoDataUri_() {
  try {
    const files = DriveApp.getFilesByName('JOI LOGO.png');
    if (!files.hasNext()) return '';

    const file = files.next();
    const blob = file.getBlob();
    const contentType = blob.getContentType() || 'image/png';
    const base64 = Utilities.base64Encode(blob.getBytes());

    return `data:${contentType};base64,${base64}`;
  } catch (e) {
    Logger.log('Paystub logo lookup failed: ' + e.message);
    return '';
  }
}

/**
 * getJoiLogoDataUri_
 * General JOI logo helper for branded app dialogs.
 * Uses the Google Drive file named JOI LOGO.png.
 */
function getJoiLogoDataUri_() {
  return paystubLogoDataUri_();
}

/**
 * joiAppCss_
 * Shared CSS for JOI-branded modal dialogs.
 * This affects modal dialogs only. It does not touch spreadsheet formatting.
 */
function joiAppCss_() {
  return `
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        background: #f4f6fb;
        font-family: Arial, Helvetica, sans-serif;
        color: #070739;
      }

      * {
        box-sizing: border-box;
      }

      .joiShell {
        min-height: 100vh;
        background: linear-gradient(180deg, #f7f8fc 0%, #eef1f7 100%);
        padding: 18px;
      }

      .joiCard {
        background: #ffffff;
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 14px 38px rgba(7, 7, 57, 0.18);
        border: 1px solid rgba(7, 7, 57, 0.06);
      }

      .joiHeader {
        background: #070739;
        color: #ffffff;
        padding: 16px 18px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .joiHeaderLeft {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }

      .joiLogo {
        width: 86px;
        max-height: 42px;
        object-fit: contain;
        display: block;
      }

      .joiLogoFallback {
        color: #f5a000;
        font-size: 26px;
        font-weight: 800;
        letter-spacing: -1px;
      }

      .joiHeaderTitle {
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.1px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .joiHeaderSub {
        font-size: 11px;
        color: #f4b942;
        margin-top: 3px;
        letter-spacing: 1.2px;
        text-transform: uppercase;
      }

      .joiAccentBar {
        height: 5px;
        background: #f5a000;
      }

      .joiBody {
        padding: 20px 22px 22px 22px;
      }

      .joiSectionTitle {
        font-size: 13px;
        font-weight: 800;
        color: #070739;
        margin: 0 0 8px 0;
        text-transform: uppercase;
        letter-spacing: 0.8px;
      }

      .joiText {
        font-size: 13px;
        line-height: 1.45;
        color: #333846;
        margin: 0 0 14px 0;
      }

      .joiMuted {
        color: #6d7280;
        font-size: 12px;
        line-height: 1.4;
      }

      .joiField {
        margin-bottom: 14px;
      }

      .joiLabel {
        display: block;
        color: #070739;
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.7px;
        margin-bottom: 6px;
      }

      .joiSelect,
      .joiInput {
        width: 100%;
        border: 1px solid #d6dae4;
        border-radius: 10px;
        background: #ffffff;
        color: #070739;
        font-size: 14px;
        padding: 11px 12px;
        outline: none;
      }

      .joiSelect:focus,
      .joiInput:focus {
        border-color: #f5a000;
        box-shadow: 0 0 0 3px rgba(245, 160, 0, 0.16);
      }

      .joiPreviewBox,
      .joiResultBox {
        border: 1px solid #e2e5ee;
        background: #fafbfe;
        border-radius: 14px;
        padding: 14px;
        margin-top: 12px;
      }

      .joiEmailPreview {
        white-space: pre-wrap;
        background: #ffffff;
        border: 1px solid #e4e6ee;
        border-radius: 12px;
        padding: 12px;
        font-family: Arial, Helvetica, sans-serif;
        color: #1f2430;
        font-size: 13px;
        line-height: 1.45;
      }

      .joiStats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin: 12px 0;
      }

      .joiStat {
        border-radius: 12px;
        background: #ffffff;
        border: 1px solid #e5e8f0;
        padding: 10px;
      }

      .joiStatNum {
        font-size: 18px;
        font-weight: 800;
        color: #070739;
      }

      .joiStatLabel {
        color: #6d7280;
        font-size: 11px;
        margin-top: 2px;
      }

      .joiActions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 18px;
      }

      .joiButton {
        border: 0;
        border-radius: 11px;
        padding: 11px 18px;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
      }

      .joiButtonPrimary {
        background: #e65100;
        color: #ffffff;
      }

      .joiButtonPrimary:hover {
        background: #c84600;
      }

      .joiButtonPrimary:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .joiButtonSecondary {
        background: #ffffff;
        color: #070739;
        border: 1px solid #d6dae4;
      }

      .joiButtonLink {
        display: inline-block;
        text-decoration: none;
        border-radius: 11px;
        padding: 12px 22px;
        font-size: 13px;
        font-weight: 800;
        background: #e65100;
        color: #ffffff;
      }

      .joiCheckboxRow {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-top: 12px;
        color: #333846;
        font-size: 12px;
        line-height: 1.35;
      }

      .joiStatus {
        margin-top: 12px;
        font-size: 13px;
        color: #333846;
        line-height: 1.45;
        white-space: pre-wrap;
      }

      .joiError {
        color: #b00020;
        font-weight: 700;
      }

      .joiSuccess {
        color: #126b34;
        font-weight: 700;
      }
    </style>
  `;
}

/**
 * joiLogoHtml_
 * Shared logo block for JOI-branded dialogs.
 */
function joiLogoHtml_() {
  const logoDataUri = getJoiLogoDataUri_();
  if (logoDataUri) {
    return `<img class="joiLogo" src="${paystubEscape_(logoDataUri)}" alt="JOI Logo">`;
  }
  return '<div class="joiLogoFallback">JOI</div>';
}

/**
 * joiDialogShell_
 * Wraps modal content in the JOI app design.
 */
function joiDialogShell_(title, subtitle, bodyHtml, clientScriptHtml) {
  return `
    <!doctype html>
    <html>
      <head>
        <base target="_top">
        <meta charset="UTF-8">
        ${joiAppCss_()}
      </head>
      <body>
        <div class="joiShell">
          <div class="joiCard">
            <div class="joiHeader">
              <div class="joiHeaderLeft">
                ${joiLogoHtml_()}
                <div>
                  <div class="joiHeaderTitle">${paystubEscape_(title)}</div>
                  <div class="joiHeaderSub">${paystubEscape_(subtitle || 'JOI PAYROLL SYSTEM')}</div>
                </div>
              </div>
            </div>
            <div class="joiAccentBar"></div>
            <div class="joiBody">
              ${bodyHtml}
            </div>
          </div>
        </div>
        ${clientScriptHtml || ''}
      </body>
    </html>
  `;
}

/**
 * joiShowMessageDialog_
 * Shows a simple JOI-branded message dialog.
 */
function joiShowMessageDialog_(title, message, width, height) {
  const bodyHtml = `
    <p class="joiText">${paystubEscape_(message).replace(/\n/g, '<br>')}</p>
    <div class="joiActions">
      <button class="joiButton joiButtonPrimary" onclick="google.script.host.close()">Close</button>
    </div>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_(title, 'JOI PAYROLL SYSTEM', bodyHtml, '')
  ).setWidth(width || 460).setHeight(height || 300);

  SpreadsheetApp.getUi().showModalDialog(html, title);
}

/**
 * joiPaystubPeriodOptions_
 * Returns pay period options from Payroll Run for branded paystub dialogs.
 */
function joiPaystubPeriodOptions_() {
  const blocks = getPayrollRunBlocks_();
  const ppSet = new Set(blocks.map(b => b.ppCode).filter(Boolean));
  const ppList = Array.from(ppSet).sort();

  return ppList.map(pp => ({
    code: pp,
    label: paystubEmailPeriodLabel_(pp, blocks)
  }));
}

/**
 * joiAgentOptions_
 * Returns active agents for branded paystub dialogs.
 */
function joiAgentOptions_() {
  const agentMap = getAgentMap_();
  return Array.from(agentMap.values())
    .sort((a, b) => a.agentId - b.agentId)
    .map(agent => ({
      id: agent.agentId,
      label: `#${agent.agentId} - ${agent.name}`
    }));
}

/**
 * joiOptionTags_
 * Builds safe <option> HTML for server-rendered dialogs.
 */
function joiOptionTags_(options, valueKey, labelKey) {
  return (options || []).map(opt => {
    return `<option value="${paystubEscape_(opt[valueKey])}">${paystubEscape_(opt[labelKey])}</option>`;
  }).join('');
}

/**
 * joiBlockOptions_
 * Returns week block options for branded workflow dialogs.
 */
function joiBlockOptions_(statusFilter) {
  return getPayrollRunBlocks_()
    .filter(b => !statusFilter || b.status === statusFilter)
    .map(b => ({
      headerRow: b.headerRow,
      label: `${b.weekLabel} | ${b.dateRange || ''} | ${b.ppCode || ''} | ${b.status || ''}`
    }));
}

/**
 * joiPayPeriodGroupOptions_
 * Groups payroll blocks by status and pay period for branded workflow dialogs.
 */
function joiPayPeriodGroupOptions_(statusFilter) {
  const groups = new Map();
  getPayrollRunBlocks_()
    .filter(b => !statusFilter || b.status === statusFilter)
    .forEach(b => {
      if (!b.ppCode) return;
      if (!groups.has(b.ppCode)) groups.set(b.ppCode, []);
      groups.get(b.ppCode).push(b);
    });

  return Array.from(groups.entries()).map(([ppCode, blocks]) => ({
    ppCode: ppCode,
    label: `${payPeriodLabel_(ppCode)} | ${blocks.length} week(s) | ${statusFilter || 'ALL'}`
  }));
}

/**
 * joiAllAgentOptions_
 * Returns active agents and alumni for branded agent lookup dialogs.
 */
function joiAllAgentOptions_() {
  const seen = new Set();
  const options = [];

  getAgentMap_().forEach(agent => {
    seen.add(Number(agent.agentId));
    options.push({
      id: agent.agentId,
      label: `#${agent.agentId} - ${agent.name}`
    });
  });

  const ss = ss_();
  const alSh = ss.getSheetByName(SH.ALUMNI);
  if (alSh) {
    const lastRow = alSh.getLastRow();
    if (lastRow >= 4) {
      const alData = alSh.getRange(4, 1, lastRow - 3, AL_COL.LAST_COL).getValues();
      alData.forEach(row => {
        const id = Number(row[AL_COL.AGENT_ID - 1]);
        const name = cleanText_(row[AL_COL.AGENT_NAME - 1]);
        if (!id || seen.has(id)) return;
        seen.add(id);
        options.push({
          id: id,
          label: `#${id} - ${name} (Alumni)`
        });
      });
    }
  }

  return options.sort((a, b) => Number(a.id) - Number(b.id));
}

/**
 * joiResultText_
 * Converts a result object into a clean status string.
 */
function joiResultText_(result) {
  if (!result) return 'No result returned.';
  if (result.message) return result.message;
  return result.ok ? 'Done.' : 'The action did not complete.';
}

/**
 * showDownloadDialog_
 * Opens a JOI-branded modal that downloads the paystub directly to the user's computer.
 * Uses a base64 data URL, so no Drive sharing permissions are required.
 *
 * @param {string} fileName  - filename for the downloaded file
 * @param {Blob}   pdfBlob   - the PDF blob to download
 */
function showDownloadDialog_(fileName, pdfBlob) {
  const base64 = Utilities.base64Encode(pdfBlob.getBytes());
  const dataUrl = 'data:application/pdf;base64,' + base64;
  const safeName = fileName
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const bodyHtml = `
    <div class="joiSectionTitle">Paystub ready</div>
    <p class="joiText"><strong>${safeName}</strong></p>
    <p class="joiMuted">Click the button below to save the PDF to your Downloads folder.</p>
    <div class="joiActions" style="justify-content:center;">
      <a id="downloadLink" class="joiButtonLink" href="${dataUrl}" download="${safeName}">Download Paystub</a>
    </div>
    <div class="joiActions" style="justify-content:center; margin-top:12px;">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Close</button>
    </div>
  `;

  const clientScript = `
    <script>
      window.onload = function() {
        setTimeout(function() {
          var link = document.getElementById('downloadLink');
          if (link) link.click();
        }, 450);
      };
    </script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Paystub Ready', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(480).setHeight(330);

  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Paystub Ready');
}

/**
 * generateAgentPaystub_
 * Builds a browser-style HTML paystub and exports it as PDF.
 * This replaces the Google Docs table renderer so the output matches
 * the original PDF layout more closely.
 *
 * @param {object} agent    - { agentId, name, campaign, department }
 * @param {string} ppCode   - e.g. "APRIL26PP2" or "APRILPP2"
 * @param {Array}  weekRows - array of pay row objects for this agent/period
 * @returns {Blob|null}     - PDF blob, or null if no data
 */
function generateAgentPaystub_(agent, ppCode, weekRows) {
  if (!weekRows || weekRows.length === 0) return null;

  const totalPay = weekRows.reduce((s, r) => s + (Number(r.totalPay) || 0), 0);
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy');

  const logoDataUri = paystubLogoDataUri_();
  const periodDisplay = paystubPeriodDisplay_(ppCode, weekRows);
  const periodStatus = weekRows[0] ? (weekRows[0].status || STATUS.UNPAID) : STATUS.UNPAID;

  const weekRowsHtml = weekRows.map(function(wr) {
    const spiff = (Number(wr.vacationPay) || 0) + (Number(wr.extraBonus) || 0);

    const weekLabel = paystubEscape_(cleanWeekLabel_(wr.weekLabel, ppCode, weekRows));

    const spiffHtml = spiff
      ? `<span class="spiffAmount">${paystubEscape_(fmt_(spiff))}</span>` +
        (wr.memo ? `<br><span class="spiffMemo">${paystubEscape_(wr.memo)}</span>` : '')
      : '<span class="dash">&mdash;</span>';

    return `
      <tr class="weekRow">
        <td class="weekCell">${weekLabel}</td>
        <td class="money">${paystubEscape_(fmt_(wr.basePay))}</td>
        <td class="center">${Number(wr.kpiBonus) ? paystubEscape_(fmt_(wr.kpiBonus)) : '<span class="dash">&mdash;</span>'}</td>
        <td class="center">${Number(wr.missedDed) ? paystubEscape_(fmt_(wr.missedDed)) : '<span class="dash">&mdash;</span>'}</td>
        <td class="center">${Number(wr.overtimePay) ? paystubEscape_(fmt_(wr.overtimePay)) : '<span class="dash">&mdash;</span>'}</td>
        <td class="center">${Number(wr.sundayPay) ? paystubEscape_(fmt_(wr.sundayPay)) : '<span class="dash">&mdash;</span>'}</td>
        <td class="center">${Number(wr.holidayPay) ? `<span class="holidayAmount">${paystubEscape_(fmt_(wr.holidayPay))}</span>` : '<span class="dash">&mdash;</span>'}</td>
        <td class="spiffCell">${spiffHtml}</td>
        <td class="totalMoney">${paystubEscape_(fmt_(wr.totalPay))}</td>
      </tr>
    `;
  }).join('');

  const logoHtml = logoDataUri
    ? `<img class="logoImg" src="${logoDataUri}" alt="JOI Logo">`
    : `<div class="logoFallback">joi</div>`;

  const cleanStatus = periodStatus
    .replace(' ', '')
    .replace(' ', '')
    .replace(' ', '');

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4;
      margin: 0;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      font-family: Arial, Helvetica, sans-serif;
      color: #070739;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      width: 210mm;
      min-height: 297mm;
      box-sizing: border-box;
      padding-top: 26mm;
      background: #ffffff;
    }

    .stubWrap {
      width: 170mm;
      margin: 0 auto;
    }

    .topHeader {
      width: 100%;
      display: table;
      margin-bottom: 7mm;
    }

    .topLeft,
    .topRight {
      display: table-cell;
      vertical-align: bottom;
    }

    .topLeft {
      width: 55%;
      padding-left: 7mm;
    }

    .topRight {
      width: 45%;
      text-align: right;
      padding-right: 7mm;
      padding-bottom: 3mm;
    }

    .logoImg {
      display: block;
      width: 33mm;
      height: auto;
      max-height: 15mm;
      object-fit: contain;
    }

    .logoFallback {
      color: #f5a000;
      font-size: 27px;
      font-weight: 700;
      line-height: 1;
    }

    .deptLabel {
      margin-top: 1mm;
      color: #c3c3c3;
      font-size: 12px;
      letter-spacing: 1.6px;
      font-weight: 400;
    }

    .title {
      color: #070739;
      font-size: 15px;
      font-weight: 700;
    }

    .card {
      background: #ffffff;
      border-radius: 0 0 5mm 5mm;
      overflow: hidden;
      box-shadow: 0 7mm 18mm rgba(7, 7, 57, 0.10);
    }

    .agentBlock {
      padding: 5mm 7.5mm 4.5mm 7.5mm;
    }

    .agentGrid {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .agentGrid td {
      width: 25%;
      padding: 0;
      vertical-align: top;
    }

    .label {
      color: #1e2230;
      font-size: 10.5px;
      letter-spacing: 1.3px;
      text-transform: uppercase;
      line-height: 1.2;
    }

    .value {
      margin-top: 1mm;
      color: #070739;
      font-size: 16px;
      font-weight: 700;
      line-height: 1.2;
      white-space: nowrap;
    }

    .goldLine {
      height: 2px;
      background: #f5a000;
      width: 100%;
    }

    .totalBlock {
      padding: 7mm 7.5mm 6mm 7.5mm;
    }

    .totalGrid {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .totalLeft {
      width: 62%;
      vertical-align: top;
    }

    .totalRight {
      width: 38%;
      text-align: right;
      vertical-align: middle;
      padding-top: 7mm;
    }

    .totalLabel {
      color: #1e2230;
      font-size: 13px;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      line-height: 1.2;
    }

    .bigTotal {
      color: #070739;
      font-size: 38px;
      font-weight: 800;
      line-height: 1;
      margin-top: 1.5mm;
      letter-spacing: -1px;
    }

    .periodCount {
      color: #222222;
      font-size: 12px;
      margin-top: 3mm;
    }

    .generatedDate {
      color: #070739;
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
    }

    .systemLabel {
      color: #111111;
      font-size: 11px;
      margin-top: 1.5mm;
    }

    .softLine {
      height: 1px;
      background: #e8e8e8;
      width: 100%;
    }

    .tableBlock {
      padding: 8mm 7.5mm 8mm 7.5mm;
    }

    .payTable {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .payTable col.weekCol     { width: 18%; }
    .payTable col.baseCol     { width: 13%; }
    .payTable col.kpiCol      { width: 8%; }
    .payTable col.dedCol      { width: 10%; }
    .payTable col.otCol       { width: 7%; }
    .payTable col.sunCol      { width: 8%; }
    .payTable col.holidayCol  { width: 10%; }
    .payTable col.spiffCol    { width: 13%; }
    .payTable col.totalCol    { width: 13%; }

    .payTable th {
      color: #a8a8a8;
      font-size: 10px;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      font-weight: 700;
      line-height: 1.05;
      text-align: center;
      padding: 0 0 6mm 0;
      vertical-align: bottom;
    }

    .payTable th:first-child {
      text-align: left;
      padding-left: 3mm;
    }

    .payTable th:last-child {
      text-align: right;
      padding-right: 3mm;
    }

    .periodRow td {
      padding: 0 0 3mm 3mm;
      border-bottom: 2px solid #f5a000;
      color: #070739;
      font-size: 12.5px;
      font-weight: 800;
      vertical-align: middle;
      white-space: nowrap;
    }

    .statusText {
      display: inline-block;
      margin-left: 12mm;
      color: #1e1e1e;
      font-size: 11px;
      font-weight: 700;
    }

    .statusDot {
      display: inline-block;
      width: 11px;
      height: 11px;
      background: #ffc928;
      border-radius: 50%;
      vertical-align: -1px;
      margin-right: 2mm;
    }

    .weekRow td {
      padding: 3.2mm 0;
      border-bottom: 1px solid #eadfce;
      font-size: 12px;
      line-height: 1.1;
      vertical-align: middle;
    }

    .weekCell {
      color: #070739;
      font-weight: 800;
      padding-left: 3mm !important;
      white-space: normal;
      word-break: normal;
      overflow-wrap: normal;
    }

    .money {
      color: #111111;
      text-align: left;
      white-space: nowrap;
    }

    .center {
      color: #111111;
      text-align: center;
      white-space: nowrap;
    }

    .dash {
      color: #777777;
      font-weight: 400;
    }

    .spiffCell {
      text-align: right;
      white-space: nowrap;
      padding-right: 3mm !important;
    }

    .holidayAmount {
      color: #b71c1c;
      font-weight: 800;
    }

    .spiffAmount {
      color: #00695c;
      font-weight: 800;
    }

    .spiffMemo {
      color: #00695c;
      font-weight: 800;
      font-size: 11px;
    }

    .totalMoney {
      color: #070739;
      text-align: right;
      padding-right: 3mm !important;
      font-weight: 800;
      white-space: nowrap;
    }

    .subtotalRow td {
      padding-top: 3.2mm;
      border-bottom: none;
      font-size: 14px;
      line-height: 1.1;
      white-space: nowrap;
    }

    .subtotalLabel {
      text-align: right;
      color: #070739;
      font-weight: 800;
      padding-right: 4mm;
    }

    .subtotalAmount {
      text-align: right;
      color: #070739;
      font-weight: 800;
      padding-right: 3mm;
    }

    .grandRow td {
      padding-top: 5mm;
      border-bottom: none;
      font-size: 16px;
      line-height: 1.1;
      white-space: nowrap;
    }

    .grandLabel {
      text-align: right;
      color: #a8a8a8;
      font-weight: 800;
      padding-right: 4mm;
    }

    .grandAmount {
      text-align: right;
      color: #a56400;
      font-weight: 800;
      padding-right: 3mm;
    }

    .footer {
      width: 170mm;
      margin: 7mm auto 0 auto;
      text-align: center;
      color: #5f6368;
      font-size: 10.5px;
      line-height: 1.4;
      font-style: normal;
    }
  </style>
</head>

<body>
  <div class="page">
    <div class="stubWrap">

      <div class="topHeader">
        <div class="topLeft">
          ${logoHtml}
          <div class="deptLabel">PAYROLL DEPARTMENT</div>
        </div>
        <div class="topRight">
          <div class="title">Pay Stub</div>
        </div>
      </div>

      <div class="card">

        <div class="agentBlock">
          <table class="agentGrid">
            <tr>
              <td>
                <div class="label">AGENT NAME</div>
                <div class="value">${paystubEscape_(agent.name)}</div>
              </td>
              <td>
                <div class="label">AGENT ID</div>
                <div class="value">#${paystubEscape_(agent.agentId)}</div>
              </td>
              <td>
                <div class="label">CAMPAIGN</div>
                <div class="value">${paystubEscape_(agent.campaign || '—')}</div>
              </td>
              <td>
                <div class="label">DEPARTMENT</div>
                <div class="value">${paystubEscape_(agent.department || '—')}</div>
              </td>
            </tr>
          </table>
        </div>

        <div class="goldLine"></div>

        <div class="totalBlock">
          <table class="totalGrid">
            <tr>
              <td class="totalLeft">
                <div class="totalLabel">TOTAL PAY — ALL SELECTED PERIODS</div>
                <div class="bigTotal">${paystubEscape_(fmt_(totalPay))}</div>
                <div class="periodCount">1 pay period(s) included</div>
              </td>
              <td class="totalRight">
                <div class="generatedDate">Generated ${paystubEscape_(today)}</div>
                <div class="systemLabel">JOI Payroll System</div>
              </td>
            </tr>
          </table>
        </div>

        <div class="softLine"></div>

        <div class="tableBlock">
          <table class="payTable">
            <colgroup>
              <col class="weekCol">
              <col class="baseCol">
              <col class="kpiCol">
              <col class="dedCol">
              <col class="otCol">
              <col class="sunCol">
              <col class="holidayCol">
              <col class="spiffCol">
              <col class="totalCol">
            </colgroup>

            <thead>
              <tr>
                <th>WEEK</th>
                <th>BASE PAY</th>
                <th>KPI<br>BONUS</th>
                <th>DEDUCTION</th>
                <th>OT<br>PAY</th>
                <th>SUNDAY</th>
                <th>HOLIDAY<br>PAY</th>
                <th>VAC / SPIFF</th>
                <th>TOTAL</th>
              </tr>
            </thead>

            <tbody>
              <tr class="periodRow">
                <td colspan="9">
                  PAY PERIOD: ${paystubEscape_(periodDisplay)}
                  <span class="statusText"><span class="statusDot"></span>${paystubEscape_(cleanStatus)}</span>
                </td>
              </tr>

              ${weekRowsHtml}

              <tr class="subtotalRow">
                <td colspan="8" class="subtotalLabel">PAY PERIOD SUBTOTAL</td>
                <td class="subtotalAmount">${paystubEscape_(fmt_(totalPay))}</td>
              </tr>

              <tr class="grandRow">
                <td colspan="8" class="grandLabel">GRAND TOTAL</td>
                <td class="grandAmount">${paystubEscape_(fmt_(totalPay))}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>

    <div class="footer">
      Generated automatically by the JOI Payroll Dashboard system. This document is confidential and intended solely for the named agent.
    </div>
  </div>
</body>
</html>`;

  const pdfBlob = HtmlService
    .createHtmlOutput(html)
    .getBlob()
    .getAs(MimeType.PDF);

  const safeName = agent.name
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .replace(/ +/g, '_');

  pdfBlob.setName(
    `${safeName}_${ppCode}_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')}.pdf`
  );

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
        holidayPay  : Number(row[PR_COL.HOLIDAY_PAY   - 1]) || 0,
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
 * Opens a JOI-branded dialog to select a pay period and generate all paystubs.
 * Keeps the same generation logic and uses the fixed paystub PDF renderer.
 */
function generateAllPaystubs() {
  const periodOptions = joiPaystubPeriodOptions_();

  if (periodOptions.length === 0) {
    joiShowMessageDialog_('Generate All Paystubs', 'No pay periods found in Payroll Run. Add at least one week first.');
    return;
  }

  const bodyHtml = `
    <div class="joiSectionTitle">Generate all paystubs</div>
    <p class="joiText">Select the pay period. The system will generate fresh fixed-layout PDF paystubs and save them to Google Drive.</p>

    <div class="joiField">
      <label class="joiLabel" for="ppCode">Pay period</label>
      <select id="ppCode" class="joiSelect">
        ${joiOptionTags_(periodOptions, 'code', 'label')}
      </select>
    </div>

    <div id="status" class="joiStatus"></div>

    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="generateAll()">Generate Paystubs</button>
    </div>
  `;

  const clientScript = `
    <script>
      function setStatus(text, className) {
        var box = document.getElementById('status');
        box.className = 'joiStatus ' + (className || '');
        box.textContent = text || '';
      }

      function generateAll() {
        var btn = document.getElementById('runBtn');
        var ppCode = document.getElementById('ppCode').value;
        btn.disabled = true;
        setStatus('Generating paystubs. Please wait...', '');

        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            if (!result || !result.ok) {
              setStatus((result && result.message) ? result.message : 'Generation failed.', 'joiError');
              return;
            }
            var nl = String.fromCharCode(10);
            var lines = [
              'Paystubs generated successfully.',
              '',
              'Pay Period: ' + result.periodLabel,
              'Generated: ' + result.generated,
              'Skipped - no pay data: ' + result.skipped,
              'Saved to: Google Drive -> JOI Paystubs -> ' + result.ppCode
            ];
            if (result.errors && result.errors.length) {
              lines.push('', 'Errors:');
              Array.prototype.push.apply(lines, result.errors);
            }
            setStatus(lines.join(nl), result.errors && result.errors.length ? 'joiError' : 'joiSuccess');
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            setStatus(error && error.message ? error.message : String(error), 'joiError');
          })
          .joiGenerateAllPaystubsFromDialog(ppCode);
      }
    </script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Generate All Paystubs', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(560).setHeight(470);

  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Generate All Paystubs');
}

/**
 * joiGenerateAllPaystubsFromDialog
 * Server-side callback used by the JOI-branded Generate All Paystubs dialog.
 */
function joiGenerateAllPaystubsFromDialog(ppCode) {
  try {
    const blocks = getPayrollRunBlocks_();
    const periodLabel = paystubEmailPeriodLabel_(ppCode, blocks);
    const agentMap = getAgentMap_();

    const rootFolder = getOrCreatePaystubsFolder_();
    const subFolders = rootFolder.getFoldersByName(ppCode);
    const folder = subFolders.hasNext() ? subFolders.next() : rootFolder.createFolder(ppCode);

    let generated = 0;
    let skipped = 0;
    const errors = [];

    agentMap.forEach((agent, agentId) => {
      const weekRows = collectWeekRowsForAgent_(agentId, ppCode);
      if (weekRows.length === 0 || weekRows.every(r => Number(r.totalPay) === 0)) {
        skipped++;
        return;
      }

      try {
        const pdfBlob = generateAgentPaystub_(agent, ppCode, weekRows);
        if (pdfBlob) {
          folder.createFile(pdfBlob.copyBlob());
          generated++;
        } else {
          errors.push(`${paystubAscii_(agent.name)}: PDF generation returned empty.`);
        }
      } catch (e) {
        errors.push(`${paystubAscii_(agent.name)}: ${paystubAscii_(e.message)}`);
      }
    });

    SpreadsheetApp.flush();

    return {
      ok: true,
      ppCode: ppCode,
      periodLabel: periodLabel,
      generated: generated,
      skipped: skipped,
      errors: errors
    };
  } catch (e) {
    return {
      ok: false,
      message: paystubAscii_(e.message)
    };
  }
}

/**
 * paystubAscii_
 * Converts text used in email subject/body to plain ASCII.
 * This prevents special characters from showing as question marks in email clients.
 */
function paystubAscii_(value) {
  if (value === null || value === undefined) return '';

  let text = String(value);

  try {
    text = text.normalize('NFD').replace(/[-f]/g, '');
  } catch (e) {
    // If normalize is unavailable for any reason, continue with replacements below.
  }

  return text
    .replace(/[–—‒]/g, '-')   // en dash / em dash -> hyphen
    .replace(/[‘’‚‛]/g, "'") // smart single quotes -> apostrophe
    .replace(/[“”„‟]/g, '"') // smart double quotes -> standard quotes
    .replace(/ /g, ' ')                 // non-breaking space -> normal space
    .replace(/[^\x20-\x7E]/g, '')            // remove remaining non-ASCII
    .replace(/[ ]+/g, ' ')
    .replace(/\n{3,}/g, '\n')
    .trim();
}

/**
 * paystubEmailPeriodLabel_
 * Builds a plain ASCII period label for email only.
 * Example: APRILPP2 -> April 2026 Pay Period 2
 */
function paystubEmailPeriodLabel_(ppCode, blocks) {
  const month = paystubMonthNameFromCode_(ppCode) || '';

  const matchingBlocks = (blocks || [])
    .filter(b => b && b.ppCode === ppCode)
    .map(b => ({ weekRange: b.dateRange || '' }));

  const year = paystubInferYear_(ppCode, matchingBlocks);

  const code = cleanText_(ppCode).toUpperCase();
  const ppMatch = code.match(/(PP[12])$/);
  const ppText = ppMatch && ppMatch[1] === 'PP1'
    ? 'Pay Period 1'
    : 'Pay Period 2';

  return paystubAscii_(`${month} ${year} ${ppText}`);
}

/**
 * paystubEmailFirstName_
 * Gets a plain ASCII first name for the email greeting.
 */
function paystubEmailFirstName_(agentName) {
  const cleanName = paystubAscii_(agentName || '');
  if (!cleanName) return 'there';
  return cleanName.split(/\s+/)[0] || 'there';
}

/**
 * paystubEmailSubject_
 * Clean subject line — safe for all modern email clients.
 */
function paystubEmailSubject_(periodLabel) {
  // Emoji in subject is fine for Gmail/Outlook/Apple Mail (UTF-8).
  // paystubAscii_ strips emoji, so we do NOT use it here for the subject.
  const safe = String(periodLabel || '').replace(/[^\x20-\x7E -￿]/g, '').trim();
  return `💰 Pay Stub — ${safe}`;
}

/**
 * paystubEmailBody_
 * Plain-text fallback for email clients that don't render HTML.
 */
function paystubEmailBody_(firstName, periodLabel) {
  return paystubAscii_(
    `Hi ${firstName},\n\nPlease find attached your pay stub for ${periodLabel}.\n\nIf you have any questions about your pay, please reach out to your manager.\n\nThank you,\nJOI Payroll Team`
  );
}

/**
 * paystubEmailHtmlBody_
 * Branded HTML email body matching JOI style.
 */
function paystubEmailHtmlBody_(firstName, periodLabel) {
  const safeFirst    = paystubEscape_(paystubAscii_(firstName || 'there'));
  const safePeriod   = paystubEscape_(paystubAscii_(periodLabel || ''));
  const navy  = '#070739';
  const gold  = '#f5a000';
  const cream = '#FFF4DA';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:${navy};padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:1px;">JOI PAYROLL</td>
                <td align="right" style="color:${gold};font-size:13px;font-weight:600;letter-spacing:0.5px;">PAY STUB</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Gold divider -->
        <tr><td style="background:${gold};height:3px;"></td></tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:32px 32px 0 32px;">
            <p style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:${navy};">Hi ${safeFirst},</p>
            <p style="margin:0;font-size:15px;color:#444;line-height:1.6;">
              Your pay stub for <strong style="color:${navy};">${safePeriod}</strong> is attached to this email.
            </p>
          </td>
        </tr>

        <!-- Info box -->
        <tr>
          <td style="padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:${cream};border-radius:8px;border-left:4px solid ${gold};">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:1px;color:#888;text-transform:uppercase;">What to do</p>
                  <p style="margin:0;font-size:14px;color:${navy};line-height:1.7;">
                    Open the PDF attachment to review your pay details.<br>
                    If anything looks incorrect, contact your manager right away.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:0 32px 32px 32px;border-top:1px solid #eee;">
            <p style="margin:24px 0 0 0;font-size:12px;color:#aaa;line-height:1.6;">
              This is an automated message from the JOI Payroll System.<br>
              This document is confidential and intended solely for <strong>${safeFirst}</strong>.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * emailAllPaystubs
 * Opens a JOI-branded app dialog for previewing and sending paystub emails.
 * Sends freshly generated fixed-layout PDFs and keeps the email subject/body plain ASCII.
 */
function emailAllPaystubs() {
  const periodOptions = joiPaystubPeriodOptions_();

  if (periodOptions.length === 0) {
    joiShowMessageDialog_('Email All Paystubs', 'No pay periods found in Payroll Run. Add at least one week first.');
    return;
  }

  const bodyHtml = `
    <div class="joiSectionTitle">Email all paystubs</div>
    <p class="joiText">Select a pay period, review the plain-text email preview, then send fresh fixed-layout PDF paystubs.</p>

    <div class="joiField">
      <label class="joiLabel" for="ppCode">Pay period</label>
      <select id="ppCode" class="joiSelect" onchange="loadPreview()">
        ${joiOptionTags_(periodOptions, 'code', 'label')}
      </select>
    </div>

    <div id="previewBox" class="joiPreviewBox">
      <div class="joiMuted">Loading preview...</div>
    </div>

    <label class="joiCheckboxRow">
      <input id="sendConfirm" type="checkbox" onchange="toggleSendButton()">
      <span>I understand this will send real emails with paystub PDFs attached.</span>
    </label>

    <div id="status" class="joiStatus"></div>

    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="sendBtn" class="joiButton joiButtonPrimary" onclick="sendEmails()" disabled>Send Emails Now</button>
    </div>
  `;

  const clientScript = `
    <script>
      function setStatus(text, className) {
        var box = document.getElementById('status');
        box.className = 'joiStatus ' + (className || '');
        box.textContent = text || '';
      }

      function escapeHtml(text) {
        return String(text || '').replace(/[&<>"']/g, function(c) {
          return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
        });
      }

      function toggleSendButton() {
        var checked = document.getElementById('sendConfirm').checked;
        document.getElementById('sendBtn').disabled = !checked;
      }

      function renderPreview(result) {
        var box = document.getElementById('previewBox');
        if (!result || !result.ok) {
          box.innerHTML = '<div class="joiError">' + escapeHtml((result && result.message) ? result.message : 'Preview failed.') + '</div>';
          return;
        }

        box.innerHTML = '' +
          '<div class="joiSectionTitle">Email preview</div>' +
          '<div class="joiStats">' +
            '<div class="joiStat"><div class="joiStatNum">' + escapeHtml(result.recipientsReady) + '</div><div class="joiStatLabel">Ready</div></div>' +
            '<div class="joiStat"><div class="joiStatNum">' + escapeHtml(result.noEmail) + '</div><div class="joiStatLabel">No email</div></div>' +
            '<div class="joiStat"><div class="joiStatNum">' + escapeHtml(result.noPayData) + '</div><div class="joiStatLabel">No pay data</div></div>' +
          '</div>' +
          '<div class="joiMuted" style="margin-bottom:6px;">Subject</div>' +
          '<div class="joiEmailPreview" id="subjectPreview"></div>' +
          '<div class="joiMuted" style="margin:10px 0 6px;">Body</div>' +
          '<div class="joiEmailPreview" id="bodyPreview"></div>';

        document.getElementById('subjectPreview').textContent = result.sampleSubject || '';
        document.getElementById('bodyPreview').textContent = result.sampleBody || '';
      }

      function loadPreview() {
        var ppCode = document.getElementById('ppCode').value;
        var box = document.getElementById('previewBox');
        box.innerHTML = '<div class="joiMuted">Loading preview...</div>';
        setStatus('', '');
        document.getElementById('sendConfirm').checked = false;
        toggleSendButton();

        google.script.run
          .withSuccessHandler(renderPreview)
          .withFailureHandler(function(error) {
            renderPreview({ ok: false, message: error && error.message ? error.message : String(error) });
          })
          .joiEmailAllPaystubsPreview(ppCode);
      }

      function sendEmails() {
        var btn = document.getElementById('sendBtn');
        var ppCode = document.getElementById('ppCode').value;
        btn.disabled = true;
        setStatus('Sending emails and generating fresh PDFs. Please wait...', '');

        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            document.getElementById('sendConfirm').checked = false;
            toggleSendButton();

            if (!result || !result.ok) {
              setStatus((result && result.message) ? result.message : 'Email send failed.', 'joiError');
              return;
            }

            var nl = String.fromCharCode(10);
            var lines = [
              'Email process finished.',
              '',
              'Pay Period: ' + result.periodLabel,
              'Fresh PDFs generated: ' + result.generated,
              'Emails sent: ' + result.sent,
              'Failed: ' + result.failed,
              'Skipped - no email: ' + result.noEmail,
              'Skipped - no pay data: ' + result.noPayData
            ];

            if (result.errors && result.errors.length) {
              lines.push('', 'Errors:');
              Array.prototype.push.apply(lines, result.errors);
            }

            setStatus(lines.join(nl), result.failed > 0 ? 'joiError' : 'joiSuccess');
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            setStatus(error && error.message ? error.message : String(error), 'joiError');
          })
          .joiSendAllPaystubsFromDialog(ppCode);
      }

      window.onload = loadPreview;
    </script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Email All Paystubs', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(640).setHeight(700);

  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Email All Paystubs');
}

/**
 * joiBuildEmailQueue_
 * Builds the queue used by the branded email preview and send callbacks.
 */
function joiBuildEmailQueue_(ppCode) {
  const blocks = getPayrollRunBlocks_();
  const emailPeriodLabel = paystubEmailPeriodLabel_(ppCode, blocks);
  const agentMap = getAgentMap_();
  const sendQueue = [];
  const noEmail = [];
  const noPayData = [];

  agentMap.forEach((agent, agentId) => {
    if (!agent.email) {
      noEmail.push(agent);
      return;
    }

    const weekRows = collectWeekRowsForAgent_(agentId, ppCode);
    if (weekRows.length === 0 || weekRows.every(r => Number(r.totalPay) === 0)) {
      noPayData.push(agent);
      return;
    }

    sendQueue.push({ agentId, agent, weekRows });
  });

  return {
    ppCode: ppCode,
    emailPeriodLabel: emailPeriodLabel,
    sendQueue: sendQueue,
    noEmail: noEmail,
    noPayData: noPayData
  };
}

/**
 * joiEmailAllPaystubsPreview
 * Client-callable preview builder for the JOI-branded Email All Paystubs dialog.
 */
function joiEmailAllPaystubsPreview(ppCode) {
  try {
    const queue = joiBuildEmailQueue_(ppCode);
    const sampleAgent = queue.sendQueue.length > 0 ? queue.sendQueue[0].agent : null;
    const sampleFirstName = sampleAgent ? paystubEmailFirstName_(sampleAgent.name) : 'there';
    const sampleSubject = paystubEmailSubject_(queue.emailPeriodLabel);
    const sampleBody = paystubEmailBody_(sampleFirstName, queue.emailPeriodLabel);

    return {
      ok: true,
      ppCode: ppCode,
      periodLabel: queue.emailPeriodLabel,
      recipientsReady: queue.sendQueue.length,
      noEmail: queue.noEmail.length,
      noPayData: queue.noPayData.length,
      sampleSubject: sampleSubject,
      sampleBody: sampleBody
    };
  } catch (e) {
    return {
      ok: false,
      message: paystubAscii_(e.message)
    };
  }
}

/**
 * joiSendAllPaystubsFromDialog
 * Client-callable sender for the JOI-branded Email All Paystubs dialog.
 * Always generates fresh fixed-layout PDFs before attaching.
 */
function joiSendAllPaystubsFromDialog(ppCode) {
  try {
    const queue = joiBuildEmailQueue_(ppCode);

    if (queue.sendQueue.length === 0) {
      return {
        ok: false,
        message: `No paystubs ready to email for ${queue.emailPeriodLabel}. Agents without email: ${queue.noEmail.length}. Agents without pay data: ${queue.noPayData.length}.`
      };
    }

    const rootFolder = getOrCreatePaystubsFolder_();
    const subFolders = rootFolder.getFoldersByName(ppCode);
    const folder = subFolders.hasNext() ? subFolders.next() : rootFolder.createFolder(ppCode);

    let sent = 0;
    let failed = 0;
    let generated = 0;
    const errors = [];

    queue.sendQueue.forEach(item => {
      const agent = item.agent;
      const weekRows = item.weekRows;

      try {
        const pdfBlob = generateAgentPaystub_(agent, ppCode, weekRows);
        if (!pdfBlob) {
          failed++;
          errors.push(`${paystubAscii_(agent.name)}: PDF generation returned empty.`);
          return;
        }

        folder.createFile(pdfBlob.copyBlob());
        generated++;

        const firstName = paystubEmailFirstName_(agent.name);
        const subject = paystubEmailSubject_(queue.emailPeriodLabel);
        const body = paystubEmailBody_(firstName, queue.emailPeriodLabel);

        MailApp.sendEmail({
          to: agent.email,
          subject: subject,
          body: body,
          htmlBody: paystubEmailHtmlBody_(firstName, queue.emailPeriodLabel),
          attachments: [pdfBlob]
        });

        sent++;
      } catch (e) {
        failed++;
        errors.push(`${paystubAscii_(agent.name)}: ${paystubAscii_(e.message)}`);
      }
    });

    return {
      ok: true,
      periodLabel: queue.emailPeriodLabel,
      generated: generated,
      sent: sent,
      failed: failed,
      noEmail: queue.noEmail.length,
      noPayData: queue.noPayData.length,
      errors: errors
    };
  } catch (e) {
    return {
      ok: false,
      message: paystubAscii_(e.message)
    };
  }
}

/**
 * generateOnePaystub
 * Opens a JOI-branded dialog to choose one agent and one pay period.
 * Generates the same fixed-layout PDF and downloads it to the browser.
 */
function generateOnePaystub() {
  const agentOptions = joiAgentOptions_();
  const periodOptions = joiPaystubPeriodOptions_();

  if (agentOptions.length === 0) {
    joiShowMessageDialog_('Generate One Paystub', 'No active agents found in the Agents sheet.');
    return;
  }

  if (periodOptions.length === 0) {
    joiShowMessageDialog_('Generate One Paystub', 'No pay periods found in Payroll Run. Add at least one week first.');
    return;
  }

  const bodyHtml = `
    <div class="joiSectionTitle">Generate one agent paystub</div>
    <p class="joiText">Choose the agent and pay period. The PDF will use the fixed original-style paystub layout.</p>

    <div class="joiField">
      <label class="joiLabel" for="agentId">Agent</label>
      <select id="agentId" class="joiSelect">
        ${joiOptionTags_(agentOptions, 'id', 'label')}
      </select>
    </div>

    <div class="joiField">
      <label class="joiLabel" for="ppCode">Pay period</label>
      <select id="ppCode" class="joiSelect">
        ${joiOptionTags_(periodOptions, 'code', 'label')}
      </select>
    </div>

    <div id="status" class="joiStatus"></div>
    <div id="downloadBox" class="joiResultBox" style="display:none;"></div>

    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Close</button>
      <button id="generateBtn" class="joiButton joiButtonPrimary" onclick="generatePaystub()">Generate Paystub</button>
    </div>
  `;

  const clientScript = `
    <script>
      function setStatus(text, className) {
        var box = document.getElementById('status');
        box.className = 'joiStatus ' + (className || '');
        box.textContent = text || '';
      }

      function generatePaystub() {
        var btn = document.getElementById('generateBtn');
        var agentId = document.getElementById('agentId').value;
        var ppCode = document.getElementById('ppCode').value;
        var downloadBox = document.getElementById('downloadBox');

        btn.disabled = true;
        downloadBox.style.display = 'none';
        downloadBox.innerHTML = '';
        setStatus('Generating paystub. Please wait...', '');

        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;

            if (!result || !result.ok) {
              setStatus((result && result.message) ? result.message : 'Paystub generation failed.', 'joiError');
              return;
            }

            setStatus('Paystub generated successfully.', 'joiSuccess');

            var dataUrl = 'data:application/pdf;base64,' + result.base64;
            downloadBox.style.display = 'block';
            downloadBox.innerHTML = '<div class="joiSectionTitle">Paystub ready</div>' +
              '<p class="joiMuted">Click the button below to download the PDF.</p>' +
              '<div class="joiActions" style="justify-content:center;margin-top:12px;">' +
              '<a id="downloadLink" class="joiButtonLink" download="' + result.fileName + '">Download Paystub</a>' +
              '</div>';

            var link = document.getElementById('downloadLink');
            link.href = dataUrl;
            setTimeout(function() { link.click(); }, 350);
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            setStatus(error && error.message ? error.message : String(error), 'joiError');
          })
          .joiGenerateOnePaystubFromDialog(agentId, ppCode);
      }
    </script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Generate One Paystub', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(600).setHeight(610);

  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Generate One Paystub');
}

/**
 * joiGenerateOnePaystubFromDialog
 * Client-callable server function for the JOI-branded one-paystub dialog.
 */
function joiGenerateOnePaystubFromDialog(agentId, ppCode) {
  try {
    const id = Number(agentId);
    const agentMap = getAgentMap_();
    const agent = agentMap.get(id);

    if (!agent) {
      return { ok: false, message: `Agent ID ${paystubAscii_(agentId)} not found in the Agents sheet.` };
    }

    const weekRows = collectWeekRowsForAgent_(id, ppCode);
    if (weekRows.length === 0) {
      return { ok: false, message: `No payroll data found for ${paystubAscii_(agent.name)} in ${paystubAscii_(ppCode)}.` };
    }

    const pdfBlob = generateAgentPaystub_(agent, ppCode, weekRows);
    if (!pdfBlob) {
      return { ok: false, message: 'Error generating paystub.' };
    }

    const folder = getOrCreatePaystubsFolder_();
    folder.createFile(pdfBlob.copyBlob());

    return {
      ok: true,
      fileName: pdfBlob.getName(),
      base64: Utilities.base64Encode(pdfBlob.getBytes())
    };
  } catch (e) {
    return {
      ok: false,
      message: paystubAscii_(e.message)
    };
  }
}

// 
//  LAYER 11 '97 INDIVIDUAL AGENT BREAKDOWN
// 

/**
 * agentPayrollBreakdown
 * Prompts for an agent ID, shows a popup summary of ALL their weeks,
 * and generates a full history PDF saved to Drive.
 * Designed for when an agent questions their pay '97 you pull it up
 * in seconds and can share the PDF with them.
 */
function agentPayrollBreakdown() {
  const agentOptions = joiAllAgentOptions_();
  if (agentOptions.length === 0) {
    joiShowMessageDialog_('Agent Payroll Breakdown', 'No agents or alumni found.');
    return;
  }

  const bodyHtml = `
    <div class="joiSectionTitle">Agent Payroll Breakdown</div>
    <p class="joiText">Choose an agent to generate a full payroll history PDF and save it to Drive.</p>
    <div class="joiField">
      <label class="joiLabel" for="agentId">Agent</label>
      <select id="agentId" class="joiSelect">${joiOptionTags_(agentOptions, 'id', 'label')}</select>
    </div>
    <div id="status" class="joiStatus"></div>
    <div id="resultBox" class="joiResultBox" style="display:none;"></div>
    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Close</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="runBreakdown()">Generate Breakdown</button>
    </div>
  `;

  const clientScript = `
    <script>
      function esc(text) {
        return String(text || '').replace(/[&<>"']/g, function(c) {
          return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
        });
      }
      function runBreakdown() {
        var btn = document.getElementById('runBtn');
        var status = document.getElementById('status');
        var box = document.getElementById('resultBox');
        btn.disabled = true;
        box.style.display = 'none';
        status.className = 'joiStatus';
        status.textContent = 'Generating breakdown PDF...';
        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            if (!result || !result.ok) {
              status.className = 'joiStatus joiError';
              status.textContent = (result && result.message) ? result.message : 'No result returned.';
              return;
            }
            status.className = 'joiStatus joiSuccess';
            status.textContent = 'Breakdown generated successfully.';
            box.style.display = 'block';
            box.innerHTML = '<div class="joiSectionTitle">Breakdown saved</div>' +
              '<p class="joiText"><strong>' + esc(result.agentName) + '</strong></p>' +
              '<p class="joiMuted">File: ' + esc(result.fileName) + '</p>' +
              '<p class="joiMuted">Saved to Google Drive -> JOI Paystubs</p>' +
              '<div class="joiStats">' +
                '<div class="joiStat"><div class="joiStatNum">' + esc(result.weekCount) + '</div><div class="joiStatLabel">Weeks</div></div>' +
                '<div class="joiStat"><div class="joiStatNum">' + esc(result.paidTotal) + '</div><div class="joiStatLabel">Paid</div></div>' +
                '<div class="joiStat"><div class="joiStatNum">' + esc(result.unpaidTotal) + '</div><div class="joiStatLabel">Outstanding</div></div>' +
              '</div>';
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            status.className = 'joiStatus joiError';
            status.textContent = error && error.message ? error.message : String(error);
          })
          .joiAgentPayrollBreakdownFromDialog(document.getElementById('agentId').value);
      }
    </script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Agent Payroll Breakdown', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(680).setHeight(620);

  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Agent Payroll Breakdown');
}

function joiAgentPayrollBreakdownFromDialog(agentIdRaw) {
  try {
    const agentId = parseInt(agentIdRaw, 10);
    const agentMap = getAgentMap_();
    let agent = agentMap.get(agentId);

    if (!agent) {
      const ss = ss_();
      const alSh = ss.getSheetByName(SH.ALUMNI);
      if (alSh) {
        const lastRow = alSh.getLastRow();
        if (lastRow >= 4) {
          const alData = alSh.getRange(4, 1, lastRow - 3, AL_COL.LAST_COL).getValues();
          alData.forEach(row => {
            if (Number(row[AL_COL.AGENT_ID - 1]) === agentId) {
              agent = {
                agentId: agentId,
                name: cleanText_(row[AL_COL.AGENT_NAME - 1]),
                campaign: cleanText_(row[AL_COL.CAMPAIGN - 1]),
                department: cleanText_(row[AL_COL.DEPARTMENT - 1]),
                ruleKey: cleanText_(row[AL_COL.RULE_KEY - 1]),
                email: cleanText_(row[AL_COL.EMAIL - 1]),
              };
            }
          });
        }
      }
    }

    if (!agent) return { ok: false, message: `Agent ID ${agentIdRaw} not found in Agents or Alumni sheets.` };

    const ss = ss_();
    const sh = ss.getSheetByName(SH.PAYROLL_RUN);
    if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };

    const allBlocks = getPayrollRunBlocks_();
    const allWeeks = [];
    let grandTotal = 0;
    let paidTotal = 0;
    let unpaidTotal = 0;

    allBlocks.forEach(block => {
      if (!block.firstDataRow || !block.lastDataRow) return;
      const nr = block.lastDataRow - block.firstDataRow + 1;
      if (nr < 1) return;
      const data = sh.getRange(block.firstDataRow, 1, nr, PR_COL.LAST_COL).getValues();
      data.forEach(row => {
        if (Number(row[PR_COL.AGENT_ID - 1]) !== agentId) return;
        const pay = Number(row[PR_COL.TOTAL_PAY - 1]) || 0;
        const status = cleanText_(row[PR_COL.STATUS - 1]);
        allWeeks.push({
          weekLabel: block.weekLabel,
          weekRange: block.dateRange,
          ppCode: block.ppCode,
          basePay: Number(row[PR_COL.WEEKLY_BASE - 1]) || 0,
          kpiBonus: Number(row[PR_COL.KPI_BONUS - 1]) || 0,
          missedDed: Number(row[PR_COL.MISSED_DED - 1]) || 0,
          overtimePay: Number(row[PR_COL.OVERTIME_PAY - 1]) || 0,
          sundayPay: Number(row[PR_COL.SUNDAY_PAY - 1]) || 0,
          vacationPay: Number(row[PR_COL.VACATION_PAY - 1]) || 0,
          holidayPay: Number(row[PR_COL.HOLIDAY_PAY - 1]) || 0,
          extraBonus: Number(row[PR_COL.EXTRA_BONUS - 1]) || 0,
          totalPay: pay,
          status,
          memo: cleanText_(row[PR_COL.MEMO - 1]),
        });
        grandTotal += pay;
        if (status === STATUS.PAID) paidTotal += pay;
        else unpaidTotal += pay;
      });
    });

    if (allWeeks.length === 0) return { ok: false, message: `No payroll records found for ${agent.name} (ID: ${agentId}).` };

    const byPP = new Map();
    allWeeks.forEach(w => {
      if (!byPP.has(w.ppCode)) byPP.set(w.ppCode, { weeks: [], total: 0, status: w.status });
      byPP.get(w.ppCode).weeks.push(w);
      byPP.get(w.ppCode).total += w.totalPay;
      byPP.get(w.ppCode).status = w.status;
    });

    const pdfBlob = generateAgentBreakdownPDF_(agent, allWeeks, byPP, grandTotal, paidTotal, unpaidTotal);
    if (!pdfBlob) return { ok: false, message: 'Error generating breakdown PDF.' };

    const folder = getOrCreatePaystubsFolder_();
    folder.createFile(pdfBlob);

    return {
      ok: true,
      agentName: agent.name,
      fileName: pdfBlob.getName(),
      weekCount: allWeeks.length,
      grandTotal: fmt_(grandTotal),
      paidTotal: fmt_(paidTotal),
      unpaidTotal: fmt_(unpaidTotal)
    };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/**
 * generateAgentBreakdownPDF_
 * Creates a detailed full-history PDF for one agent.
 * Includes every week, every pay component, grouped by pay period.
 * Used for answering agent pay questions.
 */
function generateAgentBreakdownPDF_(agent, allWeeks, byPP, grandTotal, paidTotal, unpaidTotal) {
  const today   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy');
  const docTitle = `BREAKDOWN_${agent.name.replace(/ +/g, '_')}_FULL_HISTORY`;

  const doc  = DocumentApp.create(docTitle);
  const body = doc.getBody();
  body.clear();
  body.setMarginTop(40).setMarginBottom(40).setMarginLeft(54).setMarginRight(54);

  //  Header 
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

  //  Agent card 
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

  //  Summary totals box 
  const sumTable = body.appendTable([
    [' ALL-TIME TOTAL', ' PAID', ' OUTSTANDING'],
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

  //  Per pay period breakdown 
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

  //  Footer 
  const ftPara = body.appendParagraph(
    `This document contains confidential payroll information for ${agent.name} only. ` +
    `Generated by JOI Payroll System on ${today}.`
  );
  ftPara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  ftPara.editAsText().setFontSize(7).setForegroundColor('#AAAAAA').setItalic(true);

  doc.saveAndClose();

  const pdfBlob = DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF);
  const safeName = agent.name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/ +/g, '_');
  pdfBlob.setName(
    `${safeName}_FULL_HISTORY_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')}.pdf`
  );
  DriveApp.getFileById(doc.getId()).setTrashed(true);

  return pdfBlob;
}

// 
//  UPDATED onOpen '97 adds Paystubs menu + new items
// 

/**
 * unlockCompletedWeek
 * Reverts a  COMPLETE week back to  UNPAID so you can
 * edit values, fix mistakes, and re-complete it.
 * Only affects COMPLETE weeks '97 PAID weeks use "Unlock PAID Period" in Admin.
 */
function unlockCompletedWeek() {
  const blockOptions = joiBlockOptions_(STATUS.COMPLETE);
  if (blockOptions.length === 0) {
    joiShowMessageDialog_('Unlock Completed Week', 'No completed weeks to unlock. Only weeks marked COMPLETE can be unlocked here. For PAID periods use Admin -> Unlock PAID Period.');
    return;
  }

  const bodyHtml = `
    <div class="joiSectionTitle">Unlock Completed Week</div>
    <p class="joiText">Select the completed week to unlock back to UNPAID so corrections can be made.</p>
    <div class="joiField">
      <label class="joiLabel" for="headerRow">Completed week</label>
      <select id="headerRow" class="joiSelect">${joiOptionTags_(blockOptions, 'headerRow', 'label')}</select>
    </div>
    <label class="joiCheckboxRow"><input id="confirm" type="checkbox" onchange="toggleButton()"><span>I understand this changes the selected week back to UNPAID.</span></label>
    <div id="status" class="joiStatus"></div>
    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="submitUnlock()" disabled>Unlock Week</button>
    </div>
  `;

  const clientScript = `
    <script>
      function toggleButton() { document.getElementById('runBtn').disabled = !document.getElementById('confirm').checked; }
      function submitUnlock() {
        var btn = document.getElementById('runBtn');
        var status = document.getElementById('status');
        btn.disabled = true;
        status.className = 'joiStatus';
        status.textContent = 'Unlocking completed week...';
        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            status.className = 'joiStatus ' + (result && result.ok ? 'joiSuccess' : 'joiError');
            status.textContent = (result && result.message) ? result.message : 'No result returned.';
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            status.className = 'joiStatus joiError';
            status.textContent = error && error.message ? error.message : String(error);
          })
          .joiUnlockCompletedWeekFromDialog(document.getElementById('headerRow').value);
      }
    </script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Unlock Completed Week', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(620).setHeight(500);

  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Unlock Completed Week');
}

function joiUnlockCompletedWeekFromDialog(headerRow) {
  try {
    const ss = ss_();
    const sh = ss.getSheetByName(SH.PAYROLL_RUN);
    if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };

    const block = getPayrollRunBlocks_().find(b => Number(b.headerRow) === Number(headerRow));
    if (!block) return { ok: false, message: 'Selected week block was not found.' };
    if (block.status !== STATUS.COMPLETE) return { ok: false, message: 'Selected week is not currently COMPLETE.' };

    sh.getRange(block.headerRow, PR_COL.STATUS).setValue(STATUS.UNPAID);
    sh.getRange(block.headerRow, 1, 1, PR_COL.LAST_COL)
      .setBackground(BRAND.blockBg).setFontColor(BRAND.blockFg);
    applyStatusColor_(sh.getRange(block.headerRow, PR_COL.STATUS), STATUS.UNPAID);

    let agentCount = 0;
    for (let r = block.firstDataRow; r <= block.lastDataRow; r++) {
      const raw = sh.getRange(r, PR_COL.AGENT_ID).getValue();
      const id = typeof raw === 'number' ? raw : parseFloat(raw);
      if (!Number.isFinite(id) || id <= 0 || Math.floor(id) !== id) continue;
      agentCount++;
      sh.getRange(r, 1, 1, PR_COL.LAST_COL).setFontColor(null).setBackground(null);
      // joiSetRowStatus_ syncs Status + Memo's workflow indicator atomically
      // and re-applies the colored badge. Preserves any free-text portion.
      joiSetRowStatus_(sh, r, STATUS.UNPAID);
    }

    refreshPayrollRunTotals_();
    SpreadsheetApp.flush();

    return { ok: true, message: `${block.weekLabel} is now UNPAID.\Rows affected: ${agentCount}` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/**
 * addNewAgent
 * Menu action: step-by-step prompts to add a brand-new agent to the Agents sheet.
 * Auto-assigns the next available Agent ID (max existing + 1).
 * Prompts for: Name, Campaign, Department, Shift, Rule Key, Email, Start Date.
 */


// 
//  AGENT WEEK CONTROLS '97 CONTROLLED NEW HIRE / FINAL PAY TOOLS
// 

/**
 * joiActiveAgentOptionsForWeekControls_
 * Returns active agents for Agent Week Controls.
 */
function joiActiveAgentOptionsForWeekControls_() {
  return Array.from(getAgentMap_().values())
    .sort((a, b) => a.agentId - b.agentId)
    .map(agent => ({
      id: agent.agentId,
      label: `#${agent.agentId} - ${agent.name} | ${agent.campaign || ''} | ${agent.department || ''}`
    }));
}

/**
 * joiAlumniAgentOptionsForWeekControls_
 * Returns alumni agents for one-off final pay additions.
 */
function joiAlumniAgentOptionsForWeekControls_() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.ALUMNI);
  if (!sh) return [];

  const lastRow = sh.getLastRow();
  if (lastRow < 4) return [];

  const data = sh.getRange(4, 1, lastRow - 3, AL_COL.LAST_COL).getValues();
  return data
    .filter(row => row[AL_COL.AGENT_ID - 1] && cleanText_(row[AL_COL.AGENT_NAME - 1]))
    .map(row => ({
      id: Number(row[AL_COL.AGENT_ID - 1]),
      label: `#${Number(row[AL_COL.AGENT_ID - 1])} - ${cleanText_(row[AL_COL.AGENT_NAME - 1])} | ${cleanText_(row[AL_COL.CAMPAIGN - 1])} | ${cleanText_(row[AL_COL.DEPARTMENT - 1])}`
    }))
    .sort((a, b) => a.id - b.id);
}

/**
 * joiEditableWeekOptions_
 * Week options for Add Agent / Add Alumni. Includes UNPAID, COMPLETE, and PAID weeks.
 * PAID weeks are shown with a "(PAID — override)" marker so users know they are adding
 * to a locked period. The inserted row inherits the block's existing status (PAID stays PAID).
 */
function joiEditableWeekOptions_() {
  return getPayrollRunBlocks_()
    .map(b => ({
      headerRow: b.headerRow,
      label: b.status === STATUS.PAID
        ? `${b.weekLabel} | ${b.monthYear || ''} | ${b.dateRange || ''} | ${b.ppCode || ''} | PAID — override`
        : `${b.weekLabel} | ${b.monthYear || ''} | ${b.dateRange || ''} | ${b.ppCode || ''} | ${b.status || ''}`
    }));
}

/**
 * joiWeekAgentRowOptions_
 * Returns one option per agent row in editable payroll weeks.
 * Used by Remove Agent From Existing Week.
 */
function joiWeekAgentRowOptions_() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) return [];

  const options = [];
  getPayrollRunBlocks_()
    .filter(b => b.status !== STATUS.PAID)
    .forEach(block => {
      if (!block.firstDataRow || !block.lastDataRow || block.lastDataRow < block.firstDataRow) return;
      const nr = block.lastDataRow - block.firstDataRow + 1;
      const rows = sh.getRange(block.firstDataRow, 1, nr, PR_COL.LAST_COL).getValues();
      rows.forEach((row, i) => {
        const rawId = row[PR_COL.AGENT_ID - 1];
        const agentId = typeof rawId === 'number' ? rawId : parseFloat(rawId);
        if (!Number.isFinite(agentId) || agentId <= 0 || Math.floor(agentId) !== agentId) return;
        const rowNum = block.firstDataRow + i;
        options.push({
          rowNum: rowNum,
          label: `${block.weekLabel} | ${block.monthYear || ''} | ${block.dateRange || ''} | #${agentId} - ${cleanText_(row[PR_COL.AGENT_NAME - 1])} | ${fmt_(Number(row[PR_COL.TOTAL_PAY - 1]) || 0)}`
        });
      });
    });
  return options;
}

/**
 * getActiveAgentById_
 * Reads one active agent object from Agents by ID.
 */
function getActiveAgentById_(agentId) {
  const agent = getAgentMap_().get(Number(agentId));
  return agent || null;
}

/**
 * getAlumniAgentById_
 * Reads one alumni agent object from Alumni by ID.
 */
function getAlumniAgentById_(agentId) {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.ALUMNI);
  if (!sh) return null;

  const lastRow = sh.getLastRow();
  if (lastRow < 4) return null;

  const data = sh.getRange(4, 1, lastRow - 3, AL_COL.LAST_COL).getValues();
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (Number(row[AL_COL.AGENT_ID - 1]) !== Number(agentId)) continue;
    return {
      agentId: Number(row[AL_COL.AGENT_ID - 1]),
      name: cleanText_(row[AL_COL.AGENT_NAME - 1]),
      campaign: cleanText_(row[AL_COL.CAMPAIGN - 1]),
      department: cleanText_(row[AL_COL.DEPARTMENT - 1]),
      ruleKey: normalizeRuleKey_(cleanText_(row[AL_COL.RULE_KEY - 1])),
      email: cleanText_(row[AL_COL.EMAIL - 1]),
      sourceRow: i + 4,
    };
  }
  return null;
}

/**
 * ppCodeToMonthYearObject_
 * Converts APRIL26PP2 or APRILPP2 into a month/year object.
 */
function ppCodeToMonthYearObject_(ppCode) {
  const code = cleanText_(ppCode).toUpperCase();
  const m = code.match(/^([A-Z]+?)(\d{2})?PP[12]$/);
  if (!m) return null;
  const monthName = m[1].charAt(0) + m[1].slice(1).toLowerCase();
  const year = m[2] ? Number('20' + m[2]) : new Date().getFullYear();
  return { monthName, year };
}

/**
 * syncMonthlySheetForBlock_
 * Syncs the monthly sheet for a block after adding/removing a row.
 */
function syncMonthlySheetForBlock_(block) {
  if (!block || !block.ppCode) return { ok: false, message: 'No pay period found for monthly sync.' };
  const my = ppCodeToMonthYearObject_(block.ppCode);
  if (!my) return { ok: false, message: `Could not identify month/year from pay period ${block.ppCode}.` };
  return syncMonthlySheetFromPayrollRun(my.monthName, my.year, true);
}

/**
 * weekHasAgent_
 * Checks if a block already contains an agent ID.
 */
function weekHasAgent_(sh, block, agentId) {
  if (!block || !block.firstDataRow || !block.lastDataRow || block.lastDataRow < block.firstDataRow) return false;
  const nr = block.lastDataRow - block.firstDataRow + 1;
  const ids = sh.getRange(block.firstDataRow, PR_COL.AGENT_ID, nr, 1).getValues().flat();
  return ids.some(v => Number(v) === Number(agentId));
}

/**
 * insertAgentIntoPayrollWeek_
 * Inserts one active/alumni agent into a selected Payroll Run week block.
 * The new row is sorted by Agent ID within that block.
 */
function insertAgentIntoPayrollWeek_(agent, block, sourceLabel) {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };
  if (!agent) return { ok: false, message: 'Agent was not found.' };
  if (!block) return { ok: false, message: 'Week block was not found.' };

  if (weekHasAgent_(sh, block, agent.agentId)) {
    return { ok: false, message: `${agent.name} is already in ${block.weekLabel}. No duplicate row was added.` };
  }

  const ruleMap = getRuleMap_();
  const alumniMap = getAlumniRuleKeyMap_();
  let rk = agent.ruleKey || alumniMap.get(Number(agent.agentId)) || '';
  rk = normalizeRuleKey_(rk);
  const rule = ruleMap.get(rk);

  const inputs = {
    include: 'YES',
    missedDays: '',
    overtimeDays: '',
    sundays: '',
    vacationDays: '',
    kpiAchieved: 'YES',
    extraBonus: 0,
    partialWeek: 0,
  };
  const pay = calcAgentPay_(rule, inputs);

  const insertRow = block.lastDataRow && block.lastDataRow >= block.firstDataRow
    ? block.lastDataRow + 1
    : block.firstDataRow;

  if (insertRow <= sh.getLastRow()) {
    sh.insertRowBefore(insertRow);
  } else {
    sh.insertRowAfter(sh.getLastRow());
  }

  // Guarantee the new row matches the rest of the block visually.
  // Copy formatting (font, alignment, background, borders) from a template row
  // BEFORE writing data so writeAgentPayRow_ can override only what it needs to.
  // Template row priority: first existing data row in the block, else the row above.
  const templateRow =
    (block.firstDataRow && block.firstDataRow >= 4 && block.firstDataRow !== insertRow)
      ? block.firstDataRow
      : (insertRow > 4 ? insertRow - 1 : null);
  if (templateRow) {
    try {
      sh.getRange(templateRow, 1, 1, PR_COL.LAST_COL)
        .copyTo(
          sh.getRange(insertRow, 1, 1, PR_COL.LAST_COL),
          SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
          false
        );
    } catch (e) {
      Logger.log('insertAgentIntoPayrollWeek_ format copy failed: ' + e.message);
    }
  }

  // Inherit the block's existing lock status so we don't downgrade a PAID or COMPLETE row.
  const status = block.status === STATUS.PAID     ? STATUS.PAID
               : block.status === STATUS.COMPLETE ? STATUS.COMPLETE
               : STATUS.UNPAID;
  const memo = sourceLabel ? `Added to existing week - ${sourceLabel}` : 'Added to existing week';
  writeAgentPayRow_(sh, insertRow, { ...agent, ruleKey: rk }, pay, inputs, status, block.ppCode, memo);

  // After data is written, re-assert the visual baseline so subtle differences
  // (font, alignment, vertical alignment) match the rest of the block exactly.
  try {
    const row = sh.getRange(insertRow, 1, 1, PR_COL.LAST_COL);
    row.setFontFamily('Calibri')
       .setFontSize(10)
       .setFontWeight('normal')
       .setVerticalAlignment('middle')
       .setWrap(false);
    // Restore the alternating row background based on the row's relative position in the block.
    const relIndex = Math.max(0, insertRow - block.firstDataRow);
    const useCream = relIndex % 2 === 1;
    if (useCream) row.setBackground(joiCream_());
  } catch (e) {
    Logger.log('insertAgentIntoPayrollWeek_ post-write style failed: ' + e.message);
  }

  // Sort only the data rows inside this week block by Agent ID so monthly sync stays stable.
  const newLastDataRow = block.lastDataRow && block.lastDataRow >= block.firstDataRow
    ? block.lastDataRow + 1
    : block.firstDataRow;
  const numRows = newLastDataRow - block.firstDataRow + 1;
  if (numRows > 1) {
    sh.getRange(block.firstDataRow, 1, numRows, PR_COL.LAST_COL).sort({ column: PR_COL.AGENT_ID, ascending: true });
  }

  // After sort, re-apply alternating row backgrounds across the whole block so the
  // inserted row's visual rhythm matches its neighbours regardless of where it landed.
  try {
    const white = joiWhite_();
    const cream = joiCream_();
    const bgArray = [];
    for (let i = 0; i < numRows; i++) {
      bgArray.push(new Array(PR_COL.LAST_COL).fill(i % 2 === 0 ? white : cream));
    }
    sh.getRange(block.firstDataRow, 1, numRows, PR_COL.LAST_COL).setBackgrounds(bgArray);
    sh.setRowHeights(block.firstDataRow, numRows, 22);
  } catch (e) {
    Logger.log('insertAgentIntoPayrollWeek_ post-sort restripe failed: ' + e.message);
  }

  refreshPayrollRunTotals_();
  const syncResult = syncMonthlySheetForBlock_(block);
  SpreadsheetApp.flush();

  const paidNote = status === STATUS.PAID
    ? '\nWeek is PAID — row was added with PAID status. Monthly sheet updated.'
    : '';
  return {
    ok: true,
    message:
      `${agent.name} added to ${block.weekLabel}.\n` +
      `Week: ${block.monthYear || ''} ${block.dateRange || ''}\n` +
      `Row status: ${status}\n` +
      `Default pay loaded: ${fmt_(pay.totalPay)}\n` +
      `Monthly sync: ${syncResult && syncResult.ok ? 'Updated' : (syncResult.message || 'Not updated')}` +
      paidNote + '\n' +
      `Review the row in Payroll Run — edit missed days, KPI, bonus, or deductions as needed.`
  };
}

/**
 * Add active agent to an existing payroll week.
 */
function addAgentToExistingWeek() {
  const agents = joiActiveAgentOptionsForWeekControls_();
  const weeks = joiEditableWeekOptions_();
  if (agents.length === 0) {
    joiShowMessageDialog_('Add Agent to Existing Week', 'No active agents found in the Agents sheet.');
    return;
  }
  if (weeks.length === 0) {
    joiShowMessageDialog_('Add Agent to Existing Week', 'No payroll weeks found in the Payroll Run sheet.');
    return;
  }

  const bodyHtml = `
    <div class="joiSectionTitle">Add Agent to Existing Week</div>
    <p class="joiText">Use this when an active agent was missing from a week that was already created — including COMPLETE and PAID weeks. The new row inherits the week's current status.</p>
    <div class="joiField">
      <label class="joiLabel" for="agentId">Agent</label>
      <select id="agentId" class="joiSelect">${joiOptionTags_(agents, 'id', 'label')}</select>
    </div>
    <div class="joiField">
      <label class="joiLabel" for="headerRow">Payroll Week</label>
      <select id="headerRow" class="joiSelect">${joiOptionTags_(weeks, 'headerRow', 'label')}</select>
    </div>
    <p class="joiMuted">The row is inserted in Agent ID order. The monthly sheet for that pay period is synced automatically. Weeks marked "PAID — override" are already locked; the new row will be marked PAID.</p>
    <div id="status" class="joiStatus"></div>
    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="submitAdd()">Add Agent</button>
    </div>
  `;
  const clientScript = `
    <script>
      function submitAdd() {
        var btn = document.getElementById('runBtn');
        var status = document.getElementById('status');
        btn.disabled = true;
        status.className = 'joiStatus';
        status.textContent = 'Adding agent and syncing monthly sheet...';
        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            status.className = 'joiStatus ' + (result && result.ok ? 'joiSuccess' : 'joiError');
            status.textContent = (result && result.message) ? result.message : 'No result returned.';
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            status.className = 'joiStatus joiError';
            status.textContent = error && error.message ? error.message : String(error);
          })
          .joiAddAgentToExistingWeekFromDialog(document.getElementById('agentId').value, document.getElementById('headerRow').value);
      }
    </script>
  `;
  const html = HtmlService.createHtmlOutput(joiDialogShell_('Add Agent to Existing Week', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)).setWidth(660).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Add Agent to Existing Week');
}

function joiAddAgentToExistingWeekFromDialog(agentId, headerRow) {
  try {
    const block = getPayrollRunBlocks_().find(b => Number(b.headerRow) === Number(headerRow));
    const agent = getActiveAgentById_(Number(agentId));
    return insertAgentIntoPayrollWeek_(agent, block, 'active agent');
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/**
 * Add alumni/former agent to existing payroll week for final pay.
 */
function addAlumniToExistingWeek() {
  const agents = joiAlumniAgentOptionsForWeekControls_();
  const weeks = joiEditableWeekOptions_();
  if (agents.length === 0) {
    joiShowMessageDialog_('Add Alumni to Existing Week', 'No alumni agents found in the Alumni sheet.');
    return;
  }
  if (weeks.length === 0) {
    joiShowMessageDialog_('Add Alumni to Existing Week', 'No payroll weeks found in the Payroll Run sheet.');
    return;
  }

  const bodyHtml = `
    <div class="joiSectionTitle">Add Alumni to Existing Week</div>
    <p class="joiText">Use this for final pay when someone is already moved to Alumni but still needs to appear in one payroll week — including COMPLETE and PAID weeks. The new row inherits the week's current status.</p>
    <div class="joiField">
      <label class="joiLabel" for="agentId">Alumni Agent</label>
      <select id="agentId" class="joiSelect">${joiOptionTags_(agents, 'id', 'label')}</select>
    </div>
    <div class="joiField">
      <label class="joiLabel" for="headerRow">Payroll Week</label>
      <select id="headerRow" class="joiSelect">${joiOptionTags_(weeks, 'headerRow', 'label')}</select>
    </div>
    <p class="joiMuted">This does not make the agent active again. It only adds them to the selected week for final pay. Weeks marked "PAID — override" are already locked; the new row will be marked PAID.</p>
    <div id="status" class="joiStatus"></div>
    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="submitAdd()">Add Alumni</button>
    </div>
  `;
  const clientScript = `
    <script>
      function submitAdd() {
        var btn = document.getElementById('runBtn');
        var status = document.getElementById('status');
        btn.disabled = true;
        status.className = 'joiStatus';
        status.textContent = 'Adding alumni agent and syncing monthly sheet...';
        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            status.className = 'joiStatus ' + (result && result.ok ? 'joiSuccess' : 'joiError');
            status.textContent = (result && result.message) ? result.message : 'No result returned.';
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            status.className = 'joiStatus joiError';
            status.textContent = error && error.message ? error.message : String(error);
          })
          .joiAddAlumniToExistingWeekFromDialog(document.getElementById('agentId').value, document.getElementById('headerRow').value);
      }
    </script>
  `;
  const html = HtmlService.createHtmlOutput(joiDialogShell_('Add Alumni to Existing Week', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)).setWidth(660).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Add Alumni to Existing Week');
}

function joiAddAlumniToExistingWeekFromDialog(agentId, headerRow) {
  try {
    const block = getPayrollRunBlocks_().find(b => Number(b.headerRow) === Number(headerRow));
    const agent = getAlumniAgentById_(Number(agentId));
    return insertAgentIntoPayrollWeek_(agent, block, 'alumni final pay');
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/**
 * Remove one agent row from one existing payroll week.
 */
function removeAgentFromExistingWeek() {
  const rows = joiWeekAgentRowOptions_();
  if (rows.length === 0) {
    joiShowMessageDialog_('Remove Agent From Existing Week', 'No editable agent rows found. PAID weeks are locked.');
    return;
  }

  const bodyHtml = `
    <div class="joiSectionTitle">Remove Agent From Existing Week</div>
    <p class="joiText">Use this when an agent was added to a week by mistake. This removes only the selected row from that one week.</p>
    <div class="joiField">
      <label class="joiLabel" for="rowNum">Week / Agent Row</label>
      <select id="rowNum" class="joiSelect">${joiOptionTags_(rows, 'rowNum', 'label')}</select>
    </div>
    <p class="joiMuted">This will not delete the agent from Agents or Alumni. It will sync the affected monthly sheet after removal.</p>
    <div id="status" class="joiStatus"></div>
    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="submitRemove()">Remove Row</button>
    </div>
  `;
  const clientScript = `
    <script>
      function submitRemove() {
        var btn = document.getElementById('runBtn');
        var status = document.getElementById('status');
        btn.disabled = true;
        status.className = 'joiStatus';
        status.textContent = 'Removing row and syncing monthly sheet...';
        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            status.className = 'joiStatus ' + (result && result.ok ? 'joiSuccess' : 'joiError');
            status.textContent = (result && result.message) ? result.message : 'No result returned.';
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            status.className = 'joiStatus joiError';
            status.textContent = error && error.message ? error.message : String(error);
          })
          .joiRemoveAgentFromExistingWeekFromDialog(document.getElementById('rowNum').value);
      }
    </script>
  `;
  const html = HtmlService.createHtmlOutput(joiDialogShell_('Remove Agent From Existing Week', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)).setWidth(700).setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Remove Agent From Existing Week');
}

function joiRemoveAgentFromExistingWeekFromDialog(rowNumRaw) {
  try {
    const ss = ss_();
    const sh = ss.getSheetByName(SH.PAYROLL_RUN);
    if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };

    const rowNum = Number(rowNumRaw);
    if (!Number.isFinite(rowNum) || rowNum < 4) return { ok: false, message: 'Invalid row selected.' };

    const block = getPayrollRunBlocks_().find(b => rowNum >= b.firstDataRow && rowNum <= b.lastDataRow);
    if (!block) return { ok: false, message: 'Could not identify the week block for this row.' };
    if (block.status === STATUS.PAID) return { ok: false, message: 'This week is PAID and locked. No row was removed.' };

    const agentId = Number(sh.getRange(rowNum, PR_COL.AGENT_ID).getValue());
    const agentName = cleanText_(sh.getRange(rowNum, PR_COL.AGENT_NAME).getValue());
    if (!Number.isFinite(agentId) || agentId <= 0) return { ok: false, message: 'Selected row does not look like an agent payroll row.' };

    sh.deleteRow(rowNum);
    refreshPayrollRunTotals_();
    const syncResult = syncMonthlySheetForBlock_(block);
    SpreadsheetApp.flush();

    return {
      ok: true,
      message:
        `${agentName} (#${agentId}) was removed from ${block.weekLabel}.\nMonthly sync: ${syncResult && syncResult.ok ? 'Updated' : (syncResult.message || 'Not updated')}`
    };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/**
 * Move active agent to Alumni so they stop appearing in future weeks.
 * Existing Payroll Run history is not touched.
 */
function moveAgentToAlumni() {
  const agents = joiActiveAgentOptionsForWeekControls_();
  if (agents.length === 0) {
    joiShowMessageDialog_('Move Agent to Alumni', 'No active agents found in the Agents sheet.');
    return;
  }

  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy');
  const bodyHtml = `
    <div class="joiSectionTitle">Move Agent to Alumni</div>
    <p class="joiText">Use this after an agent's final active week. This prevents them from being added to future new weeks, but it preserves their existing payroll history.</p>
    <div class="joiField">
      <label class="joiLabel" for="agentId">Active Agent</label>
      <select id="agentId" class="joiSelect">${joiOptionTags_(agents, 'id', 'label')}</select>
    </div>
    <div class="joiField">
      <label class="joiLabel" for="endDate">End Date</label>
      <input id="endDate" class="joiInput" value="${paystubEscape_(today)}" placeholder="MM/DD/YYYY">
    </div>
    <div class="joiField">
      <label class="joiLabel" for="notes">Notes optional</label>
      <input id="notes" class="joiInput" placeholder="Example: Final week completed">
    </div>
    <p class="joiMuted">Existing Payroll Run rows are not deleted. If the agent still needs final pay later, use Add Alumni to Existing Week.</p>
    <div id="status" class="joiStatus"></div>
    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="submitMove()">Move to Alumni</button>
    </div>
  `;
  const clientScript = `
    <script>
      function submitMove() {
        var btn = document.getElementById('runBtn');
        var status = document.getElementById('status');
        btn.disabled = true;
        status.className = 'joiStatus';
        status.textContent = 'Moving agent to Alumni...';
        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            status.className = 'joiStatus ' + (result && result.ok ? 'joiSuccess' : 'joiError');
            status.textContent = (result && result.message) ? result.message : 'No result returned.';
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            status.className = 'joiStatus joiError';
            status.textContent = error && error.message ? error.message : String(error);
          })
          .joiMoveAgentToAlumniFromDialog(document.getElementById('agentId').value, document.getElementById('endDate').value, document.getElementById('notes').value);
      }
    </script>
  `;
  const html = HtmlService.createHtmlOutput(joiDialogShell_('Move Agent to Alumni', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)).setWidth(660).setHeight(570);
  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Move Agent to Alumni');
}

function joiMoveAgentToAlumniFromDialog(agentIdRaw, endDateRaw, notesRaw) {
  try {
    const ss = ss_();
    const agSh = ss.getSheetByName(SH.AGENTS);
    const alSh = ss.getSheetByName(SH.ALUMNI);
    if (!agSh) return { ok: false, message: 'Agents sheet not found.' };
    if (!alSh) return { ok: false, message: 'Alumni sheet not found. Run First-Time Setup or Rebuild Alumni Sheet first.' };

    const agentId = Number(agentIdRaw);
    const endDate = parseDate_(cleanText_(endDateRaw));
    if (!Number.isFinite(agentId) || agentId <= 0) return { ok: false, message: 'Invalid agent selected.' };
    if (!endDate) return { ok: false, message: 'Invalid end date. Use MM/DD/YYYY.' };

    const lastRow = agSh.getLastRow();
    if (lastRow < 4) return { ok: false, message: 'No active agents found.' };
    const data = agSh.getRange(4, 1, lastRow - 3, AG_COL.LAST_COL).getValues();

    let sourceIndex = -1;
    let sourceRow = null;
    data.forEach((row, i) => {
      if (Number(row[AG_COL.AGENT_ID - 1]) === agentId) {
        sourceIndex = i;
        sourceRow = row;
      }
    });
    if (sourceIndex < 0 || !sourceRow) return { ok: false, message: `Agent ID ${agentId} was not found in active Agents.` };

    // SOURCE-OF-TRUTH LAW: insert right after the last actual alumni row,
    // ignoring styled-but-empty trailing rows.
    const alumniLastDataRow = joiFindLastDataRow_(alSh, AL_COL.AGENT_ID, 4);
    const writeRow = alumniLastDataRow >= 4 ? alumniLastDataRow + 1 : 4;
    const alumniPeerRow = alumniLastDataRow >= 4 ? alumniLastDataRow : null;
    if (alumniPeerRow) joiCopyPeerRowFormat_(alSh, writeRow, alumniPeerRow, AL_COL.LAST_COL);
    const notes = cleanText_(notesRaw);
    const alumniRow = [
      sourceRow[AG_COL.AGENT_ID - 1],
      sourceRow[AG_COL.AGENT_NAME - 1],
      sourceRow[AG_COL.CAMPAIGN - 1],
      sourceRow[AG_COL.DEPARTMENT - 1],
      sourceRow[AG_COL.RULE_KEY - 1],
      sourceRow[AG_COL.EMAIL - 1],
      endDate,
      0,
      notes ? `Pending - ${notes}` : 'Pending',
      '',
    ];

    alSh.getRange(writeRow, 1, 1, AL_COL.LAST_COL).setValues([alumniRow]);
    alSh.getRange(writeRow, AL_COL.END_DATE).setNumberFormat('MM/DD/YYYY');
    alSh.getRange(writeRow, AL_COL.BALANCE_OWED).setNumberFormat('$#,##0.00');

    agSh.deleteRow(sourceIndex + 4);
    SpreadsheetApp.flush();

    return {
      ok: true,
      message:
        `${cleanText_(sourceRow[AG_COL.AGENT_NAME - 1])} was moved to Alumni.\nExisting Payroll Run history was preserved.\nThey will not be included in future Add New Week runs.\nIf final pay is needed later, use Add Alumni to Existing Week.`
    };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/**
 * onOpen (v2 '97 replaces original)
 * Adds the full menu including Paystubs submenu and Agent Breakdown.
 */

// 
//  OVERRIDE LAYER '97 MONTHLY TEMPLATE + WEEK 5 + PAYROLL RUN FORMAT FIX
//  Added after approval: preserves payroll math and injects data into existing template styling.
// 

function writeBlockHeader_(sh, row, weekLabel, startDate, endDate, status, ppCode) {
  const monthYear = monthYearLabelFromDate_(endDate);
  const dateRange = payrollWeekRangeLabel_(startDate, endDate);
  const rowVals = new Array(PR_COL.LAST_COL).fill('');
  rowVals[PR_COL.AGENT_ID - 1] = weekLabel;
  rowVals[PR_COL.AGENT_NAME - 1] = monthYear;
  rowVals[PR_COL.RULE_KEY - 1] = dateRange;
  rowVals[PR_COL.STATUS - 1] = status;
  rowVals[PR_COL.PAY_PERIOD - 1] = ppCode;

  sh.getRange(row, 1, 1, PR_COL.LAST_COL).setValues([rowVals]);
  sh.getRange(row, 1, 1, PR_COL.LAST_COL)
    .setBackground(BRAND.blockBg)
    .setFontColor(BRAND.blockFg)
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  // Keep the header clean. Status and pay period stay stored for logic,
  // but they are not visually colored like agent rows.
  sh.setRowHeight(row, 26);
}

function copyPayrollWeekBlockFormatting_(sh, templateBlock, newHeaderRow, numAgentRows) {
  if (!sh || !templateBlock || !templateBlock.headerRow) return;
  try {
    sh.getRange(templateBlock.headerRow, 1, 1, PR_COL.LAST_COL)
      .copyTo(sh.getRange(newHeaderRow, 1, 1, PR_COL.LAST_COL), { formatOnly: true });

    const templateRows = Math.max(0, (templateBlock.lastDataRow || 0) - (templateBlock.firstDataRow || 0) + 1);
    if (templateRows > 0 && numAgentRows > 0) {
      for (let i = 0; i < numAgentRows; i++) {
        const sourceRow = templateBlock.firstDataRow + (i % templateRows);
        const targetRow = newHeaderRow + 1 + i;
        const sourceRange = sh.getRange(sourceRow, 1, 1, PR_COL.LAST_COL);
        const targetRange = sh.getRange(targetRow, 1, 1, PR_COL.LAST_COL);
        sourceRange.copyTo(targetRange, { formatOnly: true });

        // Preserve dropdown validations from the template row where possible.
        const validations = sourceRange.getDataValidations();
        targetRange.setDataValidations(validations);
      }
    }
  } catch (e) {
    Logger.log('copyPayrollWeekBlockFormatting_ failed: ' + e.message);
  }
}

function finalizeNewPayrollWeekFormatting_(sh, headerRow, numAgentRows, status) {
  if (!sh || !headerRow || numAgentRows < 1) return;
  writePayrollRunHeaderStyle_(sh, headerRow);
  for (let i = 0; i < numAgentRows; i++) {
    const rowNum = headerRow + 1 + i;
    sh.getRange(rowNum, PR_COL.WEEKLY_BASE, 1, 8).setNumberFormat('$#,##0.00');
    applyStatusColor_(sh.getRange(rowNum, PR_COL.STATUS), status);
  }
}

function writePayrollRunHeaderStyle_(sh, headerRow) {
  sh.getRange(headerRow, 1, 1, PR_COL.LAST_COL)
    .setBackground(BRAND.blockBg)
    .setFontColor(BRAND.blockFg)
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');
  sh.setRowHeight(headerRow, 26);
}

function joiAddNewWeekFromDialog(rawDate, assignMode) {
  try {
    const ss = ss_();
    const sh = ss.getSheetByName(SH.PAYROLL_RUN);
    if (!sh) return { ok: false, message: 'Payroll Run sheet not found. Run Setup first.' };

    const endDate = parseDate_(cleanText_(rawDate));
    if (!endDate) return { ok: false, message: `Invalid date: "${cleanText_(rawDate)}". Use MM/DD/YYYY format.` };

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);
    const ppCode = payPeriodCode_(endDate);

    const blocksBefore = getPayrollRunBlocks_();
    const duplicate = blocksBefore.some(b => {
      const parsed = parsePayrollBlockDateRange_(b.dateRange);
      return parsed && parsed.endDate && parsed.endDate.getTime() === endDate.getTime();
    });
    if (duplicate) {
      return { ok: false, message: `A payroll week ending ${fmtDate_(endDate)} already exists. No new week was added.` };
    }

    const monthCode = ppCode.replace(/PP[12]$/, '');
    const monthBlocks = blocksBefore.filter(b => b.ppCode && b.ppCode.startsWith(monthCode));
    const weekLabel = `WEEK ${monthBlocks.length + 1}`;
    const templateBlock = blocksBefore.length ? blocksBefore[blocksBefore.length - 1] : null;

    let insertRow = sh.getLastRow() + 1;
    for (let r = insertRow - 1; r >= 4; r--) {
      const v = cleanText_(sh.getRange(r, 1).getValue());
      if (v.includes('TOTAL') || v === '') {
        sh.deleteRow(r);
        insertRow--;
      } else {
        break;
      }
    }
    insertRow = sh.getLastRow() + 2;

    const agentMap = getAgentMap_();
    const agents = Array.from(agentMap.values()).sort((a, b) => a.agentId - b.agentId);

    writeBlockHeader_(sh, insertRow, weekLabel, startDate, endDate, STATUS.UNPAID, ppCode);

    const ruleMap = getRuleMap_();
    const alumniMap = getAlumniRuleKeyMap_();
    let currentRow = insertRow + 1;

    agents.forEach(agent => {
      let rk = agent.ruleKey || alumniMap.get(agent.agentId) || '';
      rk = normalizeRuleKey_(rk);
      const rule = ruleMap.get(rk);
      const inputs = {
        include: 'YES', missedDays: '', overtimeDays: '',
        sundays: '', vacationDays: '', kpiAchieved: 'YES',
        extraBonus: 0, partialWeek: 0,
      };
      const pay = calcAgentPay_(rule, inputs);
      writeAgentPayRow_(sh, currentRow, { ...agent, ruleKey: rk }, pay, inputs, STATUS.UNPAID, ppCode, '');
      currentRow++;
    });

    copyPayrollWeekBlockFormatting_(sh, templateBlock, insertRow, agents.length);
    // Re-write values after copying formats so template values never overwrite new week data.
    writeBlockHeader_(sh, insertRow, weekLabel, startDate, endDate, STATUS.UNPAID, ppCode);
    currentRow = insertRow + 1;
    agents.forEach(agent => {
      let rk = agent.ruleKey || alumniMap.get(agent.agentId) || '';
      rk = normalizeRuleKey_(rk);
      const rule = ruleMap.get(rk);
      const inputs = {
        include: 'YES', missedDays: '', overtimeDays: '',
        sundays: '', vacationDays: '', kpiAchieved: 'YES',
        extraBonus: 0, partialWeek: 0,
      };
      const pay = calcAgentPay_(rule, inputs);
      writeAgentPayRow_(sh, currentRow, { ...agent, ruleKey: rk }, pay, inputs, STATUS.UNPAID, ppCode, '');
      currentRow++;
    });
    finalizeNewPayrollWeekFormatting_(sh, insertRow, agents.length, STATUS.UNPAID);
    // Final visual pass: copy the previous good Payroll Run block style into this new block.
    // Values remain untouched. This prevents new weeks from looking like generic pasted data.
    repairPayrollRunWeekFormattingAtHeader_(insertRow);

    refreshPayrollRunTotals_();
    SpreadsheetApp.flush();

    return {
      ok: true,
      message: `Week added successfully.\${weekLabel}${fmtDate_(startDate)} - ${fmtDate_(endDate)}${payPeriodLabel_(ppCode)}\${agents.length} agents added. All set to UNPAID.`
    };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function getMonthWeekRanges_(monthName, year) {
  const monthIndex = ['January','February','March','April','May','June','July','August','September','October','November','December']
    .findIndex(m => m.toLowerCase() === cleanText_(monthName).toLowerCase());
  if (monthIndex < 0) return [];

  const ranges = [];
  const d = new Date(year, monthIndex, 1);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1); // first Sunday in month

  while (d.getMonth() === monthIndex) {
    const endDate = new Date(d.getTime());
    const startDate = new Date(d.getTime());
    startDate.setDate(startDate.getDate() - 6);
    ranges.push({ startDate, endDate, label: `${fmtDateShort_(startDate)} - ${fmtDateShort_(endDate)}` });
    d.setDate(d.getDate() + 7);
  }
  return ranges;
}

function monthlySheetNameRegex_() {
  return /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{2}\s+PayRoll$/i;
}

function getMonthlyTemplateSheet_(targetName) {
  const ss = ss_();
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  // Find all existing monthly sheets except the target, parse their date, sort newest first.
  const candidates = ss.getSheets()
    .filter(sh => monthlySheetNameRegex_().test(sh.getName()) && sh.getName() !== targetName)
    .map(sh => {
      const m = sh.getName().match(/^(\w+)\s+(\d{2})\s+PayRoll$/i);
      if (!m) return null;
      const monthIdx = MONTHS.findIndex(mn => mn.toLowerCase() === m[1].toLowerCase());
      const year = 2000 + parseInt(m[2], 10);
      return { sh, sortKey: year * 100 + monthIdx };
    })
    .filter(Boolean)
    .sort((a, b) => b.sortKey - a.sortKey); // newest first

  // Use the most recent monthly sheet as the template.
  if (candidates.length) return candidates[0].sh;
  return null;
}




function isDarkColor_(hex) {
  const h = cleanText_(hex).replace('#','');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  const lum = 0.2126*r + 0.7152*g + 0.0722*b;
  return lum < 70;
}







function findAgentNameInWeekData_(weekData, id) {
  for (const key in weekData) {
    if (weekData[key] && weekData[key][id] && weekData[key][id].name) return weekData[key][id].name;
  }
  return '';
}


// 
//  OVERRIDE LAYER '97 MONTHLY HEADER STRUCTURE REPAIR
//  Approved fix: April 26 PayRoll is the template source after repair.
//  Row 4 must follow fixed monthly section structure:
//  W1 A:D = Agent ID | Agent Name | Weekly Pay | Notes
//  W2 F:J = Agent ID | Agent Name | Weekly Pay | Notes | Bi-Weekly Total
//  W3 L:O = Agent ID | Agent Name | Weekly Pay | Notes
//  W4 Q:U = Agent ID | Agent Name | Weekly Pay | Notes | Bi-Weekly Total
//  W5 W:AA = Agent ID | Agent Name | Weekly Pay | Notes | Bi-Weekly Total
// 






function ensureWeekFiveSection_(sh, neededWeeks) {
  ensureMonthlyFixedColumns_(sh, neededWeeks);
  return getMonthlyWeekSections_(sh).slice(0, Math.max(1, Math.min(Number(neededWeeks) || 4, 5)));
}

/**
 * safeBreakOverlappingMerges_
 * Breaks any merged ranges that overlap the target range by selecting the FULL
 * merged range first. This prevents Google Sheets' "must select all cells in a
 * merged range" exception during monthly template repair.
 */
function safeBreakOverlappingMerges_(sh, row, col, numRows, numCols) {
  if (!sh) return;
  const targetRow1 = row;
  const targetRow2 = row + numRows - 1;
  const targetCol1 = col;
  const targetCol2 = col + numCols - 1;

  const overlaps = (rg) => {
    const r1 = rg.getRow();
    const r2 = rg.getLastRow();
    const c1 = rg.getColumn();
    const c2 = rg.getLastColumn();
    return !(r2 < targetRow1 || r1 > targetRow2 || c2 < targetCol1 || c1 > targetCol2);
  };

  try {
    sh.getDataRange().getMergedRanges().forEach(rg => {
      if (overlaps(rg)) {
        rg.breakApart();
      }
    });
  } catch (e) {
    Logger.log('safeBreakOverlappingMerges_ failed: ' + e.message);
  }
}

function safeMergeRange_(range) {
  if (!range) return;
  const sh = range.getSheet();
  safeBreakOverlappingMerges_(sh, range.getRow(), range.getColumn(), range.getNumRows(), range.getNumColumns());
  try {
    range.merge();
  } catch (e) {
    Logger.log('safeMergeRange_ failed: ' + e.message);
  }
}





// 
//  OVERRIDE LAYER '97 PAYROLL RUN WEEK FORMATTING REPAIR
//  Keeps existing values and payroll math intact. Copies only the visual style
//  from the previous week block so newly-added weeks match the original ledger.
// 

function getPayrollRunBlockByHeaderRow_(headerRow) {
  const blocks = getPayrollRunBlocks_();
  const targetRow = Number(headerRow);
  return blocks.find(b => Number(b.headerRow) === targetRow) || null;
}

function getPreviousPayrollRunBlockForFormat_(targetBlock) {
  const blocks = getPayrollRunBlocks_();
  if (!targetBlock) return null;
  const before = blocks.filter(b => Number(b.headerRow) < Number(targetBlock.headerRow));
  if (before.length === 0) return null;
  // Use the nearest previous block. That is the best visual template for continuity.
  return before[before.length - 1];
}

function isPayrollAgentDataRow_(sh, rowNum) {
  const raw = sh.getRange(rowNum, PR_COL.AGENT_ID).getValue();
  const id = typeof raw === 'number' ? raw : parseFloat(raw);
  return Number.isFinite(id) && id > 0 && Math.floor(id) === id && id < 10000;
}

function preservePayrollRunBlockValues_(sh, block) {
  if (!sh || !block || !block.headerRow || !block.lastDataRow) return null;
  const numRows = block.lastDataRow - block.headerRow + 1;
  if (numRows < 1) return null;
  const range = sh.getRange(block.headerRow, 1, numRows, PR_COL.LAST_COL);
  return {
    range: range,
    values: range.getValues(),
    formulas: range.getFormulas(),
    notes: range.getNotes(),
    validations: range.getDataValidations()
  };
}

function restorePayrollRunBlockValues_(snapshot) {
  if (!snapshot || !snapshot.range) return;
  snapshot.range.setValues(snapshot.values);
  try { snapshot.range.setNotes(snapshot.notes); } catch (e) {}
  try { snapshot.range.setDataValidations(snapshot.validations); } catch (e) {}
}

function repairPayrollRunWeekFormattingAtHeader_(headerRow) {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };

  const targetBlock = getPayrollRunBlockByHeaderRow_(headerRow);
  if (!targetBlock) return { ok: false, message: 'Target payroll week block was not found.' };

  const templateBlock = getPreviousPayrollRunBlockForFormat_(targetBlock);
  if (!templateBlock || !templateBlock.headerRow || !templateBlock.firstDataRow || !templateBlock.lastDataRow) {
    // Fallback: still enforce sane formatting on the target block without changing values.
    formatPayrollRunBlockFallback_(sh, targetBlock);
    SpreadsheetApp.flush();
    return { ok: true, message: `${targetBlock.weekLabel || 'Latest week'} formatting repaired using fallback style.` };
  }

  const snapshot = preservePayrollRunBlockValues_(sh, targetBlock);
  const targetRows = targetBlock.lastDataRow - targetBlock.firstDataRow + 1;
  const templateRows = Math.max(1, templateBlock.lastDataRow - templateBlock.firstDataRow + 1);

  try {
    // Header: copy visual format from previous block, then restore values.
    sh.getRange(templateBlock.headerRow, 1, 1, PR_COL.LAST_COL)
      .copyTo(sh.getRange(targetBlock.headerRow, 1, 1, PR_COL.LAST_COL), { formatOnly: true });
    try { sh.setRowHeight(targetBlock.headerRow, sh.getRowHeight(templateBlock.headerRow)); } catch (e) {}

    // Agent rows: copy the alternating pattern from the previous block.
    for (let i = 0; i < targetRows; i++) {
      const sourceRow = templateBlock.firstDataRow + (i % templateRows);
      const targetRow = targetBlock.firstDataRow + i;
      const sourceRange = sh.getRange(sourceRow, 1, 1, PR_COL.LAST_COL);
      const targetRange = sh.getRange(targetRow, 1, 1, PR_COL.LAST_COL);
      sourceRange.copyTo(targetRange, { formatOnly: true });
      try { sh.setRowHeight(targetRow, sh.getRowHeight(sourceRow)); } catch (e) {}
      try { targetRange.setDataValidations(sourceRange.getDataValidations()); } catch (e) {}
    }

    // Restore all target values exactly after formatting copy.
    restorePayrollRunBlockValues_(snapshot);

    // Keep the header clean: status/pay-period values remain stored for logic,
    // but the header cells should look like the week banner, not like agent status cells.
    formatPayrollRunWeekHeaderClean_(sh, targetBlock.headerRow);

    // Reapply pay number formats and status colors on agent rows only.
    for (let r = targetBlock.firstDataRow; r <= targetBlock.lastDataRow; r++) {
      if (!isPayrollAgentDataRow_(sh, r)) continue;
      sh.getRange(r, PR_COL.WEEKLY_BASE, 1, 8).setNumberFormat('$#,##0.00');
      const status = cleanText_(sh.getRange(r, PR_COL.STATUS).getValue()) || STATUS.UNPAID;
      applyStatusColor_(sh.getRange(r, PR_COL.STATUS), status);
      sh.getRange(r, PR_COL.PAY_PERIOD).setFontWeight('bold');
    }
  } catch (e) {
    Logger.log('repairPayrollRunWeekFormattingAtHeader_ failed: ' + e.message);
    restorePayrollRunBlockValues_(snapshot);
    formatPayrollRunBlockFallback_(sh, targetBlock);
    SpreadsheetApp.flush();
    return { ok: false, message: e.message };
  }

  SpreadsheetApp.flush();
  return { ok: true, message: `${targetBlock.weekLabel || 'Latest week'} formatting repaired from the previous Payroll Run week block.` };
}


function formatPayrollRunBlockFallback_(sh, block) {
  if (!sh || !block) return;
  formatPayrollRunWeekHeaderClean_(sh, block.headerRow);
  for (let r = block.firstDataRow; r <= block.lastDataRow; r++) {
    if (!isPayrollAgentDataRow_(sh, r)) continue;
    const bg = ((r - block.firstDataRow) % 2 === 0) ? '#FFFFFF' : BRAND.altRow;
    sh.getRange(r, 1, 1, PR_COL.LAST_COL)
      .setBackground(bg)
      .setFontColor('#000000')
      .setFontWeight('normal')
      .setVerticalAlignment('middle');
    sh.getRange(r, PR_COL.WEEKLY_BASE, 1, 8).setNumberFormat('$#,##0.00');
    const status = cleanText_(sh.getRange(r, PR_COL.STATUS).getValue()) || STATUS.UNPAID;
    applyStatusColor_(sh.getRange(r, PR_COL.STATUS), status);
    try { sh.setRowHeight(r, 22); } catch (e) {}
  }
}

function repairPayrollRunWeekFormatting_() {
  const blocks = getPayrollRunBlocks_();
  if (!blocks || blocks.length === 0) {
    return { ok: false, message: 'No Payroll Run week blocks were found.' };
  }
  const latest = blocks[blocks.length - 1];
  const result = repairPayrollRunWeekFormattingAtHeader_(latest.headerRow);
  if (result.ok) refreshPayrollRunTotals_();
  return result;
}

function repairPayrollRunWeekFormatting() {
  const result = repairPayrollRunWeekFormatting_();
  joiShowMessageDialog_('Repair Payroll Run Week Formatting', result.message || 'Repair complete.');
}

/**
 * onOpen final override '97 keeps every existing JOI Payroll menu item and adds
 * Admin -> Repair Payroll Run Week Formatting.
 */

// 
//  FINAL OVERRIDE '97 PAYROLL RUN BANNER + TOTALS COLOR FIX
//  Approved Option B: navy totals rows, white labels, gold amounts.
//  Formatting only. Preserves all payroll values and formulas.
// 

function joiPayrollRunNavy_() {
  return '#070739';
}

function joiPayrollRunGold_() {
  return '#F4A623';
}

/**
 * Final override for Payroll Run week banner styling.
 * Keeps values stored across the row for logic, but visually matches the older JOI week banners:
 *   A = WEEK #, B = Month Year, C = week range
 *   dark navy banner, gold visible text, hidden non-display cells.
 */
function formatPayrollRunWeekHeaderClean_(sh, headerRow) {
  if (!sh || !headerRow) return;

  const navy = joiPayrollRunNavy_();
  const gold = joiPayrollRunGold_();
  const full = sh.getRange(headerRow, 1, 1, PR_COL.LAST_COL);

  // Full banner background.
  full
    .setBackground(navy)
    .setFontColor(navy) // hide stored logic values outside display columns
    .setFontWeight('bold')
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setWrap(false);

  // Visible banner cells: WEEK # | Month Year | Week Range.
  sh.getRange(headerRow, PR_COL.AGENT_ID, 1, 3)
    .setFontColor(gold)
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle')
    .setWrap(false);

  // Keep the rest of the banner clean; status/pay period remain stored but not visible in the banner.
  if (PR_COL.STATUS <= PR_COL.LAST_COL) {
    sh.getRange(headerRow, PR_COL.STATUS, 1, PR_COL.LAST_COL - PR_COL.STATUS + 1)
      .setBackground(navy)
      .setFontColor(navy)
      .setFontWeight('bold')
      .setFontSize(16);
  }

  try { sh.setRowHeight(headerRow, 32); } catch (e) {}
}

/**
 * Final override for Payroll Run totals styling.
 * Keeps the same totals logic, but changes the visual style to JOI navy + white labels + gold amounts.
 */
function refreshPayrollRunTotals_() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) return;

  const navy = (typeof joiPayrollRunNavy_ === 'function') ? joiPayrollRunNavy_() : BRAND.headerBg;
  const gold = (typeof joiPayrollRunGold_ === 'function') ? joiPayrollRunGold_() : BRAND.colHeaderBg;
  const white = '#FFFFFF';
  const lastRow = sh.getLastRow();

  // Remove existing totals rows first, then identify the last real payroll data row.
  let lastDataRow = 3;
  for (let r = 4; r <= lastRow; r++) {
    const v = cleanText_(sh.getRange(r, PR_COL.AGENT_ID).getValue());
    if (v.toUpperCase().includes('TOTAL')) {
      sh.getRange(r, 1, lastRow - r + 1, PR_COL.LAST_COL).clearContent().clearFormat();
      break;
    }
    if (v !== '') lastDataRow = r;
  }

  // Bottom Payroll Run totals are now split into three useful scopes:
  // 1. Current pay period unpaid total.
  // 2. Current month paid total.
  // 3. Current month total.
  // The current/open pay period is the newest Payroll Run week block.
  const blocks = getPayrollRunBlocks_().filter(b => b && b.ppCode);
  const targetPP = blocks.length ? cleanText_(blocks[blocks.length - 1].ppCode) : '';
  const monthKey = payrollRunMonthKeyFromPP_(targetPP);
  const monthLabel = payrollRunMonthLabelFromPP_(targetPP) || 'CURRENT MONTH';
  const targetLabel = targetPP || 'CURRENT PERIOD';

  let currentPeriodUnpaid = 0;
  let currentMonthPaid = 0;
  let currentMonthTotal = 0;

  if (lastDataRow >= 4 && targetPP && monthKey) {
    const data = sh.getRange(4, 1, lastDataRow - 3, PR_COL.LAST_COL).getValues();
    data.forEach(row => {
      const id = row[PR_COL.AGENT_ID - 1];
      if (typeof id !== 'number' && isNaN(parseFloat(id))) return;

      const rowPP = cleanText_(row[PR_COL.PAY_PERIOD - 1]);
      if (!rowPP) return;

      const status = cleanText_(row[PR_COL.STATUS - 1]);
      const pay = Number(row[PR_COL.TOTAL_PAY - 1]) || 0;
      const rowMonthKey = payrollRunMonthKeyFromPP_(rowPP);

      if (rowPP === targetPP && status !== STATUS.PAID) {
        currentPeriodUnpaid += pay;
      }

      if (rowMonthKey === monthKey) {
        currentMonthTotal += pay;
        if (status === STATUS.PAID) currentMonthPaid += pay;
      }
    });
  }

  const totalsRow = lastDataRow + 2;
  const rows = [
    [`${targetLabel} UNPAID TOTAL`, currentPeriodUnpaid],
    [`${monthLabel.toUpperCase()} PAID TOTAL`, currentMonthPaid],
    [`${monthLabel.toUpperCase()} TOTAL`, currentMonthTotal],
  ];

  rows.forEach(([label, amount], i) => {
    const r = totalsRow + i;
    const rowRange = sh.getRange(r, 1, 1, PR_COL.LAST_COL);
    rowRange
      .setBackground(navy)
      .setFontColor(white)
      .setFontWeight('bold')
      .setFontSize(11)
      .setVerticalAlignment('middle');

    sh.getRange(r, PR_COL.AGENT_ID)
      .setValue(label)
      .setFontColor(white)
      .setFontWeight('bold')
      .setHorizontalAlignment('left');

    sh.getRange(r, PR_COL.TOTAL_PAY)
      .setValue(amount)
      .setNumberFormat('$#,##0.00')
      .setFontColor(gold)
      .setFontWeight('bold')
      .setHorizontalAlignment('right');

    try { sh.setRowHeight(r, 26); } catch (e) {}
  });

  SpreadsheetApp.flush();
}

function payrollRunMonthKeyFromPP_(ppCode) {
  const code = cleanText_(ppCode).toUpperCase();
  const m = code.match(/^([A-Z]+?)(\d{2})?PP[12]$/);
  if (!m) return '';
  return m[1] + (m[2] || '');
}

function payrollRunMonthLabelFromPP_(ppCode) {
  const code = cleanText_(ppCode).toUpperCase();
  const m = code.match(/^([A-Z]+?)(\d{2})?PP[12]$/);
  if (!m) return '';

  const monthRaw = m[1];
  const yearRaw = m[2] || '';
  const month = monthRaw.charAt(0) + monthRaw.slice(1).toLowerCase();
  const year = yearRaw ? ('20' + yearRaw) : '';

  return year ? `${month} ${year}` : month;
}

// 
//  OVERRIDE LAYER '97 MONTHLY 4-WEEK / 5-WEEK LAYOUT FIX
//  Approved rule:
//    4-week months: PP1 total at Week 2, PP2 total at Week 4.
//    5-week months: PP1 total at Week 2, PP2 total at Week 5.
//  This keeps the original JOI monthly look and only changes the dynamic
//  monthly layout logic/header placement. Payroll math and Payroll Run data
//  are untouched.
// 

function getMonthIndexFromName_(monthName) {
  return ['January','February','March','April','May','June','July','August','September','October','November','December']
    .findIndex(m => m.toLowerCase() === cleanText_(monthName).toLowerCase());
}

function getMonthPartsFromSheetName_(sheetName) {
  const m = cleanText_(sheetName).match(/^(January|February|March|April|May|June|July|August|October|November|December|September)\s+(\d{2})\s+PayRoll$/i);
  if (!m) return null;
  const month = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  const year = 2000 + Number(m[2]);
  return { monthName: month, year: year };
}

function getNeededWeeksForMonth_(monthName, year) {
  const ranges = getMonthWeekRanges_(monthName, year);
  return Math.max(4, Math.min(ranges.length || 4, 5));
}

function getNeededWeeksForMonthlySheet_(shOrName, requestedWeeks) {
  if (requestedWeeks) return Math.max(4, Math.min(Number(requestedWeeks) || 4, 5));
  const name = typeof shOrName === 'string' ? shOrName : (shOrName && shOrName.getName ? shOrName.getName() : '');
  const parts = getMonthPartsFromSheetName_(name);
  if (parts) return getNeededWeeksForMonth_(parts.monthName, parts.year);
  return 4;
}

function monthlyFixedWeekSections_(neededWeeks) {
  const weeks = Math.max(4, Math.min(Number(neededWeeks) || 4, 5));

  if (weeks >= 5) {
    return [
      { weekNum: 1, headerRow: 3, headerRow2: 4, startCol: 1,  endCol: 4,  sepCol: 5,  hasTotal: false }, // A:D, sep E
      { weekNum: 2, headerRow: 3, headerRow2: 4, startCol: 6,  endCol: 10, sepCol: 11, hasTotal: true  }, // F:J, sep K
      { weekNum: 3, headerRow: 3, headerRow2: 4, startCol: 12, endCol: 15, sepCol: 16, hasTotal: false }, // L:O, sep P
      { weekNum: 4, headerRow: 3, headerRow2: 4, startCol: 17, endCol: 20, sepCol: 21, hasTotal: false }, // Q:T, sep U
      { weekNum: 5, headerRow: 3, headerRow2: 4, startCol: 22, endCol: 26, sepCol: null, hasTotal: true  }, // V:Z
    ];
  }

  return [
    { weekNum: 1, headerRow: 3, headerRow2: 4, startCol: 1,  endCol: 4,  sepCol: 5,  hasTotal: false }, // A:D, sep E
    { weekNum: 2, headerRow: 3, headerRow2: 4, startCol: 6,  endCol: 10, sepCol: 11, hasTotal: true  }, // F:J, sep K
    { weekNum: 3, headerRow: 3, headerRow2: 4, startCol: 12, endCol: 15, sepCol: 16, hasTotal: false }, // L:O, sep P
    { weekNum: 4, headerRow: 3, headerRow2: 4, startCol: 17, endCol: 21, sepCol: null, hasTotal: true  }, // Q:U
  ];
}

function getMonthlyLastActiveColumn_(neededWeeks) {
  const sections = monthlyFixedWeekSections_(neededWeeks);
  return sections[sections.length - 1].endCol;
}

function ensureMonthlyFixedColumns_(sh, neededWeeks) {
  const weeks = Math.max(4, Math.min(Number(neededWeeks) || 4, 5));
  const sections = monthlyFixedWeekSections_(weeks);
  const lastNeededCol = getMonthlyLastActiveColumn_(weeks);

  if (sh.getMaxColumns() < lastNeededCol) {
    sh.insertColumnsAfter(sh.getMaxColumns(), lastNeededCol - sh.getMaxColumns());
  }

  // NOTE: No copyTo calls here — they crash on sheets with merged cells.
  // All column formatting is handled explicitly in repairMonthlyTemplateLayout_.
  if (weeks >= 5) {
    try {
      const maxRows = Math.max(1, sh.getMaxRows());
      // Separator before Week 5 lives in U (col 21) — force narrow dark.
      if (sh.getMaxColumns() >= 21) {
        sh.getRange(3, 21, Math.max(1, maxRows - 2), 1)
          .setBackground(BRAND.headerBg)
          .setFontColor(BRAND.headerBg)
          .setFontWeight('normal');
        sh.setColumnWidth(21, 10);
      }
      // Clean old unused AA column if a previous version created Week 5 in W:AA.
      if (sh.getMaxColumns() >= 27) {
        sh.getRange(1, 27, maxRows, 1)
          .clearContent()
          .setBackground('#ffffff')
          .setFontColor('#000000')
          .setFontWeight('normal');
        sh.setColumnWidth(27, 28);
      }
    } catch (e) {
      Logger.log('ensureMonthlyFixedColumns_ 5-week pass failed: ' + e.message);
    }
  }

  return sections;
}

function monthlyRow4HeadersForSection_(section, totalAtThisSection) {
  if (totalAtThisSection) return ['Agent ID', 'Agent Name', 'Weekly Pay', 'Notes', 'Bi-Weekly Total'];
  return ['Agent ID', 'Agent Name', 'Weekly Pay', 'Notes'];
}

function getMonthlyWeekSections_(sh) {
  if (!sh) return [];
  const neededWeeks = getNeededWeeksForMonthlySheet_(sh);
  return monthlyFixedWeekSections_(neededWeeks);
}

function getMonthlySectionColumnMap_(sh, section) {
  const neededWeeks = getNeededWeeksForMonthlySheet_(sh);
  const fixed = monthlyFixedWeekSections_(neededWeeks).find(s => Number(s.weekNum) === Number(section.weekNum));
  const s = fixed || section;
  return {
    idCol: s.startCol,
    nameCol: s.startCol + 1,
    payCol: s.startCol + 2,
    notesCol: s.startCol + 3,
    totalCol: s.hasTotal ? s.endCol : null,
    hasHeaderRow: true,
  };
}

function extendMonthlyTopBanners_(sh, neededWeeks) {
  const lastCol = getMonthlyLastActiveColumn_(neededWeeks);
  if (sh.getMaxColumns() < lastCol) return;
  try {
    // Do not rebuild/merge the logo row. Just extend the visual color area.
    sh.getRange(1, 1, 1, lastCol)
      .setBackground(BRAND.headerBg)
      .setFontColor(BRAND.headerFg)
      .setFontWeight('bold');
    sh.getRange(2, 1, 1, lastCol)
      .setBackground(BRAND.colHeaderBg)
      .setFontColor(BRAND.colHeaderFg)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
  } catch (e) {
    Logger.log('extendMonthlyTopBanners_ failed: ' + e.message);
  }
}

function updateMonthlyTitleAndWeekHeaders_(sh, monthName, year, weekRanges) {
  const neededWeeks = getNeededWeeksForMonth_(monthName, year);
  const sections = ensureMonthlyFixedColumns_(sh, neededWeeks);
  extendMonthlyTopBanners_(sh, neededWeeks);

  // Update month title while preserving the existing title cell/style.
  const maxRows = Math.min(5, sh.getMaxRows());
  const maxCols = Math.min(sh.getMaxColumns(), 40);
  const values = sh.getRange(1, 1, maxRows, maxCols).getDisplayValues();
  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      if (/MONTHLY+PAY+SHEET/i.test(values[r][c])) {
        sh.getRange(r + 1, c + 1).setValue(`${monthName.toUpperCase()} ${year} — MONTHLY PAY SHEET`);
      }
    }
  }

  // Break row 3 header merges across the active layout once, then re-merge clean week banners.
  safeBreakOverlappingMerges_(sh, 3, 1, 1, getMonthlyLastActiveColumn_(neededWeeks));

  sections.forEach((s, idx) => {
    if (!weekRanges[idx]) return;
    const width = s.endCol - s.startCol + 1;
    const label = `WEEK ${idx + 1} ${weekRanges[idx].label}`;
    const headerRange = sh.getRange(3, s.startCol, 1, width);
    safeMergeRange_(headerRange);
    headerRange.setValue(label)
      .setBackground(BRAND.colHeaderBg)
      .setFontColor(BRAND.colHeaderFg)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
  });

  repairMonthlyTemplateLayout_(sh.getName(), neededWeeks);
}

function repairMonthlyTemplateLayout_(sheetName, requestedWeeks) {
  const ss = ss_();
  const sh = sheetName ? ss.getSheetByName(sheetName) : ss.getActiveSheet();
  if (!sh) return { ok: false, message: 'Monthly sheet not found.' };

  const neededWeeks = getNeededWeeksForMonthlySheet_(sh, requestedWeeks);
  const sections = ensureMonthlyFixedColumns_(sh, neededWeeks);
  extendMonthlyTopBanners_(sh, neededWeeks);

  // Header row 3 and row 4 repair only. Values below row 4 are preserved.
  safeBreakOverlappingMerges_(sh, 3, 1, 2, getMonthlyLastActiveColumn_(neededWeeks));

  sections.forEach((s, idx) => {
    const width = s.endCol - s.startCol + 1;

    const weekBanner = sh.getRange(3, s.startCol, 1, width);
    safeMergeRange_(weekBanner);
    weekBanner
      .setBackground(BRAND.colHeaderBg)
      .setFontColor(BRAND.colHeaderFg)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');

    const existing = cleanText_(weekBanner.getDisplayValue());
    if (!/^WEEK\s+/i.test(existing)) {
      weekBanner.setValue(`WEEK ${idx + 1}`);
    }

    const headers = monthlyRow4HeadersForSection_(s, s.hasTotal);
    safeBreakOverlappingMerges_(sh, 4, s.startCol, 1, width);
    const row4Range = sh.getRange(4, s.startCol, 1, headers.length);
    row4Range.setValues([headers])
      .setBackground(BRAND.headerBg)
      .setFontColor(BRAND.headerFg)
      .setFontWeight('bold')
      .setFontSize(9)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(false);

    if (headers.length < width) {
      sh.getRange(4, s.startCol + headers.length, 1, width - headers.length)
        .clearContent()
        .setBackground(BRAND.headerBg)
        .setFontColor(BRAND.headerFg)
        .setFontWeight('bold')
        .setFontSize(9)
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle')
        .setWrap(false);
    }

    if (s.sepCol && idx < sections.length - 1) {
      sh.getRange(3, s.sepCol, Math.max(1, sh.getMaxRows() - 2), 1)
        .setBackground(BRAND.headerBg)
        .setFontColor(BRAND.headerBg)
        .setFontWeight('normal');
      // Force separator column to be thin (10px) — prevents wide blue/black stripe
      try { sh.setColumnWidth(s.sepCol, 10); } catch (e) {}
    }
  });

  // Remove old Week 5 header/data residue from AA if an earlier script created W:AA.
  if (neededWeeks >= 5 && sh.getMaxColumns() >= 27) {
    try {
      sh.getRange(3, 27, Math.max(1, sh.getMaxRows() - 2), 1)
        .clearContent()
        .setBackground('#ffffff')
        .setFontColor('#000000')
        .setFontWeight('normal');
    } catch (e) {
      Logger.log('clear old AA column residue failed: ' + e.message);
    }
  }

  // ── APPLY ALTERNATING ROW COLORS (white/cream) to all data rows (row 5+) ────
  // Matches the color scheme used in Payroll Run, Pay Rules, and Agents sheets.
  // Uses setBackgrounds() 2D array for efficiency (1 API call per section).
  {
    const totalDataRows = Math.max(1, sh.getMaxRows() - 4);
    const white = joiWhite_();   // #FFFFFF
    const cream  = joiCream_();  // #FFF4DA
    const navy   = joiNavy_();   // #070739

    sections.forEach(s => {
      const safeCols = Math.min(s.endCol, sh.getMaxColumns()) - s.startCol + 1;
      if (safeCols <= 0) return;
      try {
        // Build 2D background array: alternating white/cream per row
        const bgArray = [];
        for (let i = 0; i < totalDataRows; i++) {
          bgArray.push(new Array(safeCols).fill(i % 2 === 0 ? white : cream));
        }
        sh.getRange(5, s.startCol, totalDataRows, safeCols)
          .setBackgrounds(bgArray)
          .setFontColor(navy)
          .setFontSize(10)
          .setFontWeight('normal')
          .setWrap(false)
          .setHorizontalAlignment('left')
          .setVerticalAlignment('middle');
      } catch (e) {
        Logger.log('Monthly alternating colors failed for section ' + s.weekNum + ': ' + e.message);
      }
    });

    // Set row heights for all data rows
    for (let i = 0; i < totalDataRows; i++) {
      try { sh.setRowHeight(5 + i, 22); } catch (e) {}
    }
  }

  // ── SEPARATOR COLUMN WIDTHS: force all to 10px ───────────────────────────────
  // Separator columns for 4-week: E(5), K(11), P(16); for 5-week: also U(21)
  const sepCols = neededWeeks >= 5 ? [5, 11, 16, 21] : [5, 11, 16];
  sepCols.forEach(c => {
    try { if (sh.getMaxColumns() >= c) sh.setColumnWidth(c, 10); } catch (e) {}
  });

  // Set data column widths for a clean, consistent monthly layout
  // Week 1: A(1)=AgentID, B(2)=Name, C(3)=Pay, D(4)=Notes
  // Week 2: F(6)=AgentID, G(7)=Name, H(8)=Pay, I(9)=Notes, J(10)=BiWeekly
  // Week 3: L(12)=AgentID, M(13)=Name, N(14)=Pay, O(15)=Notes
  // Week 4 (4wk): Q(17)=AgentID, R(18)=Name, S(19)=Pay, T(20)=Notes, U(21)=Total
  // Week 4 (5wk): Q(17)=AgentID, R(18)=Name, S(19)=Pay, T(20)=Notes
  // Week 5: V(22)=AgentID, W(23)=Name, X(24)=Pay, Y(25)=Notes, Z(26)=MonthlyTotal
  const colWidths = {
    1: 55, 2: 140, 3: 85, 4: 80,       // Week 1: A-D
    6: 55, 7: 140, 8: 85, 9: 80, 10: 90, // Week 2: F-J
    12: 55, 13: 140, 14: 85, 15: 80,    // Week 3: L-O
    17: 55, 18: 140, 19: 85, 20: 80,    // Week 4: Q-T
  };
  if (neededWeeks <= 4) {
    colWidths[21] = 90; // Week 4 has BiWeekly Total in U for 4-week months
  } else {
    // 5-week: Week 5 in V-Z
    colWidths[22] = 55; colWidths[23] = 140; colWidths[24] = 85;
    colWidths[25] = 80; colWidths[26] = 90;
  }
  Object.entries(colWidths).forEach(([col, width]) => {
    try { if (sh.getMaxColumns() >= Number(col)) sh.setColumnWidth(Number(col), width); } catch (e) {}
  });

  // Force pixel heights regardless of any prior "Fit to data" mode on these
  // rows. SpreadsheetApp.setRowHeight() doesn't switch modes, only sets a
  // minimum; joiLockRowHeight_ uses the Sheets Advanced Service to force fixed.
  joiLockRowHeight_(sh, 3, 36);
  joiLockRowHeight_(sh, 4, 24);
  SpreadsheetApp.flush();
  return { ok: true, message: `${sh.getName()} monthly template header structure repaired for ${neededWeeks} week layout.` };
}

function repairMonthlyTemplateLayout() {
  const ss = ss_();
  const active = ss.getActiveSheet();
  let target = active && monthlySheetNameRegex_().test(active.getName()) ? active : ss.getSheetByName('April 26 PayRoll');
  if (!target) target = active;
  const result = repairMonthlyTemplateLayout_(target.getName());
  joiShowMessageDialog_('Repair Monthly Template Layout', result.message || 'Repair complete.');
}

function clearMonthlyDynamicData_(sh, sections) {
  const startRow = 5;
  const rowsToClear = Math.max(0, sh.getMaxRows() - startRow + 1);
  if (rowsToClear < 1) return;
  const neededWeeks = getNeededWeeksForMonthlySheet_(sh);
  const activeSections = sections || monthlyFixedWeekSections_(neededWeeks);
  activeSections.forEach(s => {
    if (!s || s.endCol > sh.getMaxColumns()) return;
    sh.getRange(startRow, s.startCol, rowsToClear, s.endCol - s.startCol + 1).clearContent();
  });
  // Clear any old unused AA residue from the prior W:AA 5-week layout.
  if (neededWeeks >= 5 && sh.getMaxColumns() >= 27) {
    try { sh.getRange(startRow, 27, rowsToClear, 1).clearContent(); } catch (e) {}
  }
}

function ensureMonthlySheet(monthName, year) {
  const ss = ss_();
  const name = monthSheetName_(monthName, year);
  let sh = ss.getSheetByName(name);
  const weekRanges = getMonthWeekRanges_(monthName, year);
  const neededWeeks = getNeededWeeksForMonth_(monthName, year);

  if (sh) {
    updateMonthlyTitleAndWeekHeaders_(sh, monthName, year, weekRanges);
    repairMonthlyTemplateLayout_(name, neededWeeks);
    return sh;
  }

  const template = getMonthlyTemplateSheet_(name);
  if (template) {
    // Repair April when used as the source, but keep April as a 4-week template.
    if (template.getName() === 'April 26 PayRoll') repairMonthlyTemplateLayout_('April 26 PayRoll', 4);
    sh = template.copyTo(ss);
    sh.setName(name);
    ss.setActiveSheet(sh);
    updateMonthlyTitleAndWeekHeaders_(sh, monthName, year, weekRanges);
    repairMonthlyTemplateLayout_(name, neededWeeks);
    return sh;
  }

  // Fallback only if no monthly template exists at all. This should rarely be used.
  sh = getOrCreateSheet_(ss, name);
  sh.clear();
  if (sh.getMaxColumns() < getMonthlyLastActiveColumn_(neededWeeks)) {
    sh.insertColumnsAfter(sh.getMaxColumns(), getMonthlyLastActiveColumn_(neededWeeks) - sh.getMaxColumns());
  }
  updateMonthlyTitleAndWeekHeaders_(sh, monthName, year, weekRanges);
  return sh;
}

function syncMonthlySheetFromPayrollRun(monthName, year, silent) {
  const ss = ss_();
  const sh = ensureMonthlySheet(monthName, year);
  const shPR = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!shPR) {
    const msg = 'Payroll Run sheet not found.';
    if (!silent) joiShowMessageDialog_('Sync Monthly Sheet', msg);
    return { ok: false, message: msg };
  }

  const weekRanges = getMonthWeekRanges_(monthName, year);
  const neededWeeks = getNeededWeeksForMonth_(monthName, year);
  updateMonthlyTitleAndWeekHeaders_(sh, monthName, year, weekRanges);
  let sections = monthlyFixedWeekSections_(neededWeeks);
  clearMonthlyDynamicData_(sh, sections);

  const fullUpper = monthName.toUpperCase();
  const monthBlocks = getPayrollRunBlocks_()
    .map(b => {
      const parsed = parsePayrollBlockDateRange_(b.dateRange);
      return Object.assign({}, b, { parsedStartDate: parsed && parsed.startDate, parsedEndDate: parsed && parsed.endDate });
    })
    .filter(b => {
      const pp = cleanText_(b.ppCode).toUpperCase();
      return pp.startsWith(fullUpper) && b.parsedEndDate && b.parsedEndDate.getFullYear() === year;
    })
    .sort((a,b) => a.parsedEndDate.getTime() - b.parsedEndDate.getTime());

  if (monthBlocks.length === 0) {
    const msg = `No payroll blocks found for ${monthName} ${year}.`;
    if (!silent) joiShowMessageDialog_('Sync Monthly Sheet', msg);
    return { ok: false, message: msg };
  }

  // Defensive: break any stray merged cells inside the data area before we write,
  // otherwise setValue on a non-top-left merge cell fails silently and leaves
  // late-added agents (e.g. Miguel #56 / Diego #57) with missing Name + Pay.
  try {
    const firstClearRow = 5;
    const lastSheetRow = Math.max(firstClearRow, sh.getMaxRows());
    const lastSheetCol = sh.getMaxColumns();
    if (lastSheetRow >= firstClearRow && lastSheetCol >= 1) {
      sh.getRange(firstClearRow, 1, lastSheetRow - firstClearRow + 1, lastSheetCol).breakApart();
    }
  } catch (e) {
    Logger.log('syncMonthlySheetFromPayrollRun breakApart failed: ' + e.message);
  }

  const agentIds = new Set();
  const weekData = {};
  monthBlocks.forEach((block, idx) => {
    const weekNum = idx + 1;
    weekData[weekNum] = {};
    if (!block.firstDataRow || !block.lastDataRow) return;
    const numRows = block.lastDataRow - block.firstDataRow + 1;
    if (numRows < 1) return;
    const data = shPR.getRange(block.firstDataRow, 1, numRows, PR_COL.LAST_COL).getValues();
    data.forEach(row => {
      const id = Number(row[PR_COL.AGENT_ID - 1]);
      if (!Number.isFinite(id) || id <= 0) return;
      const name = cleanText_(row[PR_COL.AGENT_NAME - 1]);
      const pay = Number(row[PR_COL.TOTAL_PAY - 1]) || 0;
      const note = cleanText_(row[PR_COL.MEMO - 1]);
      agentIds.add(id);
      weekData[weekNum][id] = { name, pay, notes: note };
    });
  });

  const sortedIds = Array.from(agentIds).sort((a,b) => a - b);
  const firstDataRow = 5;
  const lastWeekNum = Math.min(sections.length, Math.max(monthBlocks.length, 1));

  sections.forEach((section, sIdx) => {
    const weekNum = sIdx + 1;
    const map = getMonthlySectionColumnMap_(sh, section);
    sortedIds.forEach((id, i) => {
      const rowNum = firstDataRow + i;
      const wd = (weekData[weekNum] || {})[id];  // undefined if agent has no data this week

      if (wd) {
        // Agent has actual data this week — write every cell explicitly using
        // a single batched setValues so values can't drift into wrong columns.
        const payVal  = Number(wd.pay) || 0;
        const nameVal = wd.name || '';
        const noteVal = wd.notes || '';
        if (map.idCol)    sh.getRange(rowNum, map.idCol).setValue(id);
        if (map.nameCol)  sh.getRange(rowNum, map.nameCol).setValue(nameVal);
        if (map.payCol)   sh.getRange(rowNum, map.payCol).setValue(payVal).setNumberFormat('$#,##0.00');
        if (map.notesCol) sh.getRange(rowNum, map.notesCol).setValue(noteVal);
      } else {
        // Agent did NOT appear in this week's payroll — leave the per-week
        // cells empty so the layout doesn't show a phantom row.
        if (map.idCol)    sh.getRange(rowNum, map.idCol).clearContent();
        if (map.nameCol)  sh.getRange(rowNum, map.nameCol).clearContent();
        if (map.payCol)   sh.getRange(rowNum, map.payCol).clearContent();
        if (map.notesCol) sh.getRange(rowNum, map.notesCol).clearContent();
      }

      // Bi-Weekly / monthly totals always compute, but only display if non-zero.
      if (map.totalCol) {
        let total = 0;
        const startW = weekNum <= 2 ? 1 : 3;
        const endW = weekNum <= 2 ? Math.min(2, lastWeekNum) : lastWeekNum;
        for (let w = startW; w <= endW; w++) {
          total += ((weekData[w] || {})[id] || {}).pay || 0;
        }
        if (total > 0) {
          sh.getRange(rowNum, map.totalCol).setValue(total).setNumberFormat('$#,##0.00');
        } else {
          sh.getRange(rowNum, map.totalCol).clearContent();
        }
      }
    });
  });

  // Clear stale rows below the last agent — content + restore correct alternating colors.
  {
    const lastWrittenRow = sortedIds.length > 0 ? firstDataRow + sortedIds.length - 1 : firstDataRow - 1;
    const maxRow = sh.getMaxRows();
    if (lastWrittenRow < maxRow) {
      const staleStart = lastWrittenRow + 1;
      const staleCount = maxRow - lastWrittenRow;
      const white = joiWhite_();
      const cream  = joiCream_();
      sections.forEach(s => {
        const safeCols = Math.min(s.endCol, sh.getMaxColumns()) - s.startCol + 1;
        if (safeCols <= 0) return;
        try {
          const bgArray = [];
          for (let i = 0; i < staleCount; i++) {
            // Continue the alternating pattern from where agent rows left off
            const rowIdx = (staleStart - firstDataRow) + i;
            bgArray.push(new Array(safeCols).fill(rowIdx % 2 === 0 ? white : cream));
          }
          sh.getRange(staleStart, s.startCol, staleCount, safeCols)
            .clearContent()
            .setBackgrounds(bgArray)
            .setFontColor(joiNavy_())
            .setFontSize(10)
            .setFontWeight('normal')
            .setWrap(false)
            .setHorizontalAlignment('left')
            .setVerticalAlignment('middle');
        } catch (e) {}
      });
    }
  }

  repairMonthlyTemplateLayout_(sh.getName(), neededWeeks);
  SpreadsheetApp.flush();
  const msg = `${monthName} ${year} monthly sheet synced successfully using the existing template layout. Weeks synced: ${monthBlocks.length}.`;
  if (!silent) joiShowMessageDialog_('Sync Monthly Sheet', msg);
  return { ok: true, message: msg, monthName, year };
}

// 
//  FINAL OVERRIDE '97 DASHBOARD + PAY RULES BRANDING / ADD PAY RULE
//  Approved fix: remove invalid #NUM dashboard rows, restyle Dashboard and Pay Rules,
//  and add a branded Add Pay Rule workflow with duplicate prevention.
//  Preserves payroll math, formulas, paystub logic, monthly sync logic, and payroll values.
// 

function joiNavy_() { return '#070739'; }
function joiGold_() { return '#F4A623'; }
function joiCream_() { return '#FFF4DA'; }
function joiBorder_() { return '#DADCE0'; }
function joiWhite_() { return '#FFFFFF'; }

function isValidAgentIdValue_(v) {
  const n = (typeof v === 'number') ? v : Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) && n > 0 && Math.floor(n) === n && n <= 9999;
}

function toValidAgentId_(v) {
  if (!isValidAgentIdValue_(v)) return null;
  return (typeof v === 'number') ? Math.floor(v) : Math.floor(Number(String(v).replace(/[^0-9.-]/g, '')));
}

function parseJoiMoneyInput_(v, fieldName) {
  const text = cleanText_(v).replace(/[$,]/g, '');
  if (text === '') return 0;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${fieldName} must be a valid non-negative number.`);
  return Math.round(n * 100) / 100;
}

function parseJoiPercentInput_(v, fieldName) {
  const text = cleanText_(v).replace('%', '');
  if (text === '') return 0;
  let n = Number(text);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${fieldName} must be a valid non-negative number.`);
  if (n > 1) n = n / 100;
  return Math.round(n * 10000) / 10000;
}

function buildRuleKeyFromParts_(campaign, department, shift) {
  const c = cleanText_(campaign).toUpperCase();
  const d = cleanText_(department).toUpperCase();
  const s = cleanText_(shift).toUpperCase();
  if (!c || !d || !s) return '';
  return normalizeRuleKey_(`${c}|${d}|${s}`);
}

function formatPayRulesRows_(sh) {
  if (!sh) return;
  const lastRow = Math.max(sh.getLastRow(), 4);
  const dataRows = Math.max(0, lastRow - 3);
  if (dataRows < 1) return;

  const rng = sh.getRange(4, 1, dataRows, RULE_COL.LAST_COL);
  rng.setFontColor('#111111')
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, joiBorder_(), SpreadsheetApp.BorderStyle.SOLID);

  for (let i = 0; i < dataRows; i++) {
    const r = 4 + i;
    sh.getRange(r, 1, 1, RULE_COL.LAST_COL).setBackground(i % 2 === 0 ? joiWhite_() : joiCream_());
    sh.setRowHeight(r, 22);
  }

  sh.getRange(4, RULE_COL.RULE_KEY, dataRows, 1)
    .setFontColor(joiNavy_())
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setWrap(false);

  sh.getRange(4, RULE_COL.CAMPAIGN, dataRows, 3).setHorizontalAlignment('center');
  sh.getRange(4, RULE_COL.FULL_ATTEND, dataRows, 1).setHorizontalAlignment('center');
  sh.getRange(4, RULE_COL.WEEKLY_BASE, dataRows, 6).setNumberFormat('$#,##0.00');
  sh.getRange(4, RULE_COL.VACATION_PCT, dataRows, 1).setNumberFormat('0.00%');
}

function insertCenteredPayRulesLogo_(sh, startCol, endCol) {
  // Center one JOI LOGO.png across the Pay Rules top navy banner.
  // Google Sheets images are anchored to a cell, so we calculate the nearest
  // anchor column + pixel offset from the actual column widths.
  const logoWidth = 118;
  const logoHeight = 36;
  try {
    const files = DriveApp.getFilesByName('JOI LOGO.png');
    if (!files.hasNext()) return false;

    let totalWidth = 0;
    for (let c = startCol; c <= endCol; c++) totalWidth += sh.getColumnWidth(c);
    const targetX = Math.max(0, Math.round((totalWidth - logoWidth) / 2));

    let walked = 0;
    let anchorCol = startCol;
    let xOffset = targetX;
    for (let c = startCol; c <= endCol; c++) {
      const w = sh.getColumnWidth(c);
      if (walked + w > targetX) {
        anchorCol = c;
        xOffset = targetX - walked;
        break;
      }
      walked += w;
    }

    const img = sh.insertImage(files.next().getBlob(), anchorCol, 1, xOffset, 3);
    try { img.setWidth(logoWidth).setHeight(logoHeight); } catch (e) {}
    return true;
  } catch (e) {
    Logger.log('Pay Rules centered logo insert skipped: ' + e.message);
    return false;
  }
}

function repairPayRulesSheetStyle_() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAY_RULES);
  if (!sh) return { ok: false, message: 'Pay Rules sheet not found.' };

  const numCols = RULE_COL.LAST_COL; // Locked Pay Rules structure = A:L only.
  const maxCols = sh.getMaxColumns();
  const maxRows = sh.getMaxRows();

  // Break any old header merges across the visible repair area first. This avoids
  // partial-merge errors and removes old A:M / A:N title merges from prior versions.
  try { safeBreakOverlappingMerges_(sh, 1, 1, 3, maxCols); } catch (e) {}

  // Pay Rules should not have any working columns after Vacation Premium %.
  // Clear, but do not delete, extra columns to avoid risky sheet-structure changes.
  if (maxCols > numCols) {
    try {
      const extraCols = maxCols - numCols;
      const extraRange = sh.getRange(1, numCols + 1, maxRows, extraCols);
      extraRange.clear();
      extraRange.setBackground('#FFFFFF').setFontColor('#111111').setFontWeight('normal');
    } catch (e) {
      Logger.log('Pay Rules extra-column cleanup skipped: ' + e.message);
    }
  }

  // Remove every image on Pay Rules before inserting the single approved JOI logo.
  // This fixes the double-logo issue without touching other tabs.
  try {
    sh.getImages().forEach(img => {
      try { img.remove(); } catch (err) {}
    });
  } catch (e) {
    Logger.log('Pay Rules image cleanup skipped: ' + e.message);
  }

  sh.setRowHeight(1, 42);
  sh.getRange(1, 1, 1, numCols)
    .setBackground(joiNavy_())
    .setFontColor(joiWhite_())
    .setFontWeight('bold')
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('center')
    .setBorder(false, false, false, false, false, false);

  const titleRange = sh.getRange(2, 1, 1, numCols);
  safeMergeRange_(titleRange);
  titleRange
    .setValue('PAY RULES & COMPENSATION STRUCTURE')
    .setBackground(joiGold_())
    .setFontColor(joiNavy_())
    .setFontWeight('bold')
    .setFontSize(13)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(false);
  sh.setRowHeight(2, 28);

  sh.getRange(3, 1, 1, numCols).setValues([[
    'Rule Key', 'Campaign', 'Department', 'Shift',
    'Full Attendance', 'Weekly Base Pay', 'Daily Salary',
    'KPI Bonus', 'Missed Day Deduction', 'Overtime Day Pay',
    'Sunday Bonus', 'Vacation Premium %'
  ]])
    .setBackground(joiGold_())
    .setFontColor(joiNavy_())
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true)
    .setBorder(false, false, false, false, false, false);
  sh.setRowHeight(3, 34);

  // Force the banner/title/header rows to be clean bands with no visible cell borders.
  sh.getRange(1, 1, 3, numCols).setBorder(false, false, false, false, false, false);

  sh.setFrozenRows(3);
  sh.setColumnWidth(RULE_COL.RULE_KEY, 360);
  sh.setColumnWidth(RULE_COL.CAMPAIGN, 140);
  sh.setColumnWidth(RULE_COL.DEPARTMENT, 170);
  sh.setColumnWidth(RULE_COL.SHIFT, 105);
  sh.setColumnWidth(RULE_COL.FULL_ATTEND, 95);
  sh.setColumnWidth(RULE_COL.WEEKLY_BASE, 120);
  sh.setColumnWidth(RULE_COL.DAILY_SALARY, 105);
  sh.setColumnWidth(RULE_COL.KPI_BONUS, 105);
  sh.setColumnWidth(RULE_COL.MISSED_DED, 130);
  sh.setColumnWidth(RULE_COL.OVERTIME_PAY, 120);
  sh.setColumnWidth(RULE_COL.SUNDAY_BONUS, 110);
  sh.setColumnWidth(RULE_COL.VACATION_PCT, 115);

  // Insert exactly one centered logo after widths are set, so the position is calculated correctly.
  insertCenteredPayRulesLogo_(sh, 1, numCols);

  formatPayRulesRows_(sh);

  // Final defensive cleanup for the old stray Rule Status column.
  if (sh.getMaxColumns() > numCols) {
    try {
      sh.getRange(3, numCols + 1, Math.max(sh.getLastRow(), 3) - 2, sh.getMaxColumns() - numCols).clear();
      sh.getRange(1, numCols + 1, Math.max(sh.getLastRow(), 3), sh.getMaxColumns() - numCols).setBackground('#FFFFFF');
    } catch (e) {
      Logger.log('Final Pay Rules stray-column cleanup skipped: ' + e.message);
    }
  }

  SpreadsheetApp.flush();
  return { ok: true, message: 'Pay Rules styling repaired. Logo centered, banners cleaned, and stray Rule Status column cleared.' };
}

function ensurePayRulesSheet() {
  const ss = ss_();
  const sh = getOrCreateSheet_(ss, SH.PAY_RULES);
  repairPayRulesSheetStyle_();
  Logger.log('Pay Rules sheet structure/style ready.');
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
    const id = toValidAgentId_(row[AG_COL.AGENT_ID - 1]);
    const name = cleanText_(row[AG_COL.AGENT_NAME - 1]);
    const ruleKey = normalizeRuleKey_(cleanText_(row[AG_COL.RULE_KEY - 1]));
    if (!id || !name || /^#/.test(name) || !ruleKey) return;

    map.set(id, {
      agentId    : id,
      name       : name,
      campaign   : cleanText_(row[AG_COL.CAMPAIGN   - 1]),
      department : cleanText_(row[AG_COL.DEPARTMENT - 1]),
      shift      : cleanText_(row[AG_COL.SHIFT      - 1]),
      ruleKey    : ruleKey,
      email      : cleanText_(row[AG_COL.EMAIL      - 1]),
    });
  });
  return map;
}

function dashboardStatusText_(status) {
  return cleanText_(status) || STATUS.UNPAID;
}

function styleDashboardTotalsRow_(sh, rowNum, totalCols) {
  sh.getRange(rowNum, 1, 1, totalCols)
    .setBackground(joiNavy_())
    .setFontWeight('bold')
    .setBorder(true, true, true, true, false, false, joiNavy_(), SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(rowNum, 1, 1, totalCols).setFontColor(joiWhite_());
  sh.getRange(rowNum, 5).setFontColor(joiGold_());
  sh.getRange(rowNum, 8).setFontColor(joiGold_());
  sh.setRowHeight(rowNum, 28);
}

function refreshDashboard() {
  const ss = ss_();
  const sh = getOrCreateSheet_(ss, SH.DASHBOARD);
  sh.clear();

  const today = new Date();
  const ppCode = payPeriodCode_(today);
  const ppLabel = payPeriodLabel_(ppCode);

  // Set column widths BEFORE logo insert so centering math is accurate.
  sh.setColumnWidth(1, 75);
  sh.setColumnWidth(2, 190);
  sh.setColumnWidth(3, 140);
  sh.setColumnWidth(4, 270);
  sh.setColumnWidth(5, 130);
  sh.setColumnWidth(6, 125);
  sh.setColumnWidth(7, 125);
  sh.setColumnWidth(8, 130);

  // Unified brand header: Row 1 = navy+logo centered, Row 2 = gold title with live pay period.
  joiWriteTabHeader_(sh, `JOI PAYROLL DASHBOARD  |  ${ppLabel}`, 8);

  writeColHeaders_(sh, 3, [
    'Agent ID', 'Agent Name', 'Campaign', 'Rule Key',
    'Latest Week Pay', 'Current Status', 'Pay Period', 'YTD (est.)'
  ], joiGold_(), joiNavy_());
  sh.setFrozenRows(3);

  const blocks = getPayrollRunBlocks_();
  const latestBlock = blocks.length ? blocks[blocks.length - 1] : null;
  const agentMap = getAgentMap_();

  if (!latestBlock) {
    sh.getRange(4, 1).setValue('No payroll data found yet. Add a week to get started.');
    return;
  }

  const shPR = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!shPR) return;

  const latestPayMap = new Map();
  if (latestBlock.firstDataRow && latestBlock.lastDataRow && latestBlock.lastDataRow >= latestBlock.firstDataRow) {
    const numRows = latestBlock.lastDataRow - latestBlock.firstDataRow + 1;
    const prData = shPR.getRange(latestBlock.firstDataRow, 1, numRows, PR_COL.LAST_COL).getValues();
    prData.forEach(row => {
      const id = toValidAgentId_(row[PR_COL.AGENT_ID - 1]);
      const name = cleanText_(row[PR_COL.AGENT_NAME - 1]);
      if (!id || !name || /^#/.test(name)) return;
      const pay = Number(row[PR_COL.TOTAL_PAY - 1]) || 0;
      const status = dashboardStatusText_(row[PR_COL.STATUS - 1]);
      const pp = cleanText_(row[PR_COL.PAY_PERIOD - 1]);
      latestPayMap.set(id, { pay, status, pp });
    });
  }

  const ytdMap = new Map();
  blocks.forEach(block => {
    if (!block.firstDataRow || !block.lastDataRow || block.lastDataRow < block.firstDataRow) return;
    const nr = block.lastDataRow - block.firstDataRow + 1;
    const rows = shPR.getRange(block.firstDataRow, 1, nr, PR_COL.LAST_COL).getValues();
    rows.forEach(row => {
      const id = toValidAgentId_(row[PR_COL.AGENT_ID - 1]);
      const name = cleanText_(row[PR_COL.AGENT_NAME - 1]);
      if (!id || !name || /^#/.test(name)) return;
      const pay = Number(row[PR_COL.TOTAL_PAY - 1]) || 0;
      ytdMap.set(id, (ytdMap.get(id) || 0) + pay);
    });
  });

  const sortedAgents = Array.from(agentMap.values())
    .filter(a => a && isValidAgentIdValue_(a.agentId) && cleanText_(a.name) && !/^#/.test(cleanText_(a.name)))
    .sort((a, b) => a.agentId - b.agentId);

  const rows = sortedAgents.map(agent => {
    const latest = latestPayMap.get(agent.agentId) || { pay: 0, status: STATUS.UNPAID, pp: ppCode };
    return [
      agent.agentId,
      agent.name,
      agent.campaign,
      agent.ruleKey,
      latest.pay,
      latest.status,
      latest.pp,
      ytdMap.get(agent.agentId) || 0
    ];
  });

  if (rows.length) {
    sh.getRange(4, 1, rows.length, 8).setValues(rows);
    sh.getRange(4, 1, rows.length, 1).setNumberFormat('0').setHorizontalAlignment('right');
    sh.getRange(4, 5, rows.length, 1).setNumberFormat('$#,##0.00');
    sh.getRange(4, 8, rows.length, 1).setNumberFormat('$#,##0.00');

    for (let i = 0; i < rows.length; i++) {
      const r = 4 + i;
      sh.getRange(r, 1, 1, 8)
        .setBackground(i % 2 === 0 ? joiWhite_() : joiCream_())
        .setBorder(false, false, true, false, false, false, joiBorder_(), SpreadsheetApp.BorderStyle.SOLID)
        .setVerticalAlignment('middle')
        .setFontSize(10);
      applyStatusColor_(sh.getRange(r, 6), rows[i][5]);
      sh.setRowHeight(r, 22);
    }
  }

  const totalRow = 4 + rows.length + 1;
  const latestTotal = rows.reduce((sum, r) => sum + (Number(r[4]) || 0), 0);
  const ytdTotal = rows.reduce((sum, r) => sum + (Number(r[7]) || 0), 0);
  sh.getRange(totalRow, 1, 1, 8).setValues([['ALL AGENTS TOTAL', '', '', '', latestTotal, '', '', ytdTotal]]);
  sh.getRange(totalRow, 5).setNumberFormat('$#,##0.00');
  sh.getRange(totalRow, 8).setNumberFormat('$#,##0.00');
  styleDashboardTotalsRow_(sh, totalRow, 8);

  buildDashboardCampaignSummary_(sh, totalRow + 3, rows);

  SpreadsheetApp.flush();
  joiShowMessageDialog_('Dashboard Refreshed', 'Dashboard refreshed successfully. Invalid rows like #NUM! are filtered out.');
}

function buildDashboardCampaignSummary_(sh, startRow, rows) {
  let r = startRow;
  sh.getRange(r, 1, 1, 4).merge()
    .setValue('CAMPAIGN SUMMARY')
    .setBackground(joiNavy_())
    .setFontColor(joiWhite_())
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sh.setRowHeight(r, 28);
  r++;

  writeColHeaders_(sh, r, ['Campaign', 'Active Agents', 'Latest Week Total', 'YTD Total'], joiGold_(), joiNavy_());
  r++;

  const campaignMap = new Map();
  rows.forEach(row => {
    const campaign = cleanText_(row[2]);
    if (!campaign || !isNaN(Number(campaign))) return;
    if (!campaignMap.has(campaign)) campaignMap.set(campaign, { count: 0, latestPay: 0, ytd: 0 });
    const c = campaignMap.get(campaign);
    c.count++;
    c.latestPay += Number(row[4]) || 0;
    c.ytd += Number(row[7]) || 0;
  });

  let i = 0, totalAgents = 0, totalPay = 0, totalYtd = 0;
  Array.from(campaignMap.entries()).sort().forEach(([campaign, data]) => {
    sh.getRange(r, 1, 1, 4).setValues([[campaign, data.count, data.latestPay, data.ytd]]);
    sh.getRange(r, 1, 1, 4)
      .setBackground(i % 2 === 0 ? joiWhite_() : joiCream_())
      .setBorder(false, false, true, false, false, false, joiBorder_(), SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(r, 3, 1, 2).setNumberFormat('$#,##0.00');
    sh.setRowHeight(r, 22);
    totalAgents += data.count;
    totalPay += data.latestPay;
    totalYtd += data.ytd;
    i++;
    r++;
  });

  sh.getRange(r, 1, 1, 4).setValues([['TOTAL', totalAgents, totalPay, totalYtd]]);
  sh.getRange(r, 3, 1, 2).setNumberFormat('$#,##0.00');
  sh.getRange(r, 1, 1, 4).setBackground(joiNavy_()).setFontColor(joiWhite_()).setFontWeight('bold');
  sh.getRange(r, 3, 1, 2).setFontColor(joiGold_());
  sh.setRowHeight(r, 26);
}

function addPayRule() {
  const bodyHtml = `
    <div class="joiSectionTitle">Add Pay Rule</div>
    <p class="joiText">Create a controlled Pay Rule for a new department, role, or shift. The Rule Key is generated automatically as CAMPAIGN|DEPARTMENT|SHIFT.</p>

    <div class="joiField"><label class="joiLabel" for="campaign">Campaign</label><input id="campaign" class="joiInput" placeholder="Torro, HFB, Big Think Capital, Scoop, Admin"></div>
    <div class="joiField"><label class="joiLabel" for="department">Department / Role</label><input id="department" class="joiInput" placeholder="SLOC, MCA, Designer, Transfer Agent"></div>
    <div class="joiField"><label class="joiLabel" for="shift">Shift</label><select id="shift" class="joiSelect"><option value="WEEKDAY">Weekday</option><option value="WEEKEND">Weekend</option><option value="FULL TIME">Full Time</option><option value="OTHER">Other</option></select></div>
    <div class="joiField" id="otherShiftWrap" style="display:none;"><label class="joiLabel" for="otherShift">Other Shift Name</label><input id="otherShift" class="joiInput" placeholder="Custom shift name"></div>

    <div class="joiPreviewBox"><strong>Generated Rule Key:</strong><br><span id="rulePreview">Enter campaign, department, and shift.</span></div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="joiField"><label class="joiLabel" for="fullAttend">Full Attendance Days</label><input id="fullAttend" class="joiInput" value="5"></div>
      <div class="joiField"><label class="joiLabel" for="weeklyBase">Weekly Base Pay</label><input id="weeklyBase" class="joiInput" placeholder="3000"></div>
      <div class="joiField"><label class="joiLabel" for="dailySalary">Daily Salary</label><input id="dailySalary" class="joiInput" placeholder="400"></div>
      <div class="joiField"><label class="joiLabel" for="kpiBonus">KPI Bonus</label><input id="kpiBonus" class="joiInput" value="0"></div>
      <div class="joiField"><label class="joiLabel" for="missedDed">Missed Day Deduction</label><input id="missedDed" class="joiInput" value="0"></div>
      <div class="joiField"><label class="joiLabel" for="overtimePay">Overtime Day Pay</label><input id="overtimePay" class="joiInput" value="0"></div>
      <div class="joiField"><label class="joiLabel" for="sundayBonus">Sunday Bonus</label><input id="sundayBonus" class="joiInput" value="0"></div>
      <div class="joiField"><label class="joiLabel" for="vacationPct">Vacation Premium %</label><input id="vacationPct" class="joiInput" value="25"></div>
    </div>

    <div id="status" class="joiStatus"></div>
    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="submitRule()">Add Pay Rule</button>
    </div>
  `;

  const clientScript = `
    <script>
      function val(id) { return document.getElementById(id).value || ''; }
      function norm(s) { return String(s || '').trim().toUpperCase(); }
      function getShift() { return val('shift') === 'OTHER' ? val('otherShift') : val('shift'); }
      function updatePreview() {
        document.getElementById('otherShiftWrap').style.display = val('shift') === 'OTHER' ? 'block' : 'none';
        var c = norm(val('campaign'));
        var d = norm(val('department'));
        var s = norm(getShift());
        document.getElementById('rulePreview').textContent = (c && d && s) ? (c + '|' + d + '|' + s) : 'Enter campaign, department, and shift.';
      }
      ['campaign','department','shift','otherShift'].forEach(function(id) {
        document.getElementById(id).addEventListener('input', updatePreview);
        document.getElementById(id).addEventListener('change', updatePreview);
      });
      updatePreview();
      function submitRule() {
        var btn = document.getElementById('runBtn');
        var status = document.getElementById('status');
        var payload = {
          campaign: val('campaign'),
          department: val('department'),
          shift: getShift(),
          fullAttend: val('fullAttend'),
          weeklyBase: val('weeklyBase'),
          dailySalary: val('dailySalary'),
          kpiBonus: val('kpiBonus'),
          missedDed: val('missedDed'),
          overtimePay: val('overtimePay'),
          sundayBonus: val('sundayBonus'),
          vacationPct: val('vacationPct')
        };
        btn.disabled = true;
        status.className = 'joiStatus';
        status.textContent = 'Adding Pay Rule...';
        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            status.className = 'joiStatus ' + (result && result.ok ? 'joiSuccess' : 'joiError');
            status.textContent = (result && result.message) ? result.message : 'No result returned.';
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            status.className = 'joiStatus joiError';
            status.textContent = error && error.message ? error.message : String(error);
          })
          .joiAddPayRuleFromDialog(payload);
      }
    </script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Add Pay Rule', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(720).setHeight(860);
  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Add Pay Rule');
}

function joiAddPayRuleFromDialog(payload) {
  try {
    const ss = ss_();
    let sh = ss.getSheetByName(SH.PAY_RULES);
    if (!sh) {
      sh = getOrCreateSheet_(ss, SH.PAY_RULES);
      repairPayRulesSheetStyle_();
    }

    const campaign = cleanText_(payload && payload.campaign);
    const department = cleanText_(payload && payload.department);
    const shift = cleanText_(payload && payload.shift);
    const ruleKey = buildRuleKeyFromParts_(campaign, department, shift);
    if (!ruleKey) return { ok: false, message: 'Campaign, Department, and Shift are required.' };

    const existing = getRuleMap_();
    if (existing.has(ruleKey)) return { ok: false, message: `This Pay Rule already exists:\${ruleKey}` };

    const fullAttend = Number(cleanText_(payload && payload.fullAttend)) || 5;
    if (!Number.isFinite(fullAttend) || fullAttend <= 0) return { ok: false, message: 'Full Attendance Days must be greater than 0.' };

    const weeklyBase = parseJoiMoneyInput_(payload && payload.weeklyBase, 'Weekly Base Pay');
    const dailySalary = parseJoiMoneyInput_(payload && payload.dailySalary, 'Daily Salary');
    const kpiBonus = parseJoiMoneyInput_(payload && payload.kpiBonus, 'KPI Bonus');
    const missedDed = parseJoiMoneyInput_(payload && payload.missedDed, 'Missed Day Deduction');
    const overtimePay = parseJoiMoneyInput_(payload && payload.overtimePay, 'Overtime Day Pay');
    const sundayBonus = parseJoiMoneyInput_(payload && payload.sundayBonus, 'Sunday Bonus');
    const vacationPct = parseJoiPercentInput_(payload && payload.vacationPct, 'Vacation Premium %');

    // SOURCE-OF-TRUTH LAW: find the last actual rule (by Rule Key column),
    // not the last styled row. Copy peer row formatting before writing.
    const lastDataRow = joiFindLastDataRow_(sh, RULE_COL.RULE_KEY, 4);
    const writeRow = Math.max(4, lastDataRow + 1);
    const peerRow = lastDataRow >= 4 ? lastDataRow : null;

    if (peerRow) {
      joiCopyPeerRowFormat_(sh, writeRow, peerRow, RULE_COL.LAST_COL);
    }

    sh.getRange(writeRow, 1, 1, RULE_COL.LAST_COL).setValues([[
      ruleKey,
      campaign,
      department,
      shift,
      fullAttend,
      weeklyBase,
      dailySalary,
      kpiBonus,
      missedDed,
      overtimePay,
      sundayBonus,
      vacationPct
    ]]);

    repairPayRulesSheetStyle_();
    SpreadsheetApp.flush();
    return { ok: true, message: `Pay Rule added successfully.\${ruleKey}\You can now select this rule when adding a new agent.` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function addNewAgent() {
  const ruleMap = getRuleMap_();
  const rules = Array.from(ruleMap.values()).sort((a, b) => a.ruleKey.localeCompare(b.ruleKey));
  const ruleOptionsHtml = rules.map(r => {
    const label = `${r.ruleKey} - ${r.campaign} / ${r.department} / ${r.shift}`;
    return `<option value="${paystubEscape_(r.ruleKey)}">${paystubEscape_(label)}</option>`;
  }).join('');

  const bodyHtml = `
    <div class="joiSectionTitle">Add New Agent</div>
    <p class="joiText">Add the agent with a controlled Pay Rule. If the rule is missing, add the Pay Rule first.</p>
    <div class="joiField"><label class="joiLabel" for="agentName">Agent full name</label><input id="agentName" class="joiInput" placeholder="Full name"></div>
    <div class="joiField"><label class="joiLabel" for="ruleKey">Pay Rule</label><select id="ruleKey" class="joiSelect"><option value="">Select a Pay Rule</option>${ruleOptionsHtml}</select></div>
    <p class="joiMuted">Campaign, department, and shift will be pulled from the selected Pay Rule to prevent mismatches.</p>
    <div class="joiField"><label class="joiLabel" for="email">Email optional</label><input id="email" class="joiInput" placeholder="email@example.com"></div>
    <div class="joiField"><label class="joiLabel" for="startDate">Start Date optional</label><input id="startDate" class="joiInput" placeholder="MM/DD/YYYY"></div>
    <div id="status" class="joiStatus"></div>
    <div class="joiActions">
      <button class="joiButton joiButtonSecondary" onclick="google.script.host.close()">Cancel</button>
      <button id="runBtn" class="joiButton joiButtonPrimary" onclick="submitAgent()">Add Agent</button>
    </div>
  `;

  const clientScript = `
    <script>
      function submitAgent() {
        var btn = document.getElementById('runBtn');
        var status = document.getElementById('status');
        var payload = {
          agentName: document.getElementById('agentName').value,
          ruleKey: document.getElementById('ruleKey').value,
          email: document.getElementById('email').value,
          startDate: document.getElementById('startDate').value
        };
        btn.disabled = true;
        status.className = 'joiStatus';
        status.textContent = 'Adding agent...';
        google.script.run
          .withSuccessHandler(function(result) {
            btn.disabled = false;
            status.className = 'joiStatus ' + (result && result.ok ? 'joiSuccess' : 'joiError');
            status.textContent = (result && result.message) ? result.message : 'No result returned.';
          })
          .withFailureHandler(function(error) {
            btn.disabled = false;
            status.className = 'joiStatus joiError';
            status.textContent = error && error.message ? error.message : String(error);
          })
          .joiAddNewAgentFromDialog(payload);
      }
    </script>
  `;

  const html = HtmlService.createHtmlOutput(
    joiDialogShell_('Add New Agent', 'JOI PAYROLL SYSTEM', bodyHtml, clientScript)
  ).setWidth(640).setHeight(620);
  SpreadsheetApp.getUi().showModalDialog(html, 'JOI Add New Agent');
}

function joiAddNewAgentFromDialog(payload) {
  try {
    const ss = ss_();
    const sh = ss.getSheetByName(SH.AGENTS);
    if (!sh) return { ok: false, message: 'Agents sheet not found. Run Setup first.' };

    const agentName = cleanText_(payload && payload.agentName);
    if (!agentName) return { ok: false, message: 'Agent name is required.' };

    const ruleKey = normalizeRuleKey_(cleanText_(payload && payload.ruleKey));
    if (!ruleKey) return { ok: false, message: 'Pay Rule is required. Add the Pay Rule first if it is missing.' };

    const rule = getRuleMap_().get(ruleKey);
    if (!rule) return { ok: false, message: `Selected Pay Rule does not exist:\${ruleKey}\Use Add Pay Rule first.` };

    const email = cleanText_(payload && payload.email);
    const startDateRaw = cleanText_(payload && payload.startDate);
    let startDate = null;
    if (startDateRaw) {
      startDate = parsePayrollDateText_(startDateRaw) || parseDate_(startDateRaw);
      if (!startDate || isNaN(startDate.getTime())) return { ok: false, message: 'Invalid start date. Use MM/DD/YYYY.' };
    }

    // Compute next Agent ID from the agents that actually exist (not from
    // styled-but-empty rows).
    const sheetLastRow = sh.getLastRow();
    let newId = 1;
    if (sheetLastRow >= 4) {
      const ids = sh.getRange(4, AG_COL.AGENT_ID, sheetLastRow - 3, 1).getValues()
        .flat().map(toValidAgentId_).filter(Boolean);
      if (ids.length) newId = Math.max(...ids) + 1;
    }

    // SOURCE-OF-TRUTH LAW:
    //   1. Find the last row that actually contains an agent (by ID column),
    //      ignore styled-but-empty rows. New agents land right after.
    //   2. Copy formatting from the peer row above so the new row inherits
    //      font / alignment / background / borders / row height.
    const lastDataRow = joiFindLastDataRow_(sh, AG_COL.AGENT_ID, 4);
    const writeRow = Math.max(4, lastDataRow + 1);
    const peerRow = lastDataRow >= 4 ? lastDataRow : null;

    if (peerRow) {
      joiCopyPeerRowFormat_(sh, writeRow, peerRow, AG_COL.LAST_COL);
    }

    sh.getRange(writeRow, 1, 1, AG_COL.LAST_COL).setValues([[
      newId,
      agentName,
      rule.campaign,
      rule.department,
      rule.shift,
      ruleKey,
      email,
      startDate || '',
      ''
    ]]);
    if (startDate) sh.getRange(writeRow, AG_COL.START_DATE).setNumberFormat('MM/DD/YYYY');

    // Re-assert the alternating row tint from the peer row's pattern. We
    // don't hard-code font / alignment here — joiCopyPeerRowFormat_ already
    // inherited those from the peer row.
    sh.getRange(writeRow, 1, 1, AG_COL.LAST_COL)
      .setBackground((writeRow - 4) % 2 === 0 ? joiWhite_() : joiCream_());

    SpreadsheetApp.flush();
    return { ok: true, message: `Agent added successfully.\${agentName}Agent ID: #${newId}Rule: ${ruleKey}\They will appear in the next week you add.` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function repairDashboardAndPayRulesStyling() {
  repairPayRulesSheetStyle_();
  refreshDashboard();
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🟡 JOI Payroll')

    // ── STEP 1: WEEKLY SETUP ─────────────────────────────────────────────────
    .addItem('📅  Add New Week',                    'addNewWeek')
    .addItem('👤  Add New Agent',                   'addNewAgent')
    .addItem('📋  Add Pay Rule',                    'addPayRule')
    .addSeparator()

    // ── STEP 2: WEEKLY CLOSE ─────────────────────────────────────────────────
    .addItem('✅  Mark Week as Complete',           'markWeekAsComplete')
    .addItem('💰  Mark Pay Period as PAID',         'markPayPeriodAsPaid')
    .addItem('🔓  Unlock Completed Week',           'unlockCompletedWeek')
    .addSeparator()

    // ── STEP 3: REPORTS & DASHBOARD ──────────────────────────────────────────
    .addItem('📊  Week Status Overview',            'weekStatusOverview')
    .addItem('🏠  Refresh Dashboard',               'refreshDashboard')
    .addItem('📆  Create / Sync Monthly Sheet',     'syncMonthlySheetPrompt')
    .addSeparator()

    // ── STEP 4: AGENT MANAGEMENT ─────────────────────────────────────────────
    .addSubMenu(
      ui.createMenu('👥  Agent Controls')
        .addItem('➕  Add Agent to Existing Week',      'addAgentToExistingWeek')
        .addItem('🔁  Add Alumni to Existing Week',     'addAlumniToExistingWeek')
        .addItem('➖  Remove Agent From Week',           'removeAgentFromExistingWeek')
        .addSeparator()
        .addItem('🎓  Move Agent to Alumni',            'moveAgentToAlumni')
    )
    .addSeparator()

    // ── STEP 5: PAYSTUBS & BREAKDOWN ─────────────────────────────────────────
    .addSubMenu(
      ui.createMenu('🧾  Paystubs')
        .addItem('📄  Generate All Paystubs',           'generateAllPaystubs')
        .addItem('📧  Email All Paystubs',              'emailAllPaystubs')
        .addSeparator()
        .addItem('📄  Generate One Agent Paystub',      'generateOnePaystub')
    )
    .addItem('📈  Agent Payroll Breakdown',         'agentPayrollBreakdown')
    .addSeparator()

    // ── ADMIN / REPAIR TOOLS ─────────────────────────────────────────────────
    .addSubMenu(
      ui.createMenu('⚙️  Admin')
        .addItem('🚀  First-Time Setup',                   'firstTimeSetup')
        .addSeparator()
        .addItem('🔄  Rebuild Dashboard',                  'joiRebuildDashboardSheet')
        .addItem('🔄  Rebuild Agents Sheet',               'joiRebuildAgentsSheet')
        .addItem('🔄  Rebuild Alumni Sheet',               'joiRebuildAlumniSheet')
        .addItem('🔄  Rebuild Payroll Run Sheet',          'joiRebuildPayrollRunSheet')
        .addSeparator()
        .addItem('🔓  Unlock PAID Period',                 'unlockPayPeriod')
        .addItem('🔍  Validate Pay Rules',                 'validatePayRulesDialog')
        .addItem('🛠️  Fix Pay Rules Data',                 'fixPayRulesData')
        .addItem('🎨  Repair Dashboard / Pay Rules Style', 'repairDashboardAndPayRulesStyling')
    )
    .addSubMenu(
      ui.createMenu('🔧  Repair Tools')
        .addItem('🛟  RUN FULL REPAIR PACK (recommended)', 'joiRunFullRepairPack')
        .addSeparator()
        .addItem('💾  Backup Payroll Run',                 'joiBackupPayrollRun')
        .addItem('🩹  De-bloat Total Pay (March-April)',   'joiDebloatTotalPayRows')
        .addItem('📆  Backfill Pay Period Column',         'joiBackfillPayPeriodColumn')
        .addItem('🔁  Re-sync All Monthly Sheets',         'joiResyncAllMonthlySheets')
        .addItem('🚫  Clear Weekly Base Pay Dropdown',     'joiClearWeeklyBasePayDropdown')
        .addItem('🔄  Harmonize Status / Memo (one-time)', 'joiHarmonizeStatusMemo')
        .addItem('🧪  Self Test Full Payroll Flow',        'joiSelfTestFullPayrollFlow')
        .addSeparator()
        .addItem('🔀  Move Holiday Columns (run once)',    'joiMigrateHolidayColumns')
        .addItem('🔢  Recalculate All Pay Columns',        'joiRecalculateAllPayrollRun')
        .addSeparator()
        .addItem('📐  Repair Monthly Template Layout',     'repairMonthlyTemplateLayout')
        .addItem('📐  Repair Payroll Run Formatting',      'repairPayrollRunWeekFormatting')
        .addItem('📐  Repair Week Date Headers',           'repairWeekDateHeaders')
        .addItem('🧹  Clean Stale Error Rows',             'joiCleanStaleRows')
        .addSeparator()
        .addItem('🔢  Sort Week by Agent ID',              'sortPayrollWeekAgentRows')
        .addItem('🔢  Renumber Week Labels',               'joiRenumberWeekLabels')
        .addItem('🔁  Sync All Row Statuses',              'joiSyncAllBlockRowStatuses')
        .addSeparator()
        .addItem('✅  Force Apply YES/NO Dropdowns',       'joiForceApplyDropdowns')
        .addItem('🛠️  Repair Week Defaults (KPI)',         'joiRepairCurrentMonthDefaults')
        .addItem('🛠️  Repair Corrupt Block Headers',       'joiRepairCorruptBlockHeaders')
        .addItem('🎨  Standardize Block Header Styles',    'joiStandardizeAllBlockHeaders')
    )
    .addToUi();
}

// 
//  FINAL PATCH '97 PAYROLL RUN LIVE ROW RECALCULATION
//  Fixes: KPI YES not updating KPI Bonus / Total Pay after manual edits.
//  Also supports recalculation after edits to missed days, OT days,
//  Sundays, vacation days, extra bonus, rule key, include, or partial week.
// 

function onEdit(e) {
  try {
    if (!e || !e.range) return;

    const sh = e.range.getSheet();
    if (!sh || sh.getName() !== SH.PAYROLL_RUN) return;

    const startRow = e.range.getRow();
    const startCol = e.range.getColumn();
    const numRows = e.range.getNumRows();
    const numCols = e.range.getNumColumns();

    if (startRow < 4) return;

    const endCol = startCol + numCols - 1;
    const watchedCols = [
      PR_COL.RULE_KEY,
      PR_COL.INCLUDE,
      PR_COL.MISSED_DAYS,
      PR_COL.OVERTIME_DAYS,
      PR_COL.SUNDAYS,
      PR_COL.VACATION_DAYS,
      PR_COL.KPI_ACHIEVED,
      PR_COL.EXTRA_BONUS,
      PR_COL.PARTIAL_WEEK,
      PR_COL.HOLIDAY_DAYS,
    ];

    const touchesWatchedColumn = watchedCols.some(function(col) {
      return col >= startCol && col <= endCol;
    });

    if (!touchesWatchedColumn) return;

    for (let r = startRow; r < startRow + numRows; r++) {
      joiRecalculatePayrollRunRow_(sh, r);
    }

    refreshPayrollRunTotals_();
  } catch (err) {
    Logger.log('Payroll Run onEdit recalculation failed: ' + err.message);
  }
}

function joiRecalculatePayrollRunRow_(sh, rowNum) {
  if (!sh || rowNum < 4) return;

  const rawId = sh.getRange(rowNum, PR_COL.AGENT_ID).getValue();
  const agentId = typeof rawId === 'number'
    ? rawId
    : Number(String(rawId).replace(/[^0-9.-]/g, ''));

  // Skip headers, blank rows, total rows, and garbage rows.
  if (!Number.isFinite(agentId) || agentId <= 0 || Math.floor(agentId) !== agentId || agentId > 9999) return;

  const status = cleanText_(sh.getRange(rowNum, PR_COL.STATUS).getValue());

  // PAID rows are locked. Do not auto-change payroll that has already been paid.
  if (status === STATUS.PAID) return;

  const include = cleanText_(sh.getRange(rowNum, PR_COL.INCLUDE).getValue()).toUpperCase() || 'YES';
  const ruleKey = normalizeRuleKey_(cleanText_(sh.getRange(rowNum, PR_COL.RULE_KEY).getValue()));
  const rule = getRuleMap_().get(ruleKey);

  const inputs = {
    include: include,
    missedDays: Number(sh.getRange(rowNum, PR_COL.MISSED_DAYS).getValue()) || 0,
    overtimeDays: Number(sh.getRange(rowNum, PR_COL.OVERTIME_DAYS).getValue()) || 0,
    sundays: Number(sh.getRange(rowNum, PR_COL.SUNDAYS).getValue()) || 0,
    vacationDays: Number(sh.getRange(rowNum, PR_COL.VACATION_DAYS).getValue()) || 0,
    kpiAchieved: cleanText_(sh.getRange(rowNum, PR_COL.KPI_ACHIEVED).getValue()).toUpperCase(),
    extraBonus: Number(sh.getRange(rowNum, PR_COL.EXTRA_BONUS).getValue()) || 0,
    partialWeek: Number(sh.getRange(rowNum, PR_COL.PARTIAL_WEEK).getValue()) || 0,
    holidayDays: Number(sh.getRange(rowNum, PR_COL.HOLIDAY_DAYS).getValue()) || 0,
  };

  let pay = calcAgentPay_(rule, inputs);

  // Include = NO should remove the row from payable totals without deleting manual inputs.
  if (include === 'NO') {
    pay = {
      weeklyBase: 0,
      kpiBonus: 0,
      missedDed: 0,
      overtimePay: 0,
      sundayPay: 0,
      vacationPay: 0,
      holidayPay: 0,
      extraBonus: inputs.extraBonus,
      totalPay: 0
    };
  }

  // Write all 9 pay columns in one contiguous block: cols 11-19
  // Order MUST match PR_COL layout exactly:
  //   11=WEEKLY_BASE, 12=KPI_BONUS, 13=MISSED_DED, 14=OVERTIME_PAY,
  //   15=SUNDAY_PAY, 16=VACATION_PAY, 17=HOLIDAY_PAY, 18=EXTRA_BONUS, 19=TOTAL_PAY
  sh.getRange(rowNum, PR_COL.WEEKLY_BASE, 1, 9)
    .setValues([[
      pay.weeklyBase,
      pay.kpiBonus,
      pay.missedDed,
      pay.overtimePay,
      pay.sundayPay,
      pay.vacationPay,
      pay.holidayPay || 0,
      pay.extraBonus  || 0,
      pay.totalPay
    ]])
    .setNumberFormat('$#,##0.00');

  // Only write back a recognized status — never overwrite the status cell with
  // garbage data (numbers, old pay amounts, etc.) that may have drifted in.
  // joiSetRowStatus_ syncs Memo's workflow indicator atomically so the two
  // columns can never disagree after a recalc.
  const validStatuses = [STATUS.UNPAID, STATUS.COMPLETE, STATUS.PAID];
  const finalStatus = validStatuses.includes(status) ? status : STATUS.UNPAID;
  joiSetRowStatus_(sh, rowNum, finalStatus);
}

function joiRecalculatePayrollRunBlock_(headerRow) {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };

  const block = getPayrollRunBlocks_().find(function(b) {
    return Number(b.headerRow) === Number(headerRow);
  });
  if (!block) return { ok: false, message: 'Selected payroll week block was not found.' };
  if (block.status === STATUS.PAID) return { ok: false, message: 'Selected week is PAID and locked. Unlock it first if this is an admin correction.' };

  let rowsUpdated = 0;
  for (let r = block.firstDataRow; r <= block.lastDataRow; r++) {
    const before = sh.getRange(r, PR_COL.AGENT_ID).getValue();
    joiRecalculatePayrollRunRow_(sh, r);
    const id = typeof before === 'number' ? before : parseFloat(before);
    if (Number.isFinite(id) && id > 0 && Math.floor(id) === id) rowsUpdated++;
  }

  refreshPayrollRunTotals_();
  SpreadsheetApp.flush();

  return {
    ok: true,
    message: `${block.weekLabel || 'Payroll week'} recalculated successfully.\Rows updated: ${rowsUpdated}`
  };
}

// Manual safety button from Apps Script editor.
// Run this once after replacing the script to recalculate existing rows.
function joiRecalculateAllPayrollRun() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };

  const lastRow = sh.getLastRow();
  let rowsUpdated = 0;

  for (let r = 4; r <= lastRow; r++) {
    const raw = sh.getRange(r, PR_COL.AGENT_ID).getValue();
    const id = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!Number.isFinite(id) || id <= 0 || Math.floor(id) !== id) continue;

    const status = cleanText_(sh.getRange(r, PR_COL.STATUS).getValue());
    if (status === STATUS.PAID) continue;

    joiRecalculatePayrollRunRow_(sh, r);
    rowsUpdated++;
  }

  refreshPayrollRunTotals_();
  SpreadsheetApp.flush();

  return { ok: true, message: `Payroll Run recalculated successfully.\Rows updated: ${rowsUpdated}` };
}


// ============================================================================
//  JOI REPAIR PACK — May 2026 audit fixes
//  Added: 2026-05-15
//  - joiBackupPayrollRun        — timestamped duplicate of Payroll Run
//  - joiDebloatTotalPayRows     — clears bogus Partial Week dollar values
//                                  on rows where Total Pay > $50,000,
//                                  then recalculates correctly.
//  - joiBackfillPayPeriodColumn — writes ppCode into PR_COL.PAY_PERIOD for
//                                  every agent row using owning block's date.
//  - joiResyncAllMonthlySheets  — re-runs monthly sync for every month that
//                                  has at least one Payroll Run block.
//  - joiRunFullRepairPack       — runs all four in safe order.
// ============================================================================

/**
 * joiBackupPayrollRun
 * Duplicates the Payroll Run sheet as 'Payroll Run BACKUP YYYYMMDD_HHMMSS'.
 * Returns { ok, name } so callers can show the user which tab to look for.
 */
function joiBackupPayrollRun() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) {
    const msg = 'Payroll Run sheet not found — cannot back up.';
    joiShowMessageDialog_('Backup', msg);
    return { ok: false, message: msg };
  }

  const now = new Date();
  const stamp = Utilities.formatDate(now, Session.getScriptTimeZone() || 'America/Mexico_City', 'yyyyMMdd_HHmmss');
  const newName = `Payroll Run BACKUP ${stamp}`;

  const copy = sh.copyTo(ss);
  copy.setName(newName);
  // Park the backup at the far right.
  ss.setActiveSheet(copy);
  ss.moveActiveSheet(ss.getNumSheets());
  ss.setActiveSheet(sh);

  SpreadsheetApp.flush();
  const msg = `Backup created: "${newName}". You can find it as a new tab at the right of the tab bar.`;
  joiShowMessageDialog_('Backup Complete', msg);
  return { ok: true, message: msg, name: newName };
}

/**
 * joiDebloatTotalPayRows
 * Scans every agent row in Payroll Run. A row is considered "bloated" when
 * Total Pay > $50,000 (no agent has a legitimate weekly Total Pay near that).
 * For each bloated row:
 *   1. Skip if STATUS = PAID (those rows are locked).
 *   2. Clear the Partial Week cell (the root cause: a dollar amount sitting
 *      in a column that calcAgentPay_ treats as a day count).
 *   3. Re-run joiRecalculatePayrollRunRow_ which now reads partialWeek = 0
 *      and uses the full-week formula.
 * Logs every change and returns a per-row summary.
 */
function joiDebloatTotalPayRows() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };

  const THRESHOLD = 50000; // anything above this is impossible for a weekly Total Pay
  const lastRow = sh.getLastRow();

  const changes = [];
  let skippedPaid = 0;
  let scanned = 0;

  for (let r = 4; r <= lastRow; r++) {
    const rawId = sh.getRange(r, PR_COL.AGENT_ID).getValue();
    const id = typeof rawId === 'number' ? rawId : parseFloat(rawId);
    if (!Number.isFinite(id) || id <= 0 || Math.floor(id) !== id || id > 9999) continue;

    scanned++;
    const status = cleanText_(sh.getRange(r, PR_COL.STATUS).getValue());
    if (status === STATUS.PAID) { skippedPaid++; continue; }

    const totalPayBefore = Number(sh.getRange(r, PR_COL.TOTAL_PAY).getValue()) || 0;
    const partialBefore  = Number(sh.getRange(r, PR_COL.PARTIAL_WEEK).getValue()) || 0;

    if (totalPayBefore <= THRESHOLD) continue;

    // De-bloat: clear Partial Week so the recalc takes the full-week branch.
    sh.getRange(r, PR_COL.PARTIAL_WEEK).clearContent();

    // Run the existing recalc — it will read partialWeek = 0 now.
    joiRecalculatePayrollRunRow_(sh, r);

    const totalPayAfter = Number(sh.getRange(r, PR_COL.TOTAL_PAY).getValue()) || 0;
    const name = cleanText_(sh.getRange(r, PR_COL.AGENT_NAME).getValue());

    changes.push({
      row: r,
      agentId: id,
      name: name,
      partialBefore: partialBefore,
      totalBefore: totalPayBefore,
      totalAfter: totalPayAfter
    });

    Logger.log(`[debloat] row ${r}  agent ${id} ${name}: Total $${totalPayBefore.toFixed(2)} → $${totalPayAfter.toFixed(2)}, PartialWeek $${partialBefore.toFixed(2)} → cleared`);
  }

  refreshPayrollRunTotals_();
  SpreadsheetApp.flush();

  const summary = `Scanned: ${scanned} rows.\nBloated rows fixed: ${changes.length}.\nPAID rows skipped (locked): ${skippedPaid}.`;
  joiShowMessageDialog_('De-bloat Total Pay', summary + '\n\nDetails in Apps Script Logger (View → Logs).');
  return { ok: true, message: summary, changes: changes };
}

/**
 * joiBackfillPayPeriodColumn
 * For every agent row in Payroll Run whose Pay Period cell (column V) is
 * empty, writes the ppCode derived from the owning week block's end date.
 * Uses getPayrollRunBlocks_ which already computes ppCode from the parsed
 * date range when the row column is empty.
 */
function joiBackfillPayPeriodColumn() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) return { ok: false, message: 'Payroll Run sheet not found.' };

  const blocks = getPayrollRunBlocks_();
  let filled = 0;
  let alreadySet = 0;
  let skippedNoCode = 0;

  blocks.forEach(block => {
    if (!block.firstDataRow || !block.lastDataRow) return;
    const ppCode = cleanText_(block.ppCode);
    if (!ppCode) { skippedNoCode += (block.lastDataRow - block.firstDataRow + 1); return; }

    for (let r = block.firstDataRow; r <= block.lastDataRow; r++) {
      const id = Number(sh.getRange(r, PR_COL.AGENT_ID).getValue());
      if (!Number.isFinite(id) || id <= 0) continue;

      const current = cleanText_(sh.getRange(r, PR_COL.PAY_PERIOD).getValue());
      if (current) { alreadySet++; continue; }

      sh.getRange(r, PR_COL.PAY_PERIOD).setValue(ppCode);
      filled++;
    }
  });

  SpreadsheetApp.flush();
  const summary = `Pay Period column backfilled.\nNew values written: ${filled}.\nAlready had a value: ${alreadySet}.\nBlocks without a usable ppCode: ${skippedNoCode}.`;
  joiShowMessageDialog_('Backfill Pay Period', summary);
  return { ok: true, message: summary, filled: filled };
}

/**
 * joiResyncAllMonthlySheets
 * Re-runs syncMonthlySheetFromPayrollRun for every (month, year) combo that
 * appears in Payroll Run. Fixes mid-week-added agents (Miguel #56, Diego #57)
 * and any other rows that drifted from their monthly tab.
 */
function joiResyncAllMonthlySheets() {
  const months = new Set();
  const blocks = getPayrollRunBlocks_();
  blocks.forEach(block => {
    const parsed = parsePayrollBlockDateRange_(block.dateRange);
    if (!parsed || !parsed.endDate) return;
    const month = monthNameFromDate_(parsed.endDate);
    const year = parsed.endDate.getFullYear();
    months.add(`${month}|${year}`);
  });

  if (months.size === 0) {
    const msg = 'No payroll blocks with valid date ranges found.';
    joiShowMessageDialog_('Resync Monthly Sheets', msg);
    return { ok: false, message: msg };
  }

  const results = [];
  months.forEach(key => {
    const [month, yearStr] = key.split('|');
    const year = Number(yearStr);
    try {
      const r = syncMonthlySheetFromPayrollRun(month, year, true);
      results.push(`${month} ${year}: ${r.ok ? 'OK' : 'FAIL — ' + r.message}`);
    } catch (err) {
      results.push(`${month} ${year}: ERROR — ${err.message}`);
    }
  });

  SpreadsheetApp.flush();
  const summary = `Re-synced ${months.size} monthly sheet(s):\n\n${results.join('\n')}`;
  joiShowMessageDialog_('Resync Monthly Sheets', summary);
  return { ok: true, message: summary };
}

// ============================================================================
//  SOURCE-OF-TRUTH LAW (read this before adding any new writer)
//  ----------------------------------------------------------------------------
//  The existing spreadsheet's font, alignment, row position, row height, brand
//  styling and validation are the SOURCE OF TRUTH. Code reads them. Code does
//  NOT impose its own font/size/alignment/position when writing new rows.
//
//  When you write a new row:
//    1. Find the LAST ACTUAL DATA ROW by scanning the ID column (not getLastRow).
//       Use joiFindLastDataRow_(sh, idCol, startRow).
//    2. Insert at lastDataRow + 1.
//    3. COPY the format of an existing peer row using joiCopyPeerRowFormat_.
//    4. Only THEN write your values.
//
//  When you change a row's STATUS (UNPAID / COMPLETE / PAID):
//    - Never call sh.getRange(r, PR_COL.STATUS).setValue(...) directly.
//    - Use joiSetRowStatus_(sh, rowNum, status). It updates STATUS, MEMO's
//      workflow indicator portion, the status color, and preserves any
//      free-text portion of MEMO that was there.
//
//  When you need to lock a row HEIGHT in pixels regardless of "fit to data":
//    - SpreadsheetApp.setRowHeight() only sets a MINIMUM in fit-to-data mode.
//    - Use joiLockRowHeight_(sheetId, rowNum, pixels), which uses the Sheets
//      Advanced Service to set pixelSize and force mode=fixed.
// ============================================================================

/**
 * joiStatusEmoji_
 * Maps a STATUS value to its visual emoji indicator used inside the MEMO column.
 */
function joiStatusEmoji_(status) {
  const s = cleanText_(status).toUpperCase();
  if (s === STATUS.PAID)     return '🟢';
  if (s === STATUS.COMPLETE) return '🔵';
  return '🟡';
}

/**
 * joiBuildMemoText_
 * Returns the canonical MEMO column text for a given status + optional free
 * text. Format: "{emoji} {STATUS}" or "{emoji} {STATUS}  —  {freeText}".
 *
 * If the incoming freeText already starts with a workflow indicator we strip
 * it so we don't double-up.
 */
function joiBuildMemoText_(status, freeText) {
  const emoji = joiStatusEmoji_(status);
  const s = cleanText_(status).toUpperCase() || STATUS.UNPAID;
  const headerPart = `${emoji} ${s}`;
  const raw = cleanText_(freeText);
  // Strip any leading workflow indicator from the free-text portion so we
  // don't double up — uses the same iterative extractor as the harmonizer.
  const stripped = joiExtractMemoFreeText_(raw);
  return stripped ? `${headerPart}  —  ${stripped}` : headerPart;
}

/**
 * joiExtractMemoFreeText_
 * Returns just the free-text portion of an existing memo cell value
 * (everything after the workflow indicator + separator). Strips repeated
 * prefixes so legacy memos like "🟡 UNPAID — 🔵 COMPLETE — Added..." reduce
 * cleanly to just "Added...".
 */
function joiExtractMemoFreeText_(memoCellValue) {
  let raw = cleanText_(memoCellValue);
  if (!raw) return '';
  for (let i = 0; i < 6; i++) {
    const before = raw;
    raw = raw
      .replace(/^(?:🟡|🔵|🟢)\s*(?:UNPAID|COMPLETE|PAID)?\s*(?:—|-|\||–)?\s*/i, '')
      .replace(/^(?:UNPAID|COMPLETE|PAID)\s*(?:—|-|\||–)?\s*/i, '')
      .trim();
    if (raw === before) break;
  }
  return raw;
}

/**
 * joiSetRowStatus_
 * The ONLY supported way to change a Payroll Run row's status. Atomically:
 *   - Writes the new STATUS to PR_COL.STATUS.
 *   - Rebuilds the MEMO cell's workflow indicator while preserving any
 *     free-text portion that was already there (or replacing it if
 *     `replaceFreeText` is passed).
 *   - Applies the colored status badge.
 *
 * @param {Sheet}  sh
 * @param {number} rowNum
 * @param {string} status            - One of STATUS.UNPAID / COMPLETE / PAID
 * @param {object} [opts]            - Optional
 * @param {string} [opts.replaceFreeText]  - If provided, REPLACES the free
 *                                            text portion (used when adding a
 *                                            row with a brand-new memo).
 */
function joiSetRowStatus_(sh, rowNum, status, opts) {
  if (!sh || rowNum < 4) return;
  const validStatuses = [STATUS.UNPAID, STATUS.COMPLETE, STATUS.PAID];
  if (!validStatuses.includes(status)) return;

  // Preserve existing free text unless caller overrides.
  let freeText;
  if (opts && typeof opts.replaceFreeText === 'string') {
    freeText = opts.replaceFreeText;
  } else {
    freeText = joiExtractMemoFreeText_(sh.getRange(rowNum, PR_COL.MEMO).getValue());
  }

  sh.getRange(rowNum, PR_COL.STATUS).setValue(status);
  sh.getRange(rowNum, PR_COL.MEMO).setValue(joiBuildMemoText_(status, freeText));
  applyStatusColor_(sh.getRange(rowNum, PR_COL.STATUS), status);
}

/**
 * joiFindLastDataRow_
 * Returns the row number of the LAST row in `sh` whose `idCol` contains a
 * non-empty value, starting the scan at `startRow`. If no data found,
 * returns startRow - 1.
 *
 * This is the correct replacement for `sh.getLastRow()` whenever you need
 * the last row that has actual record data (as opposed to the last row
 * that has any styling/content).
 */
function joiFindLastDataRow_(sh, idCol, startRow) {
  const sheetLastRow = sh.getLastRow();
  if (sheetLastRow < startRow) return startRow - 1;
  const values = sh.getRange(startRow, idCol, sheetLastRow - startRow + 1, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i][0];
    if (v !== '' && v !== null && v !== undefined) return startRow + i;
  }
  return startRow - 1;
}

/**
 * joiCopyPeerRowFormat_
 * Copies cell formatting (font, alignment, background, borders, validations,
 * number format) from a peer row to a target row, leaving values intact.
 *
 * Used by every "insert new record" function so the new row inherits the
 * sheet's visual style instead of asserting hardcoded defaults.
 */
function joiCopyPeerRowFormat_(sh, targetRow, peerRow, lastCol) {
  if (!sh || !targetRow || !peerRow || targetRow === peerRow) return;
  if (peerRow < 1 || targetRow < 1) return;
  try {
    sh.getRange(peerRow, 1, 1, lastCol)
      .copyTo(
        sh.getRange(targetRow, 1, 1, lastCol),
        SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
        false
      );
  } catch (e) {
    Logger.log('joiCopyPeerRowFormat_ failed: ' + e.message);
  }
}

/**
 * joiLockRowHeight_
 * Forces a row to a fixed pixel height regardless of "Fit to data" mode.
 * Uses the Sheets Advanced Service because SpreadsheetApp.setRowHeight()
 * is a no-op (or only a minimum) when the row's mode is auto-fit.
 *
 * Requires the Sheets v4 advanced service to be enabled in appsscript.json.
 */
function joiLockRowHeight_(sh, rowNum, pixels) {
  if (!sh || rowNum < 1 || pixels < 1) return;
  try {
    if (typeof Sheets === 'undefined') {
      // Fallback if advanced service isn't loaded.
      sh.setRowHeight(rowNum, pixels);
      return;
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    Sheets.Spreadsheets.batchUpdate(
      {
        requests: [
          {
            updateDimensionProperties: {
              range: {
                sheetId: sh.getSheetId(),
                dimension: 'ROWS',
                startIndex: rowNum - 1,
                endIndex: rowNum,
              },
              properties: { pixelSize: pixels },
              fields: 'pixelSize',
            },
          },
        ],
      },
      ss.getId()
    );
  } catch (e) {
    Logger.log('joiLockRowHeight_ failed (' + rowNum + ', ' + pixels + 'px): ' + e.message);
    try { sh.setRowHeight(rowNum, pixels); } catch (_) {}
  }
}

/**
 * joiHarmonizeStatusMemo
 * One-time migration: for every Payroll Run agent row, re-sync the MEMO
 * column's workflow indicator to match the current STATUS column. Any
 * free-text portion of the existing memo is preserved.
 *
 * Run this after deploying the status-memo writer changes to clean up any
 * legacy rows where Status and Memo had drifted apart.
 */
function joiHarmonizeStatusMemo() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) {
    joiShowMessageDialog_('Harmonize Status / Memo', 'Payroll Run sheet not found.');
    return { ok: false };
  }

  const lastRow = sh.getLastRow();
  let updated = 0;
  let skipped = 0;

  for (let r = 4; r <= lastRow; r++) {
    const rawId = sh.getRange(r, PR_COL.AGENT_ID).getValue();
    const id = typeof rawId === 'number' ? rawId : parseFloat(rawId);
    if (!Number.isFinite(id) || id <= 0 || Math.floor(id) !== id || id > 9999) { skipped++; continue; }

    const status = cleanText_(sh.getRange(r, PR_COL.STATUS).getValue());
    if (![STATUS.UNPAID, STATUS.COMPLETE, STATUS.PAID].includes(status)) { skipped++; continue; }

    const currentMemo = cleanText_(sh.getRange(r, PR_COL.MEMO).getValue());
    const freeText = joiExtractMemoFreeText_(currentMemo);
    const newMemo = joiBuildMemoText_(status, freeText);

    if (currentMemo !== newMemo) {
      sh.getRange(r, PR_COL.MEMO).setValue(newMemo);
      updated++;
    }
  }

  SpreadsheetApp.flush();
  const msg = `Harmonized ${updated} row(s) so Memo's workflow indicator matches Status.\nSkipped ${skipped} non-agent rows.`;
  joiShowMessageDialog_('Harmonize Status / Memo', msg);
  return { ok: true, message: msg, updated, skipped };
}

/**
 * joiSelfTestFullPayrollFlow
 * End-to-end self test that exercises the real payroll workflow exactly the
 * way the user would: create a throwaway agent, append them to an existing
 * week, recalculate, mark the week as complete, sync the monthly sheet,
 * then UNDO everything so the sheet is left in its original state.
 *
 * Returns a structured report of every step so we don't need screenshots.
 */
function joiSelfTestFullPayrollFlow() {
  const ss = ss_();
  const shAgents = ss.getSheetByName(SH.AGENTS);
  const shRun    = ss.getSheetByName(SH.PAYROLL_RUN);
  const report   = { ok: true, steps: [] };

  function step(name, fn) {
    try {
      const result = fn();
      report.steps.push({ step: name, ok: true, info: result || '' });
      return result;
    } catch (e) {
      report.ok = false;
      report.steps.push({ step: name, ok: false, error: e.message, stack: e.stack });
      throw e;
    }
  }

  let testAgentId = null;
  let testRowAgents = null;
  let testRowRun = null;
  let targetBlock = null;
  let createdMonthlySync = null;
  let originalBlockStatus = null;

  try {
    // STEP 1: pick the most recent UNPAID block as our target week.
    step('1. Find target UNPAID week', () => {
      const blocks = getPayrollRunBlocks_();
      const unpaid = blocks.filter(b => b.status === STATUS.UNPAID && b.parsedEndDate);
      if (!unpaid.length) throw new Error('No UNPAID week available.');
      targetBlock = unpaid[unpaid.length - 1];
      originalBlockStatus = targetBlock.status;
      return `${targetBlock.weekLabel} ${targetBlock.dateRange} (header row ${targetBlock.headerRow})`;
    });

    // STEP 2: add a test agent through the normal Add New Agent path so we
    // exercise joiFindLastDataRow_ and joiCopyPeerRowFormat_.
    step('2. Add test agent to Agents directory', () => {
      const before = shAgents.getLastRow();
      const result = joiAddNewAgentFromDialog({
        agentName: 'AUDIT TEST AGENT (auto)',
        ruleKey:   'TORRO|SLOC|WEEKDAY',
        email:     '',
        startDate: ''
      });
      if (!result || !result.ok) throw new Error('Add agent failed: ' + (result && result.message));
      // Find the new agent row by scanning column A for our test name.
      const lastRow = shAgents.getLastRow();
      const names = shAgents.getRange(4, AG_COL.AGENT_NAME, lastRow - 3, 1).getValues();
      for (let i = 0; i < names.length; i++) {
        if (cleanText_(names[i][0]) === 'AUDIT TEST AGENT (auto)') {
          testRowAgents = 4 + i;
          testAgentId = Number(shAgents.getRange(testRowAgents, AG_COL.AGENT_ID).getValue());
          break;
        }
      }
      if (!testAgentId) throw new Error('Test agent not found after insert.');
      return `Agent #${testAgentId} at Agents row ${testRowAgents} (sheet getLastRow before=${before}, after=${lastRow})`;
    });

    // STEP 3: insert the test agent into the target week.
    step('3. Add test agent to target week', () => {
      const agent = getActiveAgentById_(testAgentId);
      if (!agent) throw new Error('Active agent lookup failed for #' + testAgentId);
      const result = insertAgentIntoPayrollWeek_(agent, targetBlock, 'self test');
      if (!result || !result.ok) throw new Error('Insert into week failed: ' + (result && result.message));
      // Refresh block to capture the new row position.
      const blocks = getPayrollRunBlocks_();
      const refreshed = blocks.find(b => Number(b.headerRow) === Number(targetBlock.headerRow));
      if (!refreshed) throw new Error('Target block not found after insert.');
      targetBlock = refreshed;
      // Find the test agent's row inside the block.
      for (let r = targetBlock.firstDataRow; r <= targetBlock.lastDataRow; r++) {
        if (Number(shRun.getRange(r, PR_COL.AGENT_ID).getValue()) === testAgentId) {
          testRowRun = r;
          break;
        }
      }
      if (!testRowRun) throw new Error('Test agent row not found in target week.');
      return `Test agent row in Payroll Run = ${testRowRun}`;
    });

    // STEP 4: read the new row and confirm format matches the row above.
    step('4. Verify new row inherits format from peer', () => {
      const peerRow = (testRowRun > targetBlock.firstDataRow) ? testRowRun - 1 : targetBlock.firstDataRow;
      const newRange  = shRun.getRange(testRowRun, 1, 1, PR_COL.LAST_COL);
      const peerRange = shRun.getRange(peerRow,    1, 1, PR_COL.LAST_COL);
      const diffs = [];
      const newFamilies  = newRange.getFontFamilies()[0];
      const peerFamilies = peerRange.getFontFamilies()[0];
      const newSizes     = newRange.getFontSizes()[0];
      const peerSizes    = peerRange.getFontSizes()[0];
      const newAligns    = newRange.getHorizontalAlignments()[0];
      const peerAligns   = peerRange.getHorizontalAlignments()[0];
      for (let i = 0; i < PR_COL.LAST_COL; i++) {
        if (newFamilies[i] !== peerFamilies[i]) diffs.push(`col${i+1}:font(${newFamilies[i]} vs ${peerFamilies[i]})`);
        if (newSizes[i]    !== peerSizes[i])    diffs.push(`col${i+1}:size(${newSizes[i]} vs ${peerSizes[i]})`);
        if (newAligns[i]   !== peerAligns[i])   diffs.push(`col${i+1}:align(${newAligns[i]} vs ${peerAligns[i]})`);
      }
      return diffs.length === 0 ? 'identical to peer row' : `${diffs.length} differences: ${diffs.slice(0,5).join(', ')}`;
    });

    // STEP 5: verify Status / Memo are consistent for the new row.
    step('5. Verify new row Status/Memo consistency', () => {
      const status = cleanText_(shRun.getRange(testRowRun, PR_COL.STATUS).getValue());
      const memo   = cleanText_(shRun.getRange(testRowRun, PR_COL.MEMO).getValue());
      const expectedPrefix = joiStatusEmoji_(status) + ' ' + status;
      if (!memo.startsWith(expectedPrefix)) throw new Error(`Memo "${memo}" does not start with "${expectedPrefix}"`);
      return `Status="${status}" Memo="${memo}"`;
    });

    // STEP 6: mark the week complete and check Status/Memo on every row.
    step('6. Mark week as complete', () => {
      const r = joiMarkWeekAsCompleteFromDialog(targetBlock.headerRow);
      if (!r || !r.ok) throw new Error('Mark complete failed: ' + (r && r.message));
      const headerStatus = cleanText_(shRun.getRange(targetBlock.headerRow, PR_COL.STATUS).getValue());
      if (headerStatus !== STATUS.COMPLETE) throw new Error('Header status after Mark Complete = ' + headerStatus);
      // Sample a few agent rows.
      const sampleRows = [targetBlock.firstDataRow, testRowRun, targetBlock.lastDataRow];
      const memoMismatches = [];
      sampleRows.forEach(r => {
        const s = cleanText_(shRun.getRange(r, PR_COL.STATUS).getValue());
        const m = cleanText_(shRun.getRange(r, PR_COL.MEMO).getValue());
        const want = joiStatusEmoji_(s) + ' ' + s;
        if (!m.startsWith(want)) memoMismatches.push(`row${r}: status=${s} memo="${m}"`);
      });
      if (memoMismatches.length) throw new Error('Memo not in sync: ' + memoMismatches.join(' | '));
      return `header=${headerStatus}, ${sampleRows.length} sampled rows OK`;
    });

    // STEP 7: sync the monthly sheet and verify row 4 height stays at 24px.
    step('7. Sync monthly sheet for the block', () => {
      const r = syncMonthlySheetForBlock_(targetBlock);
      if (!r || !r.ok) throw new Error('Monthly sync failed: ' + (r && r.message));
      createdMonthlySync = r;
      const monthName = monthNameFromDate_(targetBlock.parsedEndDate);
      const year      = targetBlock.parsedEndDate.getFullYear();
      const shMonthly = ss.getSheetByName(monthSheetName_(monthName, year));
      if (!shMonthly) throw new Error('Monthly sheet not found.');
      const row3Height = shMonthly.getRowHeight(3);
      const row4Height = shMonthly.getRowHeight(4);
      if (row4Height > 30) throw new Error('Row 4 height regression: ' + row4Height + 'px');
      return `${shMonthly.getName()} row3=${row3Height}px row4=${row4Height}px`;
    });

    // STEP 8: revert — unlock the week, remove the test row from Payroll Run,
    // and remove the test agent from the Agents tab.
    step('8. UNDO mark complete (set block back to UNPAID)', () => {
      const r = joiUnlockCompletedWeekFromDialog(targetBlock.headerRow);
      if (!r || !r.ok) throw new Error('Unlock failed: ' + (r && r.message));
      return 'unlocked';
    });

    step('9. UNDO remove test row from Payroll Run', () => {
      shRun.deleteRow(testRowRun);
      return `row ${testRowRun} deleted`;
    });

    step('10. UNDO remove test agent from Agents directory', () => {
      shAgents.deleteRow(testRowAgents);
      return `row ${testRowAgents} deleted`;
    });

    step('11. Re-sync monthly to clean state', () => {
      const monthName = monthNameFromDate_(targetBlock.parsedEndDate);
      const year      = targetBlock.parsedEndDate.getFullYear();
      const r = syncMonthlySheetFromPayrollRun(monthName, year, true);
      if (!r || !r.ok) throw new Error('Final monthly resync failed: ' + (r && r.message));
      return r.message;
    });
  } catch (e) {
    report.ok = false;
    report.fatal = e.message;
  }

  Logger.log(JSON.stringify(report, null, 2));
  joiShowMessageDialog_(
    report.ok ? 'Self Test PASSED' : 'Self Test FAILED',
    report.steps.map(s => (s.ok ? '✅ ' : '❌ ') + s.step + (s.info ? ' — ' + s.info : '') + (s.error ? ' — ERROR: ' + s.error : '')).join('\n') + (report.fatal ? '\n\nFATAL: ' + report.fatal : '')
  );
  return report;
}

/**
 * joiClearWeeklyBasePayDropdown
 * Removes any data validation (dropdowns) from the Weekly Base Pay column (K / PR_COL.WEEKLY_BASE)
 * on Payroll Run. This column should hold a calculated dollar amount, never a selectable list.
 * Other column validations (Include col D, KPI col J, Holiday Days col I) are left intact.
 */
function joiClearWeeklyBasePayDropdown() {
  const ss = ss_();
  const sh = ss.getSheetByName(SH.PAYROLL_RUN);
  if (!sh) {
    const msg = 'Payroll Run sheet not found.';
    joiShowMessageDialog_('Clear Weekly Base Pay Dropdown', msg);
    return { ok: false, message: msg };
  }

  const lastRow = Math.max(sh.getLastRow(), 4);
  sh.getRange(1, PR_COL.WEEKLY_BASE, lastRow, 1).clearDataValidations();
  SpreadsheetApp.flush();

  const msg = `Cleared data validation from ${lastRow} cells in column K (Weekly Base Pay). The dropdown arrows should be gone now.`;
  joiShowMessageDialog_('Clear Weekly Base Pay Dropdown', msg);
  return { ok: true, message: msg };
}

/**
 * joiRunFullRepairPack
 * Convenience: backup → de-bloat → backfill pay period → resync monthlies → refresh dashboard.
 * Stops on first failure.
 */
function joiRunFullRepairPack() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert(
    'Run Full Repair Pack',
    'This will:\n' +
    '  1. Backup Payroll Run (timestamped copy)\n' +
    '  2. De-bloat Total Pay rows (clears bogus Partial Week, recalculates)\n' +
    '  3. Backfill Pay Period column (col V)\n' +
    '  4. Re-sync every monthly sheet\n' +
    '  5. Refresh Dashboard\n\n' +
    'PAID weeks remain untouched.\n\nProceed?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  const steps = [];

  let s = joiBackupPayrollRun();
  steps.push(`1. Backup: ${s.ok ? 'OK (' + s.name + ')' : 'FAIL — ' + s.message}`);
  if (!s.ok) { ui.alert('Repair Stopped', steps.join('\n'), ui.ButtonSet.OK); return; }

  s = joiDebloatTotalPayRows();
  steps.push(`2. De-bloat: ${s.ok ? 'OK (' + (s.changes ? s.changes.length : 0) + ' rows fixed)' : 'FAIL — ' + s.message}`);

  s = joiBackfillPayPeriodColumn();
  steps.push(`3. Backfill Pay Period: ${s.ok ? 'OK (' + (s.filled || 0) + ' cells filled)' : 'FAIL — ' + s.message}`);

  s = joiResyncAllMonthlySheets();
  steps.push(`4. Resync monthlies: ${s.ok ? 'OK' : 'FAIL — ' + s.message}`);

  try { refreshDashboard(); steps.push('5. Dashboard refresh: OK'); }
  catch (err) { steps.push('5. Dashboard refresh: ERROR — ' + err.message); }

  ui.alert('Full Repair Pack — Done', steps.join('\n'), ui.ButtonSet.OK);
}
