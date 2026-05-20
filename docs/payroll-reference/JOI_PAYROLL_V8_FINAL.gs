/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║         JOI PAYROLL v8.1 — DEFINITIVE BUILD             ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * What was fixed vs every prior version:
 *
 *  CRASH FIX   — Removed setFrozenColumns(6).  The full-width banner
 *                merge in rows 1 & 2 always crossed the freeze boundary
 *                and crashed migration.  Frozen rows (headers) are kept.
 *
 *  SPEED FIX   — Formula application was calling setFormula() once per
 *                cell (≈ 4,500+ API calls for a typical payroll → timeout).
 *                Now writes each formula column in a single setFormulas()
 *                call regardless of row count (≈ 11 calls total).
 *
 *  SPEED FIX   — Row formatting was calling setBackground() once per row.
 *                Now uses getRangeList() to batch alternating colors and
 *                status colors in ≈ 4 total API calls.
 *
 *  LOGIC FIX   — PAID rows during migration never receive formula writes.
 *                Their legacy values are written once by setValues() and
 *                never touched again — no freeze step needed in migration.
 *
 *  MATH FIX    — Monthly grand total double-counted every agent because
 *                =SUM(C:H) included bi-weekly subtotal columns.  Now only
 *                weekly pay columns are summed explicitly.
 *
 *  DATA FIX    — Config CURRENT_PERIOD_TAG was hardcoded to 'APRILPP2'.
 *                Now auto-computed from today's date on every install.
 *
 *  CRASH FIX   — v8_extractLegacyHeaderInfo_: .match()[0] could throw
 *                null-reference if a WEEK header had no number.  Guarded.
 *
 *  UX FIX      — Migration showed two alert popups because the snapshot
 *                sub-call had its own alert.  Added silent mode.
 *
 *  UI FIX      — Dashboard current-period breakdown had no totals row.
 *                Gold PERIOD TOTAL row added at the bottom.
 *
 *  BRAND FIX   — Banner showed lowercase 'joi'.  Now 'JOI'.
 *
 * Core rules (unchanged):
 *   • Payroll Run v8 is the single source of truth.
 *   • Legacy Payroll Run is NEVER deleted or modified.
 *   • PAID rows are static values — history is protected.
 *   • Dashboard v8 and Monthly v8 are rebuilt from Payroll Run v8.
 *   • Dashboard/Monthly/Lock are blocked until Validation passes.
 */

// ─────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────
const V8_VERSION       = '8.1.0-definitive';

const V8_SH_CONFIG     = 'Config';
const V8_SH_VALIDATION = 'Validation';
const V8_SH_SNAPSHOT   = 'Pre-v8 Snapshot';
const V8_SH_RULES      = 'Pay Rules';
const V8_SH_AGENTS     = 'Agents';
const V8_SH_ALUMNI     = 'Alumni';
const V8_SH_LEGACY_RUN = 'Payroll Run Legacy';   // old sheet — kept as archive only
const V8_SH_RUN        = 'Payroll Run';           // single source of truth
const V8_SH_DASH       = 'Dashboard';             // single dashboard

const V8_HEADER_ROW    = 3;
const V8_DATA_START    = 4;

const V8_COL = {
  WEEK_LABEL:  1,  // A
  START_DATE:  2,  // B
  END_DATE:    3,  // C
  PP_CODE:     4,  // D
  STATUS:      5,  // E
  AGENT_ID:    6,  // F
  AGENT_NAME:  7,  // G
  RULE_KEY:    8,  // H
  INCLUDE:     9,  // I
  MISSED:     10,  // J
  OT_DAYS:    11,  // K
  SUNDAYS:    12,  // L
  VAC_DAYS:   13,  // M
  KPI:        14,  // N
  BASE:       15,  // O
  KPI_AMT:    16,  // P
  MISSED_DED: 17,  // Q
  OT_PAY:     18,  // R
  SUN_PAY:    19,  // S
  VAC_PAY:    20,  // T
  EXTRA:      21,  // U
  TOTAL:      22,  // V
  PARTIAL:    23,  // W
  COMPOSITE:  24,  // X
  LOCK_TS:    25,  // Y
  VALIDATION: 26   // Z
};

const V8_BRAND = {
  navy:        '#060B45',
  navy2:       '#0A0F5C',
  gold:        '#F5A623',
  goldDark:    '#C47D00',
  goldSubtle:  '#FEF3DC',
  white:       '#FFFFFF',
  light:       '#F7F7FA',
  green:       '#1b5e20',
  greenLight:  '#e8f5e9',
  yellow:      '#F59E0B',
  yellowLight: '#FFFBEB',
  red:         '#c62828',
  redLight:    '#fce4ec',
  muted:       '#6B7280',
  text:        '#111827'
};

const V8_HEADERS = [
  'Week Label','Start Date','End Date','Pay Period Code','Status',
  'Agent ID','Agent Name','Rule Key','Include In Payroll',
  'Missed Days','Overtime Days','Sundays Worked','Vacation Days','KPI Achieved',
  'Weekly Base Pay','KPI Bonus','Missed Deduction','Overtime Pay','Sunday Pay',
  'Vacation Pay','Extra Bonus / Spiffs','Total Pay','Partial Week',
  'Composite Key','Locked Timestamp','Validation'
];

// Legacy column indices (1-based) from the original Payroll Run tab.
const L_COL = {
  AGENT_ID: 1, AGENT_NAME: 2, RULE_KEY: 3, INCLUDE: 4,
  MISSED: 5, OT_DAYS: 6, SUNDAYS: 7, VAC_DAYS: 8, KPI: 9,
  BASE: 10, KPI_AMT: 11, MISSED_DED: 12, OT_PAY: 13, SUN_PAY: 14,
  VAC_PAY: 15, EXTRA: 16, TOTAL: 17, PARTIAL: 18, STATUS: 19, GROUP: 20
};

// ─────────────────────────────────────────────────────────────
//  MENU
// ─────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('JOI Payroll v8')

    // ── VIEWS ──────────────────────────────────────────
    .addItem('View Unpaid Payroll',                'v8_viewUnpaidPayroll')
    .addItem('View Paid Payroll',                  'v8_viewPaidPayroll')
    .addItem('View All Payroll',                   'v8_viewAllPayroll')
    .addItem('Quick Stats',                        'v8_quickStats')
    .addSeparator()

    // ── EXPORT ─────────────────────────────────────────
    .addItem('Export Pay Stub — One Agent',        'v8_exportPayStubOneAgent')
    .addItem('Export Pay Stubs — All Agents',      'v8_exportPayStubsAllAgents')
    .addSeparator()

    // ── WEEKLY WORKFLOW ────────────────────────────────
    .addItem('➕ Add New Week',                     'v8_addNewWeekPayrollRun')
    .addItem('✅ Mark Week as Complete',            'v8_markWeekAsComplete')
    .addItem('💰 Mark Pay Period as PAID',          'v8_markPayPeriodAsPaid')
    .addItem('📋 Week Status Overview',             'v8_weekStatusOverview')
    .addSeparator()
    .addItem('Add New Week — Monthly Pay Sheet',   'v8_addNewWeekMonthlyPaySheet')
    .addItem('Start New Month — Create Pay Sheet', 'v8_startNewMonthCreatePaySheet')
    .addItem('Fill In Weekly Pay Amounts',         'v8_fillInWeeklyPayAmounts')
    .addItem('Complete Week — Auto Next Week',     'v8_completeWeekAutoNextWeek')
    .addSeparator()

    // ── REMOVE ─────────────────────────────────────────
    .addItem('Remove a Week — Payroll Run',        'v8_removeWeekPayrollRun')
    .addItem('Remove a Week — Monthly Pay Sheet',  'v8_removeWeekMonthlyPaySheet')
    .addSeparator()

    // ── AGENT MANAGEMENT ───────────────────────────────
    .addItem('Fix Last Week — Remove Inactive Agents',  'v8_fixLastWeekRemoveInactiveAgents')
    .addItem('Clean Up Any Week — Inactive Agents',     'v8_cleanUpAnyWeekInactiveAgents')
    .addItem('Archive Inactive Agents → Alumni',        'v8_archiveInactiveAgentsToAlumni')
    .addItem('Mark Alumni Payout as PAID',              'v8_markAlumniPayoutAsPaid')
    .addSeparator()

    // ── SYSTEM / UTILITIES ─────────────────────────────
    .addItem('System Check',                       'v8_systemCheck')
    .addItem('Fix Column Formatting',              'v8_fixColumnFormatting')
    .addItem('Fix Styling — All Sheets',           'v8_fixStylingAllSheets')
    .addItem('Initialize — Brand All Sheets',      'v8_initializeBrandAllSheets')
    .addItem('Fix Pay Rules Headers',              'v8_fixPayRulesHeaders')
    .addItem('Fix Agents Headers',                 'v8_fixAgentsHeaders')
    .addItem('Test JOI Logo Setup',                'v8_testJOILogoSetup')
    .addSeparator()

    // ── CORE (INSTALL / MIGRATION / REPORTING) ─────────
    .addItem('0. Install / Prepare v8',           'v8_prepare')
    .addItem('1. Create Pre-v8 Snapshot',          'v8_createPreMigrationSnapshot')
    .addItem('2. Migrate Legacy Payroll Run → v8', 'v8_migrateLegacyPayrollRun')
    .addItem('3. Run Validation',                  'v8_runValidationMenu')
    .addItem('4. Refresh Dashboard v8',            'v8_refreshDashboard')
    .addItem('5. Refresh Monthly Sheet v8…',       'v8_refreshMonthlyPrompt')
    .addItem('6. Lock Selected Week as PAID',      'v8_lockSelectedWeekAsPaid')
    .addSeparator()
    .addItem('Normalize Pay Rules + Agents',       'v8_normalizeMasterData')
    .addItem('Open Config',                        'v8_openConfig')
    .addItem('Open Validation',                    'v8_openValidation')
    .addItem('About v8',                           'v8_about')
    .addToUi();
}

// ─────────────────────────────────────────────────────────────
//  INSTALL / PREPARE
// ─────────────────────────────────────────────────────────────
function v8_prepare() {
  const ui   = SpreadsheetApp.getUi();
  const resp = ui.alert(
    'JOI Payroll v8 — Prepare',
    'Creates Config, Validation, and the Payroll Run v8 tab.\n\nDoes NOT delete or modify your existing Payroll Run. Continue?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;
  v8_ensureConfig_();
  v8_ensureValidationSheet_();
  v8_ensurePayrollRunV8Sheet_();
  v8_createPreMigrationSnapshot(true); // silent — no mid-flow alert
  ui.alert('✅ Prepare complete.\n\nNext: run "2. Migrate Legacy Payroll Run → v8".');
}

function v8_about() {
  SpreadsheetApp.getUi().alert(
    'JOI Payroll v8.1 — Definitive Build\n\n' +
    'Source of truth: Payroll Run v8\n' +
    'Legacy Payroll Run: untouched\n' +
    'PAID rows: static values, history protected\n' +
    'Version: ' + V8_VERSION
  );
}

function v8_openConfig() {
  SpreadsheetApp.getActive().setActiveSheet(v8_ensureConfig_());
}
function v8_openValidation() {
  SpreadsheetApp.getActive().setActiveSheet(v8_ensureValidationSheet_());
}

// ─────────────────────────────────────────────────────────────
//  SHEET BUILDERS
// ─────────────────────────────────────────────────────────────
function v8_ensureConfig_() {
  const ss = SpreadsheetApp.getActive();
  let sh   = ss.getSheetByName(V8_SH_CONFIG);
  if (!sh) sh = ss.insertSheet(V8_SH_CONFIG);
  sh.clear();

  const todayPP = v8_payPeriodCode_(new Date()); // auto-compute current period
  const rows = [
    ['Key',                   'Value',                      'Notes'],
    ['VERSION',               V8_VERSION,                   'Installed version'],
    ['PAY_PERIOD_RULE',       'FIRST_HALF_SECOND_HALF',     'PP1 ≤ day 15; PP2 > day 15'],
    ['PAY_PERIOD_CUTOFF_DAY', 15,                           'Cutoff day for PP1'],
    ['WEEK_START_DAY',        'MON',                        'Weekly schedule assumption'],
    ['CURRENT_PERIOD_TAG',    todayPP,                      'Auto-computed — update if needed'],
    ['LOCK_PAID_WEEKS',       'ALWAYS',                     'PAID weeks are frozen; not optional'],
    ['MIGRATION_SOURCE',      V8_SH_LEGACY_RUN,            'Legacy source sheet'],
    ['MIGRATION_DESTINATION', V8_SH_RUN,                   'v8 source of truth sheet']
  ];
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  v8_styleHeader_(sh.getRange('A1:C1'));
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 3);
  try { sh.hideSheet(); } catch (e) {}
  return sh;
}

function v8_ensureValidationSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh   = ss.getSheetByName(V8_SH_VALIDATION);
  if (!sh) sh = ss.insertSheet(V8_SH_VALIDATION);
  sh.clear();
  const headers = ['Severity','Check','Sheet','Row','Agent ID','Message','Timestamp'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  v8_styleHeader_(sh.getRange(1, 1, 1, headers.length));
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, 7, 130);
  sh.setColumnWidth(6, 380);
  return sh;
}

function v8_ensurePayrollRunV8Sheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh   = ss.getSheetByName(V8_SH_RUN);
  if (!sh) sh = ss.insertSheet(V8_SH_RUN);
  sh.clear();

  // Banner — full-width merges are fine here.
  // NOTE: setFrozenColumns is intentionally omitted.
  // A full-width merged banner row + setFrozenColumns(n) will always crash
  // in Google Sheets when n < total columns.  Frozen ROWS (below) are what
  // matters for daily use.
  v8_writeBanner_(sh, 'PAYROLL RUN — SINGLE SOURCE OF TRUTH', V8_HEADERS.length);

  sh.getRange(V8_HEADER_ROW, 1, 1, V8_HEADERS.length).setValues([V8_HEADERS]);
  v8_styleHeader_(sh.getRange(V8_HEADER_ROW, 1, 1, V8_HEADERS.length));
  sh.setFrozenRows(V8_HEADER_ROW);  // freeze header rows — no column freeze

  sh.setColumnWidths(1, V8_HEADERS.length, 110);
  sh.setColumnWidth(V8_COL.AGENT_NAME,  180);
  sh.setColumnWidth(V8_COL.RULE_KEY,    240);
  sh.setColumnWidth(V8_COL.COMPOSITE,   180);
  sh.setColumnWidth(V8_COL.VALIDATION,  220);
  return sh;
}

// ─────────────────────────────────────────────────────────────
//  MASTER DATA NORMALIZATION
// ─────────────────────────────────────────────────────────────
function v8_normalizeMasterData() {
  const ui   = SpreadsheetApp.getUi();
  const resp = ui.alert(
    'Normalize Pay Rules + Agents',
    'Fixes department typos, Recuirtment → Recruitment, BLB Doc Collector pay, and forces Rule Key formulas. Continue?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;
  try {
    const fixes = [];
    fixes.push.apply(fixes, v8_normalizePayRules_());
    fixes.push.apply(fixes, v8_normalizeAgents_());
    ui.alert('✅ Master data normalized.\n\n' + (fixes.length ? fixes.join('\n') : 'No changes needed.'));
  } catch (e) {
    ui.alert('❌ Error: ' + e.message + '\n\nMake sure Pay Rules and Agents sheets exist.');
  }
}

function v8_normalizePayRules_() {
  const ss  = SpreadsheetApp.getActive();
  const sh  = ss.getSheetByName(V8_SH_RULES);
  if (!sh) throw new Error('Missing sheet: ' + V8_SH_RULES);
  const lastRow = sh.getLastRow();
  const fixes = [];
  if (lastRow < 4) return fixes;
  const values = sh.getRange(4, 1, lastRow - 3, Math.max(12, sh.getLastColumn())).getValues();
  for (let i = 0; i < values.length; i++) {
    const r        = i + 4;
    const campaign = v8_cleanText_(values[i][1]);
    const dept     = v8_cleanDepartment_(values[i][2]);
    const shift    = v8_cleanText_(values[i][3]);
    if (!campaign && !dept && !shift) continue;
    sh.getRange(r, 1).setFormula('=UPPER(TRIM(B' + r + '&"|"&C' + r + '&"|"&D' + r + '))');
    sh.getRange(r, 2).setValue(campaign);
    sh.getRange(r, 3).setValue(dept);
    sh.getRange(r, 4).setValue(shift);
    for (let c = 6; c <= 11; c++) {
      const raw = values[i][c - 1];
      const n   = v8_parseMoney_(raw);
      if (String(raw).trim() !== '' && !isNaN(n)) sh.getRange(r, c).setValue(n);
    }
    const newRule = (campaign + '|' + dept + '|' + shift).toUpperCase();
    if (newRule === 'BLB|DOC COLLECTOR|WEEKDAY') {
      const base = v8_parseMoney_(sh.getRange(r, 6).getValue());
      if (base !== 3000) {
        sh.getRange(r, 6).setValue(3000);
        fixes.push('Fixed BLB Doc Collector base pay → 3000 (row ' + r + ')');
      }
    }
  }
  sh.getRange(3, 13).setValue('Rule Status');
  sh.getRange(4, 13).setFormula('=IF(F4<=0,"INVALID","OK")');
  if (lastRow > 4) sh.getRange(4, 13, lastRow - 3, 1).fillDown();
  sh.getRange(4, 6, Math.max(lastRow - 3, 1), 6).setNumberFormat('$#,##0.00');
  sh.getRange(4, 12, Math.max(lastRow - 3, 1), 1).setNumberFormat('0%');
  fixes.push('Pay Rules formulas and numeric fields normalized.');
  return fixes;
}

function v8_normalizeAgents_() {
  const ss  = SpreadsheetApp.getActive();
  const sh  = ss.getSheetByName(V8_SH_AGENTS);
  if (!sh) throw new Error('Missing sheet: ' + V8_SH_AGENTS);
  const lastRow = sh.getLastRow();
  const fixes = [];
  if (lastRow < 4) return fixes;
  for (let r = lastRow; r >= 4; r--) {
    const a = String(sh.getRange(r, 1).getValue() || '').toUpperCase();
    if (a.indexOf('CAMPAIGN SUMMARY') >= 0 || a === 'TOTAL') {
      try { sh.deleteRow(r); fixes.push('Deleted stale summary row ' + r); } catch (e) {}
    }
  }
  const freshLast = sh.getLastRow();
  if (freshLast < 4) return fixes;
  const data = sh.getRange(4, 1, freshLast - 3, Math.max(11, sh.getLastColumn())).getValues();
  for (let i = 0; i < data.length; i++) {
    const r = i + 4;
    if (!Number(data[i][0])) continue;
    const campaign = v8_cleanText_(data[i][2]);
    const dept     = v8_cleanDepartment_(data[i][3]);
    const shift    = v8_cleanText_(data[i][4]);
    sh.getRange(r, 3).setValue(campaign);
    sh.getRange(r, 4).setValue(dept);
    sh.getRange(r, 5).setValue(shift);
    sh.getRange(r, 6).setFormula('=UPPER(TRIM(C' + r + '&"|"&D' + r + '&"|"&E' + r + '))');
    sh.getRange(r, 11).setFormula(
      '=TEXTJOIN(", ",TRUE,' +
      'IF(B' + r + '="","MISSING_NAME",""),' +
      'IF(COUNTIF(A:A,A' + r + ')>1,"DUPE_ID",""),' +
      'IF(COUNTIF(\'Pay Rules\'!A:A,F' + r + ')=0,"UNKNOWN_RULE",""))');
  }
  sh.getRange(3, 11).setValue('Validation');
  fixes.push('Agents data and Rule Key formulas normalized.');
  return fixes;
}

// ─────────────────────────────────────────────────────────────
//  SNAPSHOT
// ─────────────────────────────────────────────────────────────
/**
 * @param {boolean} [silent] Pass true to suppress the completion alert
 *                           (used when called internally from migration).
 */
function v8_createPreMigrationSnapshot(silent) {
  const ss     = SpreadsheetApp.getActive();
  const source = ss.getSheetByName(V8_SH_LEGACY_RUN);
  if (!source) throw new Error('Missing sheet: ' + V8_SH_LEGACY_RUN);
  let snap = ss.getSheetByName(V8_SH_SNAPSHOT);
  if (!snap) snap = ss.insertSheet(V8_SH_SNAPSHOT);
  snap.clear();

  const rows   = [['Legacy Row','Detected Week','PP Code','Status','Agent ID','Agent Name','Rule Key','Legacy Total','Warning']];
  const blocks = v8_parseLegacyBlocks_();
  blocks.forEach(function(block) {
    block.rows.forEach(function(item) {
      rows.push([item.legacyRow, block.weekLabel, block.ppCode, block.status,
                 item.agentId, item.name, item.ruleKey, item.total, item.warning || '']);
    });
  });
  snap.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  v8_styleHeader_(snap.getRange(1, 1, 1, rows[0].length));
  snap.setFrozenRows(1);
  snap.getRange(2, 8, Math.max(rows.length - 1, 1), 1).setNumberFormat('$#,##0.00');
  snap.autoResizeColumns(1, rows[0].length);
  if (!silent) {
    SpreadsheetApp.getUi().alert('✅ Snapshot created: ' + (rows.length - 1) + ' legacy payroll rows captured.');
  }
}

// ─────────────────────────────────────────────────────────────
//  MIGRATION
// ─────────────────────────────────────────────────────────────
function v8_migrateLegacyPayrollRun() {
  const ui   = SpreadsheetApp.getUi();
  const resp = ui.alert(
    'Migrate Payroll Run → v8',
    'Builds Payroll Run v8 from your existing Payroll Run.\n\n' +
    '• Legacy Payroll Run is NOT deleted or modified.\n' +
    '• PAID rows are written as static values (history protected).\n' +
    '• UNPAID rows get live formula lookups.\n\nContinue?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  v8_ensureConfig_();
  v8_createPreMigrationSnapshot(true); // silent — migration has its own final alert

  const sh      = v8_ensurePayrollRunV8Sheet_();
  const blocks  = v8_parseLegacyBlocks_();
  const output  = [];
  const skipped = [];
  let paidCount = 0;

  blocks.forEach(function(block) {
    block.rows.forEach(function(item) {
      if (!item.agentId) return;
      if (!item.name) {
        skipped.push('Row ' + item.legacyRow + ': blank name for ID ' + item.agentId);
        return;
      }
      const isPaid = block.status === 'PAID';
      if (isPaid) paidCount++;
      output.push([
        block.weekLabel, block.startDate, block.endDate, block.ppCode, block.status,
        item.agentId, item.name, item.ruleKey, item.include,
        item.missed, item.otDays, item.sundays, item.vacDays, item.kpi,
        item.base, item.kpiAmt, item.missedDed, item.otPay, item.sunPay, item.vacPay,
        item.extra, item.total, item.partial,
        item.agentId + '|' + block.ppCode + '|' + block.weekLabel,
        isPaid ? new Date() : '',
        ''
      ]);
    });
  });

  if (!output.length) {
    ui.alert('⚠️ No data rows found in "' + V8_SH_LEGACY_RUN + '". Migration aborted.');
    return;
  }

  // ── Step 1: Write all values in one batch call ────────────
  sh.getRange(V8_DATA_START, 1, output.length, V8_HEADERS.length).setValues(output);

  // ── Step 2: Write formulas ONLY to UNPAID rows (batched by column) ──
  // PAID rows already have correct static values from setValues() above.
  // No freeze step needed during migration.
  const statusArr = output.map(function(row) {
    return String(row[V8_COL.STATUS - 1] || '').toUpperCase();
  });
  v8_writeFormulasForUnpaidRows_(sh, output.length, statusArr);

  // ── Step 3: Apply formatting (batched) ────────────────────
  v8_formatPayrollRunV8_(sh, output.length, statusArr);

  // ── Step 4: Validate ─────────────────────────────────────
  v8_runValidation(false);

  ui.alert(
    '✅ Migration complete!\n\n' +
    'Total rows written:    ' + output.length + '\n' +
    'PAID rows (frozen):    ' + paidCount + '\n' +
    'UNPAID rows (live):    ' + (output.length - paidCount) + '\n' +
    'Skipped ghost rows:    ' + skipped.length +
    (skipped.length ? '\n\nSkipped:\n' + skipped.slice(0, 5).join('\n') : '') +
    '\n\nNext: Run Validation → then Refresh Dashboard v8.'
  );
}

// ─────────────────────────────────────────────────────────────
//  LEGACY PARSER
// ─────────────────────────────────────────────────────────────
function v8_parseLegacyBlocks_() {
  const ss   = SpreadsheetApp.getActive();
  const sh   = ss.getSheetByName(V8_SH_LEGACY_RUN);
  if (!sh) throw new Error('Missing sheet: ' + V8_SH_LEGACY_RUN);
  const data   = sh.getDataRange().getValues();
  const blocks = [];
  let current  = v8_makeLegacyBlock_('WEEK 1', new Date(2026, 1, 23), new Date(2026, 2, 1), 'PAID');
  let lastEnd  = new Date(2026, 2, 1);

  // Build a combined ID→ruleKey fallback map from Agents + Alumni so that
  // any legacy row with a blank rule key can be healed automatically.
  const agentFallback = {};
  (function() {
    const agentMap  = v8_buildAgentMap_(false);   // false = include inactive
    const alumniMap = v8_buildAlumniMap_();
    // Alumni takes lower priority — Agents sheet wins if agent appears in both
    Object.keys(alumniMap).forEach(function(id) {
      if (!agentFallback[id]) agentFallback[id] = v8_normalizeRuleKey_(alumniMap[id].ruleKey);
    });
    Object.keys(agentMap).forEach(function(id) {
      agentFallback[id] = v8_normalizeRuleKey_(agentMap[id].ruleKey);
    });
  })();

  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (v8_isLegacyHeaderRow_(row)) {
      if (current && current.rows.length) blocks.push(current);
      current = v8_extractLegacyHeaderInfo_(row, lastEnd);
      lastEnd = current.endDate;
      continue;
    }
    const id = Number(row[L_COL.AGENT_ID - 1]);
    if (!id || isNaN(id)) continue;
    if (!current) {
      current = v8_makeLegacyBlock_('WEEK 1', new Date(2026, 1, 23), new Date(2026, 2, 1), 'PAID');
    }
    const name = v8_cleanText_(row[L_COL.AGENT_NAME - 1]);

    // Normalize whatever rule key is in the legacy row; if blank, fall back
    // to the canonical value from Agents / Alumni sheets (heals rows like
    // Agent 51 where the legacy pay run row simply had no rule key written).
    let ruleKey = v8_normalizeRuleKey_(v8_cleanText_(row[L_COL.RULE_KEY - 1]));
    if (!ruleKey && agentFallback[id]) ruleKey = agentFallback[id];

    current.rows.push({
      legacyRow:  i + 1,
      agentId:    id,
      name:       name,
      ruleKey:    ruleKey,
      include:    v8_yesNo_(row[L_COL.INCLUDE     - 1], 'YES'),
      missed:     v8_num_(row[L_COL.MISSED       - 1]),
      otDays:     v8_num_(row[L_COL.OT_DAYS      - 1]),
      sundays:    v8_num_(row[L_COL.SUNDAYS      - 1]),
      vacDays:    v8_num_(row[L_COL.VAC_DAYS     - 1]),
      kpi:        v8_yesNo_(row[L_COL.KPI         - 1], 'NO'),
      base:       v8_parseMoney_(row[L_COL.BASE        - 1]),
      kpiAmt:     v8_parseMoney_(row[L_COL.KPI_AMT     - 1]),
      missedDed:  v8_parseMoney_(row[L_COL.MISSED_DED  - 1]),
      otPay:      v8_parseMoney_(row[L_COL.OT_PAY      - 1]),
      sunPay:     v8_parseMoney_(row[L_COL.SUN_PAY     - 1]),
      vacPay:     v8_parseMoney_(row[L_COL.VAC_PAY     - 1]),
      extra:      v8_parseMoney_(row[L_COL.EXTRA       - 1]),
      total:      v8_parseMoney_(row[L_COL.TOTAL       - 1]),
      partial:    v8_cleanText_(row[L_COL.PARTIAL     - 1]),
      warning:    !name ? 'GHOST_ROW_BLANK_NAME' : ''
    });
  }
  if (current && current.rows.length) blocks.push(current);
  return blocks;
}

function v8_isLegacyHeaderRow_(row) {
  const a    = row[0];
  const text = String(a || '').trim().toUpperCase();
  if (text.indexOf('TOTAL') >= 0) return false;
  return text.indexOf('WEEK') === 0 || a instanceof Date;
}

function v8_extractLegacyHeaderInfo_(row, priorEnd) {
  const raw = String(row[0] || '').trim();

  // Guard: WEEK header might have no digit (e.g. "WEEK LABEL" row).
  let weekLabel = '';
  if (raw.toUpperCase().indexOf('WEEK') === 0) {
    const m = raw.match(/WEEK\s*\d+/i);
    if (m) weekLabel = m[0].toUpperCase().replace(/\s+/, ' ');
  }

  const dateMatch = raw.match(/(\d{2})\/(\d{2})\/(\d{2})\s*[-–]\s*(\d{2})\/(\d{2})\/(\d{2})/);
  let startDate, endDate;
  if (dateMatch) {
    startDate = v8_mmddyy_(dateMatch[1], dateMatch[2], dateMatch[3]);
    endDate   = v8_mmddyy_(dateMatch[4], dateMatch[5], dateMatch[6]);
  } else {
    startDate = new Date(priorEnd.getTime());
    startDate.setDate(startDate.getDate() + 1);
    endDate   = new Date(startDate.getTime());
    endDate.setDate(startDate.getDate() + 6);
  }
  if (!weekLabel) weekLabel = 'WEEK ' + v8_inferWeekNumFromDate_(endDate);
  const status = v8_cleanStatus_(row[L_COL.STATUS - 1]);
  return v8_makeLegacyBlock_(weekLabel, startDate, endDate, status || 'UNPAID');
}

function v8_makeLegacyBlock_(weekLabel, startDate, endDate, status) {
  return {
    weekLabel: weekLabel,
    startDate: v8_dateOnly_(startDate),
    endDate:   v8_dateOnly_(endDate),
    ppCode:    v8_payPeriodCode_(endDate),
    status:    v8_cleanStatus_(status) || 'UNPAID',
    rows:      []
  };
}

// ─────────────────────────────────────────────────────────────
//  FORMULA + FORMATTING (BATCH — replaces old row-by-row loops)
// ─────────────────────────────────────────────────────────────

/**
 * Writes formulas ONLY to UNPAID rows using column-level setFormulas()
 * calls. For N rows this makes ~11 API calls instead of N×11.
 * PAID rows are left untouched — their legacy values from setValues() stand.
 */
function v8_writeFormulasForUnpaidRows_(sh, count, statusArr) {
  if (!count) return;

  // Find contiguous groups of UNPAID rows.
  const groups = [];
  let gStart   = -1;
  statusArr.forEach(function(s, i) {
    if (s !== 'PAID') {
      if (gStart === -1) gStart = i;
    } else if (gStart !== -1) {
      groups.push({ startIdx: gStart, endIdx: i - 1 });
      gStart = -1;
    }
  });
  if (gStart !== -1) groups.push({ startIdx: gStart, endIdx: count - 1 });

  groups.forEach(function(g) {
    const sheetStart = V8_DATA_START + g.startIdx;
    const gCount     = g.endIdx - g.startIdx + 1;
    v8_writeFormulaBlock_(sh, sheetStart, gCount);
  });
}

function v8_writeFormulaBlock_(sh, startRow, count) {
  if (!count) return;

  // Build formula arrays (one entry per row) for each column.
  const fAgentName  = [], fRuleKey   = [], fBase      = [], fKpi    = [];
  const fMissed     = [], fOt        = [], fSun       = [], fVac    = [];
  const fTotal      = [], fComposite = [], fValidation = [];

  for (let r = startRow; r < startRow + count; r++) {
    fAgentName .push(['=IFERROR(VLOOKUP(F'+r+',Agents!A:B,2,FALSE),IFERROR(VLOOKUP(F'+r+',Alumni!A:B,2,FALSE),""))']);
    fRuleKey   .push(['=IFERROR(VLOOKUP(F'+r+',Agents!A:F,6,FALSE),IFERROR(VLOOKUP(F'+r+',Alumni!A:E,5,FALSE),""))']);
    fBase      .push(['=IFERROR(VLOOKUP(H'+r+',\'Pay Rules\'!A:F,6,FALSE),0)']);
    fKpi       .push(['=IF(N'+r+'="YES",IFERROR(VLOOKUP(H'+r+',\'Pay Rules\'!A:H,8,FALSE),0),0)']);
    fMissed    .push(['=J'+r+'*IFERROR(VLOOKUP(H'+r+',\'Pay Rules\'!A:I,9,FALSE),0)']);
    fOt        .push(['=K'+r+'*IFERROR(VLOOKUP(H'+r+',\'Pay Rules\'!A:J,10,FALSE),0)']);
    fSun       .push(['=L'+r+'*IFERROR(VLOOKUP(H'+r+',\'Pay Rules\'!A:K,11,FALSE),0)']);
    fVac       .push(['=M'+r+'*IFERROR(VLOOKUP(H'+r+',\'Pay Rules\'!A:L,12,FALSE),0)*IFERROR(VLOOKUP(H'+r+',\'Pay Rules\'!A:G,7,FALSE),0)']);
    fTotal     .push(['=IF(I'+r+'="YES",O'+r+'+P'+r+'-Q'+r+'+R'+r+'+S'+r+'+T'+r+'+U'+r+',0)']);
    fComposite .push(['=F'+r+'&"|"&D'+r+'&"|"&A'+r]);
    fValidation.push(['=TEXTJOIN(", ",TRUE,' +
      'IF(G'+r+'="","MISSING_NAME",""),' +
      'IF(H'+r+'="","MISSING_RULE",""),' +
      'IF(ABS(V'+r+'-IF(I'+r+'="YES",O'+r+'+P'+r+'-Q'+r+'+R'+r+'+S'+r+'+T'+r+'+U'+r+',0))>0.01,"BAD_TOTAL",""))']);
  }

  // One setFormulas() call per column = 11 API calls for any number of rows.
  sh.getRange(startRow, V8_COL.AGENT_NAME,  count, 1).setFormulas(fAgentName);
  sh.getRange(startRow, V8_COL.RULE_KEY,    count, 1).setFormulas(fRuleKey);
  sh.getRange(startRow, V8_COL.BASE,        count, 1).setFormulas(fBase);
  sh.getRange(startRow, V8_COL.KPI_AMT,     count, 1).setFormulas(fKpi);
  sh.getRange(startRow, V8_COL.MISSED_DED,  count, 1).setFormulas(fMissed);
  sh.getRange(startRow, V8_COL.OT_PAY,      count, 1).setFormulas(fOt);
  sh.getRange(startRow, V8_COL.SUN_PAY,     count, 1).setFormulas(fSun);
  sh.getRange(startRow, V8_COL.VAC_PAY,     count, 1).setFormulas(fVac);
  sh.getRange(startRow, V8_COL.TOTAL,       count, 1).setFormulas(fTotal);
  sh.getRange(startRow, V8_COL.COMPOSITE,   count, 1).setFormulas(fComposite);
  sh.getRange(startRow, V8_COL.VALIDATION,  count, 1).setFormulas(fValidation);
}

/**
 * Applies all formatting using batch/RangeList calls.
 * Total API calls: ~10 regardless of row count.
 */
function v8_formatPayrollRunV8_(sh, count, statusArr) {
  if (!count) return;
  const start   = V8_DATA_START;
  const lastCol = v8_colLetter_(V8_HEADERS.length);

  // Base formatting — 7 calls.
  sh.getRange(start, 1, count, V8_HEADERS.length).setFontSize(9).setVerticalAlignment('middle');
  sh.getRange(start, V8_COL.START_DATE, count, 2).setNumberFormat('yyyy-mm-dd');
  sh.getRange(start, V8_COL.BASE,       count, 8).setNumberFormat('$#,##0.00');
  sh.getRange(start, V8_COL.AGENT_ID,   count, 1).setHorizontalAlignment('center');
  sh.getRange(start, V8_COL.STATUS,     count, 1).setHorizontalAlignment('center');
  sh.getRange(start, V8_COL.INCLUDE,    count, 1).setDataValidation(v8_yesNoValidation_());
  sh.getRange(start, V8_COL.KPI,        count, 1).setDataValidation(v8_yesNoValidation_());

  // Alternating row backgrounds — 2 calls using RangeList.
  sh.getRange(start, 1, count, V8_HEADERS.length).setBackground(V8_BRAND.white);
  const oddRanges = [];
  for (let i = 1; i < count; i += 2) {
    oddRanges.push('A' + (start + i) + ':' + lastCol + (start + i));
  }
  if (oddRanges.length) sh.getRangeList(oddRanges).setBackground(V8_BRAND.goldSubtle);

  // Status column coloring — 3 calls using RangeList.
  const paidCells = [], completeCells = [], unpaidCells = [];
  statusArr.forEach(function(s, i) {
    const cell = 'E' + (start + i);
    if (s === 'PAID')         paidCells.push(cell);
    else if (s === 'COMPLETE') completeCells.push(cell);
    else                       unpaidCells.push(cell);
  });
  if (paidCells.length)
    sh.getRangeList(paidCells).setBackground(V8_BRAND.greenLight).setFontColor(V8_BRAND.green).setFontWeight('bold');
  if (completeCells.length)
    sh.getRangeList(completeCells).setBackground('#E3F2FD').setFontColor('#1565C0').setFontWeight('bold');
  if (unpaidCells.length)
    sh.getRangeList(unpaidCells).setBackground(V8_BRAND.yellowLight).setFontColor('#7a4f00').setFontWeight('bold');
}

/**
 * Freezes a single row's calculated columns to static values.
 * Used by Lock Week as PAID (NOT during migration).
 */
function v8_freezePayrollRow_(sh, r) {
  const zones = ['G' + r + ':H' + r, 'O' + r + ':V' + r, 'X' + r + ':Z' + r];
  zones.forEach(function(a1) {
    const rg = sh.getRange(a1);
    rg.copyTo(rg, { contentsOnly: true });
  });
}

// ─────────────────────────────────────────────────────────────
//  VALIDATION
// ─────────────────────────────────────────────────────────────
function v8_runValidationMenu() {
  const result = v8_runValidation(true);
  SpreadsheetApp.getUi().alert(
    result.errors === 0
      ? '✅ Validation passed — no blocking errors.'
      : '❌ ' + result.errors + ' blocking error(s) found. See Validation tab.'
  );
}

function v8_runValidation(showSheet) {
  const shVal  = v8_ensureValidationSheet_();
  const ss     = SpreadsheetApp.getActive();
  const shRun  = ss.getSheetByName(V8_SH_RUN);
  const issues = [];
  const now    = new Date();

  if (!shRun) {
    issues.push(['ERROR','Payroll Run v8 missing',V8_SH_RUN,'','','Run migration first.',now]);
    return v8_writeValidationIssues_(issues, showSheet);
  }

  const agents  = v8_buildAgentMap_(false);
  const alumni  = v8_buildAlumniMap_();
  const rules   = v8_buildRuleSet_();

  v8_findDuplicates_(Object.keys(agents).map(Number)).forEach(function(id) {
    issues.push(['ERROR','Duplicate Agent ID',V8_SH_AGENTS,'',id,'Agent ID appears more than once.',now]);
  });
  Object.keys(agents).forEach(function(id) {
    if (alumni[id]) issues.push(['ERROR','Agent in Agents + Alumni',V8_SH_AGENTS,'' ,id,'ID in both live Agents and Alumni.',now]);
  });

  const lastRow = shRun.getLastRow();
  if (lastRow >= V8_DATA_START) {
    const data = shRun.getRange(V8_DATA_START, 1, lastRow - V8_DATA_START + 1, V8_HEADERS.length).getValues();
    data.forEach(function(row, idx) {
      const shRow = V8_DATA_START + idx;
      const id    = Number(row[V8_COL.AGENT_ID   - 1]);
      if (!id) return;
      const name   = v8_cleanText_(row[V8_COL.AGENT_NAME - 1]);
      const rule   = v8_cleanText_(row[V8_COL.RULE_KEY   - 1]);
      const week   = v8_cleanText_(row[V8_COL.WEEK_LABEL - 1]);
      const pp     = v8_cleanText_(row[V8_COL.PP_CODE    - 1]);
      const status = v8_cleanStatus_(row[V8_COL.STATUS   - 1]);
      if (!week || !row[V8_COL.START_DATE-1] || !row[V8_COL.END_DATE-1] || !pp || !status)
        issues.push(['ERROR','Missing metadata',V8_SH_RUN,shRow,id,'Week/Start/End/PP/Status must be set.',now]);
      if (!name) issues.push(['ERROR','Ghost row',V8_SH_RUN,shRow,id,'Agent ID present but name is blank.',now]);
      if (!agents[id] && !alumni[id]) issues.push(['ERROR','Unknown Agent',V8_SH_RUN,shRow,id,'Not in Agents or Alumni.',now]);
      if (!rule) issues.push(['ERROR','Missing Rule Key',V8_SH_RUN,shRow,id,'Rule Key is blank.',now]);
      if (rule && !rules[rule]) issues.push(['ERROR','Unknown Rule Key',V8_SH_RUN,shRow,id,'Not in Pay Rules: '+rule,now]);
      const inc      = String(row[V8_COL.INCLUDE-1]).toUpperCase() === 'YES';
      const expected = inc
        ? v8_num_(row[V8_COL.BASE-1]) + v8_num_(row[V8_COL.KPI_AMT-1])
          - v8_num_(row[V8_COL.MISSED_DED-1]) + v8_num_(row[V8_COL.OT_PAY-1])
          + v8_num_(row[V8_COL.SUN_PAY-1])    + v8_num_(row[V8_COL.VAC_PAY-1])
          + v8_num_(row[V8_COL.EXTRA-1])
        : 0;
      const actual = v8_num_(row[V8_COL.TOTAL-1]);
      if (Math.abs(expected - actual) > 0.01)
        issues.push(['ERROR','Math mismatch',V8_SH_RUN,shRow,id,
          'Expected '+v8_fmt_(expected)+', got '+v8_fmt_(actual),now]);
    });
  }
  return v8_writeValidationIssues_(issues, showSheet);
}

function v8_writeValidationIssues_(issues, showSheet) {
  const sh = v8_ensureValidationSheet_();
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 7).clearContent().clearFormat();
  if (issues.length) {
    sh.getRange(2, 1, issues.length, 7).setValues(issues);
    sh.getRange(2, 1, issues.length, 1).setFontWeight('bold').setFontColor(V8_BRAND.red);
    sh.getRange(2, 7, issues.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  } else {
    sh.getRange(2, 1, 1, 7).setValues([['OK','All checks passed','','','','No blocking errors.',new Date()]]);
    sh.getRange(2, 1, 1, 7).setBackground(V8_BRAND.greenLight).setFontColor(V8_BRAND.green);
  }
  sh.autoResizeColumns(1, 7);
  if (showSheet) SpreadsheetApp.getActive().setActiveSheet(sh);
  return { errors: issues.length };
}

function v8_assertValidationPass_() {
  const result = v8_runValidation(false);
  if (result.errors > 0) {
    SpreadsheetApp.getActive().setActiveSheet(
      SpreadsheetApp.getActive().getSheetByName(V8_SH_VALIDATION));
    throw new Error('Validation failed: ' + result.errors + ' error(s). Fix Validation tab first.');
  }
}

// ─────────────────────────────────────────────────────────────
//  DASHBOARD
// ─────────────────────────────────────────────────────────────
function v8_refreshDashboard() {
  try { v8_assertValidationPass_(); }
  catch (e) { SpreadsheetApp.getUi().alert('❌ Dashboard blocked.\n' + e.message); return; }

  const ss  = SpreadsheetApp.getActive();
  let dash  = ss.getSheetByName(V8_SH_DASH);
  if (!dash) dash = ss.insertSheet(V8_SH_DASH);
  dash.clear();
  v8_writeBanner_(dash, 'JOI PAYROLL — DASHBOARD', 12);

  // KPI strip — rows 3-4
  const kpis = [
    { label:'Total Payroll',  bg:V8_BRAND.navy,        fg:V8_BRAND.gold,  range:'A3:C3', valRange:'A4:C4', formula:'=SUM(\''+V8_SH_RUN+'\'!V:V)', fmt:'$#,##0.00' },
    { label:'Still Unpaid',   bg:V8_BRAND.yellowLight, fg:'#7a4f00',      range:'D3:F3', valRange:'D4:F4', formula:'=SUMIFS(\''+V8_SH_RUN+'\'!V:V,\''+V8_SH_RUN+'\'!E:E,"UNPAID")', fmt:'$#,##0.00' },
    { label:'Active Agents',  bg:V8_BRAND.greenLight,  fg:V8_BRAND.green, range:'G3:I3', valRange:'G4:I4', formula:'=COUNTIF(Agents!G:G,"Yes")', fmt:'0' },
    { label:'Current Period', bg:'#EEF0FF',             fg:V8_BRAND.navy,  range:'J3:L3', valRange:'J4:L4', formula:'=Config!B6', fmt:'@' }
  ];
  kpis.forEach(function(k) {
    dash.getRange(k.range).merge().setValue(k.label)
      .setBackground(k.bg).setFontColor(k.fg).setFontWeight('bold').setHorizontalAlignment('center');
    dash.getRange(k.valRange).merge().setFormula(k.formula).setNumberFormat(k.fmt);
  });
  dash.getRange('A4:L4').setFontWeight('bold').setFontSize(16).setHorizontalAlignment('center').setVerticalAlignment('middle');
  dash.setRowHeight(4, 42);

  const runData  = v8_getPayrollRunV8Data_();
  const idTotals = {};
  runData.forEach(function(r) {
    const id = Number(r.agentId);
    if (!id) return;
    if (!idTotals[id]) idTotals[id] = { name:r.name, total:0, unpaid:0, paid:0, weeks:0 };
    idTotals[id].total += r.total;
    idTotals[id].weeks++;
    if (r.status === 'UNPAID') idTotals[id].unpaid += r.total;
    else                       idTotals[id].paid   += r.total;
  });
  const ids = Object.keys(idTotals).map(Number).sort(function(a,b){ return idTotals[b].total - idTotals[a].total; });

  // Agent summary table
  let row = 7;
  dash.getRange(row, 1, 1, 7).setValues([['Agent ID','Agent Name','Total Earned','Still Unpaid','Paid Total','Weeks','Status']]);
  v8_styleHeader_(dash.getRange(row, 1, 1, 7));
  row++;
  const agentRows = ids.map(function(id) {
    const d = idTotals[id];
    return [id, d.name, d.total, d.unpaid, d.paid, d.weeks, d.unpaid > 0 ? 'UNPAID' : 'CLEAR'];
  });
  if (agentRows.length) {
    dash.getRange(row, 1, agentRows.length, 7).setValues(agentRows);
    dash.getRange(row, 3, agentRows.length, 3).setNumberFormat('$#,##0.00');
    dash.getRange(row, 7, agentRows.length, 1).setHorizontalAlignment('center');
    row += agentRows.length + 2;
  }

  // Current period detail
  const currentPP = v8_getConfigValue_('CURRENT_PERIOD_TAG') || v8_latestPayPeriod_(runData);
  dash.getRange(row, 1, 1, 10).merge()
    .setValue('Pay Period Detail — ' + currentPP)
    .setBackground(V8_BRAND.navy).setFontColor(V8_BRAND.gold).setFontWeight('bold').setFontSize(10);
  row++;
  dash.getRange(row, 1, 1, 10).setValues([['Agent ID','Agent Name','Base','KPI','Deduction','OT','Sunday','Vacation','Spiffs','Total']]);
  v8_styleHeader_(dash.getRange(row, 1, 1, 10));
  row++;

  const detailMap = {};
  runData.filter(function(r){ return r.ppCode === currentPP; }).forEach(function(r) {
    const id = r.agentId;
    if (!detailMap[id]) detailMap[id] = {id:id,name:r.name,base:0,kpi:0,ded:0,ot:0,sun:0,vac:0,extra:0,total:0};
    detailMap[id].base  += r.base;
    detailMap[id].kpi   += r.kpiAmt;
    detailMap[id].ded   += r.missedDed;
    detailMap[id].ot    += r.otPay;
    detailMap[id].sun   += r.sunPay;
    detailMap[id].vac   += r.vacPay;
    detailMap[id].extra += r.extra;
    detailMap[id].total += r.total;
  });
  const details = Object.keys(detailMap).map(Number)
    .sort(function(a,b){ return detailMap[b].total - detailMap[a].total; })
    .map(function(id){
      const d = detailMap[id];
      return [d.id,d.name,d.base,d.kpi,d.ded,d.ot,d.sun,d.vac,d.extra,d.total];
    });
  if (details.length) {
    dash.getRange(row, 1, details.length, 10).setValues(details);
    dash.getRange(row, 3, details.length, 8).setNumberFormat('$#,##0.00');
    // Period totals row
    const totRow = row + details.length + 1;
    dash.getRange(totRow, 1, 1, 2).merge()
      .setValue('PERIOD TOTAL')
      .setBackground(V8_BRAND.gold).setFontColor(V8_BRAND.navy)
      .setFontWeight('bold').setHorizontalAlignment('right');
    for (var c = 3; c <= 10; c++) {
      dash.getRange(totRow, c)
        .setFormula('=SUM(' + v8_colLetter_(c) + row + ':' + v8_colLetter_(c) + (row + details.length - 1) + ')')
        .setNumberFormat('$#,##0.00')
        .setBackground(V8_BRAND.gold).setFontColor(V8_BRAND.navy).setFontWeight('bold');
    }
  }

  dash.setFrozenRows(4);
  dash.autoResizeColumns(1, 12);
  ss.setActiveSheet(dash);
}

// ─────────────────────────────────────────────────────────────
//  MONTHLY VIEW
// ─────────────────────────────────────────────────────────────
function v8_refreshMonthlyPrompt() {
  try { v8_assertValidationPass_(); }
  catch (e) { SpreadsheetApp.getUi().alert('❌ Monthly refresh blocked.\n' + e.message); return; }
  const ui   = SpreadsheetApp.getUi();
  const resp = ui.prompt('Refresh Monthly Sheet v8', 'Enter month and year — example: May 2026', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const text = String(resp.getResponseText() || '').trim();
  if (text) v8_refreshMonthlySheet_(text);
}

function v8_refreshMonthlySheet_(monthText) {
  const parsed = v8_parseMonthYear_(monthText);
  if (!parsed) throw new Error('Invalid month text: ' + monthText);
  const ss    = SpreadsheetApp.getActive();
  const name  = parsed.name + ' ' + String(parsed.year).slice(-2) + ' PayRoll';
  let sh      = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  v8_writeBanner_(sh, parsed.name.toUpperCase() + ' ' + parsed.year + ' — MONTHLY PAY SHEET', 26);

  const runData = v8_getPayrollRunV8Data_().filter(function(r) {
    return r.endDate instanceof Date
      && r.endDate.getFullYear() === parsed.year
      && r.endDate.getMonth()    === parsed.monthIndex;
  });

  // Unique weeks in chronological order
  const weeks = [], seen = {};
  runData.forEach(function(r) {
    const k = r.weekLabel + '|' + r.ppCode;
    if (!seen[k]) {
      seen[k] = true;
      weeks.push({ weekLabel:r.weekLabel, ppCode:r.ppCode, startDate:r.startDate, endDate:r.endDate });
    }
  });
  weeks.sort(function(a,b){ return a.endDate - b.endDate; });

  const agents = v8_getActiveAgents_();
  sh.getRange(3, 1, 1, 2).setValues([['Agent ID','Agent Name']]);
  v8_styleHeader_(sh.getRange(3, 1, 1, 2));

  // Build column layout and track which columns are true weekly pay cols.
  let col = 3;
  const weekColMap    = {};  // idx → spreadsheet col for that week's pay
  const subtotalCols  = {};  // spreadsheet col → true  (bi-weekly subtotals, excluded from grand total)

  weeks.forEach(function(w, idx) {
    // Week header — row 2
    sh.getRange(2, col).setValue(w.weekLabel + ' ' + v8_shortDate_(w.startDate) + ' - ' + v8_shortDate_(w.endDate));
    sh.getRange(2, col).setBackground(V8_BRAND.gold).setFontColor(V8_BRAND.navy).setFontWeight('bold').setHorizontalAlignment('center');
    // Column header — row 3
    sh.getRange(3, col).setValue('Pay').setBackground(V8_BRAND.navy).setFontColor(V8_BRAND.white).setFontWeight('bold');
    weekColMap[idx] = col;
    col++;

    // Insert bi-weekly subtotal after week index 1 (end of PP1) and index 3 (end of PP2).
    if (idx === 1 || idx === 3) {
      sh.getRange(2, col).setValue(w.ppCode + ' Total').setBackground(V8_BRAND.navy).setFontColor(V8_BRAND.gold).setFontWeight('bold').setHorizontalAlignment('center');
      sh.getRange(3, col).setValue('Bi-Weekly Total').setBackground(V8_BRAND.navy).setFontColor(V8_BRAND.white).setFontWeight('bold');
      subtotalCols[col] = true;
      col++;
    }
  });

  const grandTotalCol = col;
  sh.getRange(2, grandTotalCol).setValue('Monthly Total').setBackground(V8_BRAND.navy).setFontColor(V8_BRAND.gold).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(3, grandTotalCol).setValue('Grand Total').setBackground(V8_BRAND.navy).setFontColor(V8_BRAND.white).setFontWeight('bold');

  const startRow = 4;
  if (agents.length) {
    sh.getRange(startRow, 1, agents.length, 2).setValues(agents.map(function(a){ return [a.id, a.name]; }));
    for (var r = 0; r < agents.length; r++) {
      const rowNum       = startRow + r;
      const weeklyPayCols = []; // ONLY real pay columns — used for grand total

      weeks.forEach(function(w, idx) {
        const wCol = weekColMap[idx];
        // SUMIFS for this week + this agent
        const f = '=SUMIFS(\'' + V8_SH_RUN + '\'!$V:$V,' +
                  '\'' + V8_SH_RUN + '\'!$F:$F,$A' + rowNum + ',' +
                  '\'' + V8_SH_RUN + '\'!$A:$A,"' + w.weekLabel + '",' +
                  '\'' + V8_SH_RUN + '\'!$D:$D,"' + w.ppCode + '")';
        sh.getRange(rowNum, wCol).setFormula(f).setNumberFormat('$#,##0.00');
        weeklyPayCols.push(wCol);

        // Bi-weekly subtotal (sum of the two preceding weekly cols)
        if (idx === 1 || idx === 3) {
          const prevCol    = weekColMap[idx - 1];
          const subtotCol  = wCol + 1;
          sh.getRange(rowNum, subtotCol)
            .setFormula('=' + v8_colLetter_(prevCol) + rowNum + '+' + v8_colLetter_(wCol) + rowNum)
            .setNumberFormat('$#,##0.00');
        }
      });

      // Grand total = sum of ONLY weekly pay columns (NOT bi-weekly subtotals).
      // This prevents double-counting.
      const grandF = weeklyPayCols.length
        ? '=' + weeklyPayCols.map(function(c){ return v8_colLetter_(c) + rowNum; }).join('+')
        : '=0';
      sh.getRange(rowNum, grandTotalCol).setFormula(grandF).setNumberFormat('$#,##0.00');
    }
    sh.getRange(startRow, 1, agents.length, grandTotalCol).setFontSize(10);
  }

  // Footer totals row
  const totalRow = startRow + agents.length + 1;
  sh.getRange(totalRow, 1, 1, 2).merge()
    .setValue('GRAND TOTAL')
    .setBackground(V8_BRAND.gold).setFontColor(V8_BRAND.navy).setFontWeight('bold').setHorizontalAlignment('right');
  for (var c = 3; c <= grandTotalCol; c++) {
    sh.getRange(totalRow, c)
      .setFormula('=SUM(' + v8_colLetter_(c) + startRow + ':' + v8_colLetter_(c) + (totalRow - 1) + ')')
      .setNumberFormat('$#,##0.00')
      .setBackground(V8_BRAND.gold).setFontColor(V8_BRAND.navy).setFontWeight('bold');
  }
  sh.setFrozenRows(3);
  // NOTE: setFrozenColumns intentionally omitted.
  // The full-width merged banner in row 1 spans all columns; calling
  // setFrozenColumns(n) where n < total columns throws:
  //   "Sorry, you can't freeze columns which contain only part of a merged cell."
  // Frozen rows (3-row header) are sufficient for usability.
  sh.autoResizeColumns(1, grandTotalCol);
  SpreadsheetApp.getActive().setActiveSheet(sh);
}

// ─────────────────────────────────────────────────────────────
//  LOCK WEEK AS PAID
// ─────────────────────────────────────────────────────────────
function v8_lockSelectedWeekAsPaid() {
  try { v8_assertValidationPass_(); }
  catch (e) { SpreadsheetApp.getUi().alert('❌ Lock blocked.\n' + e.message); return; }

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getActiveSheet();
  if (sh.getName() !== V8_SH_RUN) {
    SpreadsheetApp.getUi().alert('Open "Payroll Run v8" and select a row in the week to lock.');
    return;
  }
  const row = sh.getActiveRange().getRow();
  if (row < V8_DATA_START) { SpreadsheetApp.getUi().alert('Select a data row, not the header.'); return; }

  const weekLabel = String(sh.getRange(row, V8_COL.WEEK_LABEL).getValue() || '').trim();
  const ppCode    = String(sh.getRange(row, V8_COL.PP_CODE).getValue() || '').trim();
  if (!weekLabel || !ppCode) { SpreadsheetApp.getUi().alert('Selected row is missing Week Label or Pay Period Code.'); return; }

  const ui      = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    'Lock Week as PAID',
    'Sets ALL rows in "' + weekLabel + ' / ' + ppCode + '" to PAID and freezes formulas as static values.\n\nThis permanently protects that week\'s payroll history. Continue?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  const lastRow = sh.getLastRow();
  const data    = sh.getRange(V8_DATA_START, 1, lastRow - V8_DATA_START + 1, V8_HEADERS.length).getValues();
  let locked    = 0;
  data.forEach(function(r, idx) {
    const shRow = V8_DATA_START + idx;
    if (String(r[V8_COL.WEEK_LABEL-1]).trim() === weekLabel && String(r[V8_COL.PP_CODE-1]).trim() === ppCode) {
      sh.getRange(shRow, V8_COL.STATUS).setValue('PAID');
      sh.getRange(shRow, V8_COL.LOCK_TS).setValue(new Date()).setNumberFormat('yyyy-mm-dd hh:mm');
      v8_freezePayrollRow_(sh, shRow);
      sh.getRange(shRow, V8_COL.STATUS).setBackground(V8_BRAND.greenLight).setFontColor(V8_BRAND.green).setFontWeight('bold');
      locked++;
    }
  });
  ui.alert('✅ Locked ' + locked + ' row(s) for ' + weekLabel + ' / ' + ppCode + '.');
}

// ─────────────────────────────────────────────────────────────
//  DATA HELPERS
// ─────────────────────────────────────────────────────────────
function v8_getPayrollRunV8Data_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(V8_SH_RUN);
  if (!sh || sh.getLastRow() < V8_DATA_START) return [];
  const data = sh.getRange(V8_DATA_START, 1, sh.getLastRow() - V8_DATA_START + 1, V8_HEADERS.length).getValues();
  return data.filter(function(r){ return Number(r[V8_COL.AGENT_ID-1]) > 0; }).map(function(r) {
    return {
      weekLabel:  String(r[V8_COL.WEEK_LABEL-1] || '').trim(),
      startDate:  r[V8_COL.START_DATE-1],
      endDate:    r[V8_COL.END_DATE-1],
      ppCode:     String(r[V8_COL.PP_CODE-1] || '').trim(),
      status:     v8_cleanStatus_(r[V8_COL.STATUS-1]),
      agentId:    Number(r[V8_COL.AGENT_ID-1]),
      name:       String(r[V8_COL.AGENT_NAME-1] || '').trim(),
      ruleKey:    String(r[V8_COL.RULE_KEY-1] || '').trim(),
      base:       v8_num_(r[V8_COL.BASE-1]),
      kpiAmt:     v8_num_(r[V8_COL.KPI_AMT-1]),
      missedDed:  v8_num_(r[V8_COL.MISSED_DED-1]),
      otPay:      v8_num_(r[V8_COL.OT_PAY-1]),
      sunPay:     v8_num_(r[V8_COL.SUN_PAY-1]),
      vacPay:     v8_num_(r[V8_COL.VAC_PAY-1]),
      extra:      v8_num_(r[V8_COL.EXTRA-1]),
      total:      v8_num_(r[V8_COL.TOTAL-1])
    };
  });
}

function v8_buildAgentMap_(activeOnly) {
  const sh  = SpreadsheetApp.getActive().getSheetByName(V8_SH_AGENTS);
  const map = {};
  if (!sh || sh.getLastRow() < 4) return map;
  sh.getRange(4, 1, sh.getLastRow() - 3, Math.max(11, sh.getLastColumn())).getValues()
    .forEach(function(r) {
      const id = Number(r[0]);
      if (!id) return;
      const active = String(r[6] || '').trim().toUpperCase() === 'YES';
      if (activeOnly && !active) return;
      map[id] = { id:id, name:v8_cleanText_(r[1]), ruleKey:v8_cleanText_(r[5]), active:active };
    });
  return map;
}

function v8_buildAlumniMap_() {
  const sh  = SpreadsheetApp.getActive().getSheetByName(V8_SH_ALUMNI);
  const map = {};
  if (!sh || sh.getLastRow() < 4) return map;
  sh.getRange(4, 1, sh.getLastRow() - 3, Math.max(10, sh.getLastColumn())).getValues()
    .forEach(function(r) {
      const id = Number(r[0]);
      if (!id) return;
      map[id] = { id:id, name:v8_cleanText_(r[1]), ruleKey:v8_cleanText_(r[4]) };
    });
  return map;
}

function v8_getActiveAgents_() {
  const map = v8_buildAgentMap_(true);
  return Object.keys(map).map(Number).sort(function(a,b){ return a-b; })
    .map(function(id){ return map[id]; });
}

function v8_buildRuleSet_() {
  const sh  = SpreadsheetApp.getActive().getSheetByName(V8_SH_RULES);
  const map = {};
  if (!sh || sh.getLastRow() < 4) return map;
  sh.getRange(4, 1, sh.getLastRow() - 3, Math.max(13, sh.getLastColumn())).getValues()
    .forEach(function(r) {
      const k = v8_cleanText_(r[0]);
      if (!k || k.toUpperCase() === 'RULE KEY') return;
      map[k] = true;
    });
  return map;
}

function v8_latestPayPeriod_(runData) {
  let latest = null;
  runData.forEach(function(r) {
    if (!latest || (r.endDate instanceof Date && r.endDate > latest.endDate)) latest = r;
  });
  return latest ? latest.ppCode : '';
}

function v8_getConfigValue_(key) {
  const sh = SpreadsheetApp.getActive().getSheetByName(V8_SH_CONFIG);
  if (!sh) return '';
  const data = sh.getRange(1, 1, sh.getLastRow(), 2).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) return data[i][1];
  }
  return '';
}

// ─────────────────────────────────────────────────────────────
//  UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────
function v8_cleanText_(v)       { return String(v || '').replace(/\s+/g, ' ').trim(); }

function v8_cleanDepartment_(v) {
  let t = v8_cleanText_(v);
  const low = t.toLowerCase();
  if (low === 'recuirtment' || low === 'recuitment') t = 'Recruitment';
  if (low === 'training')  t = 'Training';
  if (low === 'designer')  t = 'Designer';
  return t;
}

/**
 * Normalises a Rule Key string coming from legacy data:
 *   1. Strips whitespace around every pipe character.
 *   2. Corrects the "RECUIRTMENT" / "RECUITMENT" typo to "RECRUITMENT".
 *   3. Trims leading / trailing whitespace.
 *
 * Called during legacy-block parsing so migrated rows always carry
 * keys that match Pay Rules exactly (e.g. "ADMIN|RECRUITMENT|WEEKDAY").
 *
 * @param {string} rk  Raw rule key text.
 * @returns {string}   Normalised rule key in UPPER CASE.
 */
function v8_normalizeRuleKey_(rk) {
  if (!rk) return '';
  return rk
    .toUpperCase()
    .replace(/\s*\|\s*/g, '|')                       // spaces around pipes → none
    .replace(/\bRECUIRTMENT\b/g, 'RECRUITMENT')      // typo variant 1
    .replace(/\bRECUITMENT\b/g,  'RECRUITMENT')      // typo variant 2
    .trim();
}

function v8_num_(v) {
  const n = Number(String(v || 0).replace(/[$,]/g, ''));
  return isNaN(n) ? 0 : n;
}

function v8_parseMoney_(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v || '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function v8_yesNo_(v, fallback) {
  const t = String(v || '').trim().toUpperCase();
  if (t === 'YES' || t === 'NO') return t;
  return fallback || 'NO';
}

function v8_cleanStatus_(v) {
  const t = String(v || '').replace(/[✅🟡✅🟡]/g, '').trim().toUpperCase();
  if (t === 'PAID')     return 'PAID';
  if (t === 'COMPLETE') return 'COMPLETE';
  if (t === 'UNPAID')   return 'UNPAID';
  if (t.indexOf('PAID') >= 0) return 'PAID';
  return t || 'UNPAID';
}

function v8_dateOnly_(d) {
  const o = new Date(d); o.setHours(0,0,0,0); return o;
}

function v8_mmddyy_(mm, dd, yy) {
  return new Date(2000 + Number(yy), Number(mm) - 1, Number(dd));
}

function v8_payPeriodCode_(endDate) {
  const d  = new Date(endDate);
  const pp = d.getDate() <= 15 ? 'PP1' : 'PP2';
  return ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
          'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'][d.getMonth()] + pp;
}

function v8_inferWeekNumFromDate_(endDate) {
  const d     = new Date(endDate);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  return Math.ceil((d.getDate() + start.getDay()) / 7);
}

function v8_shortDate_(d) {
  return Utilities.formatDate(new Date(d), Session.getScriptTimeZone(), 'MM/dd/yy');
}

function v8_parseMonthYear_(text) {
  const m = String(text || '').trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const names = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
  const idx   = names.map(function(n){ return n.toLowerCase(); }).indexOf(m[1].toLowerCase());
  if (idx < 0) return null;
  return { name:names[idx], monthIndex:idx, year:Number(m[2]) };
}

function v8_colLetter_(col) {
  let s = '';
  while (col > 0) {
    const t = (col - 1) % 26;
    s   = String.fromCharCode(t + 65) + s;
    col = (col - t - 1) / 26;
  }
  return s;
}

function v8_colIndex_(letter) {
  return letter.toUpperCase().charCodeAt(0) - 64;
}

function v8_fmt_(v) {
  return '$' + Number(v||0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function v8_findDuplicates_(arr) {
  const seen = {}, dupes = {};
  arr.forEach(function(x){ seen[x] ? dupes[x]=true : seen[x]=true; });
  return Object.keys(dupes).map(Number);
}

function v8_yesNoValidation_() {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(['YES','NO'], true).setAllowInvalid(false).build();
}

// ─────────────────────────────────────────────────────────────
//  STYLING
// ─────────────────────────────────────────────────────────────
function v8_writeBanner_(sh, subtitle, totalCols) {
  totalCols = totalCols || 10;
  sh.getRange(1, 1, 1, totalCols).merge()
    .setValue('JOI')
    .setBackground(V8_BRAND.navy).setFontColor(V8_BRAND.gold)
    .setFontSize(22).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(1, 46);
  sh.getRange(2, 1, 1, totalCols).merge()
    .setValue(subtitle)
    .setBackground(V8_BRAND.gold).setFontColor(V8_BRAND.navy)
    .setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(2, 24);
}

function v8_styleHeader_(range) {
  range.setBackground(V8_BRAND.navy).setFontColor(V8_BRAND.gold)
    .setFontWeight('bold').setFontSize(9)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
}

// =============================================================
//  VIEWS  (filter Payroll Run v8 by status)
// =============================================================

function v8_viewUnpaidPayroll() {
  var sh = v8_goToRunSheet_();
  if (!sh) return;
  v8_applyStatusFilter_(sh, 'UNPAID');
}

function v8_viewPaidPayroll() {
  var sh = v8_goToRunSheet_();
  if (!sh) return;
  v8_applyStatusFilter_(sh, 'PAID');
}

function v8_viewAllPayroll() {
  var sh = v8_goToRunSheet_();
  if (!sh) return;
  var f = sh.getFilter();
  if (f) f.remove();
  SpreadsheetApp.getUi().alert('✅ All payroll rows are now visible.');
}

function v8_goToRunSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(V8_SH_RUN);
  if (!sh) { SpreadsheetApp.getUi().alert('❌ Payroll Run v8 not found. Run Install first.'); return null; }
  ss.setActiveSheet(sh);
  return sh;
}

function v8_applyStatusFilter_(sh, status) {
  var f = sh.getFilter();
  if (f) f.remove();
  var lastRow = sh.getLastRow();
  if (lastRow < V8_HEADER_ROW) return;
  sh.getRange(V8_HEADER_ROW, 1, lastRow - V8_HEADER_ROW + 1, V8_HEADERS.length).createFilter();
  sh.getFilter().setColumnFilterCriteria(
    V8_COL.STATUS,
    SpreadsheetApp.newFilterCriteria().whenTextEqualTo(status).build()
  );
}

// =============================================================
//  QUICK STATS
// =============================================================

function v8_quickStats() {
  var data = v8_getPayrollRunV8Data_();
  var totalPaid = 0, totalUnpaid = 0;
  var weeks = {}, agentIds = {};
  data.forEach(function(r) {
    if (r.status === 'PAID') totalPaid += r.total;
    else totalUnpaid += r.total;
    weeks[r.weekLabel + '|' + r.ppCode] = true;
    agentIds[r.agentId] = true;
  });
  var activeAgents = v8_getActiveAgents_().length;
  SpreadsheetApp.getUi().alert(
    '📊  JOI Payroll — Quick Stats\n\n' +
    'Grand Total Earned :  ' + v8_fmt_(totalPaid + totalUnpaid) + '\n' +
    'Total Paid Out     :  ' + v8_fmt_(totalPaid) + '\n' +
    'Still Unpaid       :  ' + v8_fmt_(totalUnpaid) + '\n\n' +
    'Week Blocks on File:  ' + Object.keys(weeks).size_ + '\n' +
    'Agents w/ Records  :  ' + Object.keys(agentIds).length + '\n' +
    'Currently Active   :  ' + activeAgents
  );
}

// =============================================================
//  EXPORT PAY STUBS
// =============================================================

function v8_exportPayStubOneAgent() {
  var ui  = SpreadsheetApp.getUi();
  var res = ui.prompt('Export Pay Stub', 'Enter Agent ID:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var id = Number(String(res.getResponseText()).trim());
  if (!id) { ui.alert('❌ Invalid Agent ID.'); return; }
  v8_buildPayStubSheet_([id]);
}

function v8_exportPayStubsAllAgents() {
  var agents = v8_getActiveAgents_();
  if (!agents.length) { SpreadsheetApp.getUi().alert('❌ No active agents found.'); return; }
  v8_buildPayStubSheet_(agents.map(function(a){ return a.id; }));
}

function v8_buildPayStubSheet_(agentIds) {
  var ss   = SpreadsheetApp.getActive();
  var name = 'Pay Stubs ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var sh   = ss.getSheetByName(name);
  if (sh) ss.deleteSheet(sh);
  sh = ss.insertSheet(name);
  v8_writeBanner_(sh, 'PAY STUBS — ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy'), 12);

  var data    = v8_getPayrollRunV8Data_();
  var agentMap = v8_buildAgentMap_(false);
  var alumniMap = v8_buildAlumniMap_();
  var row = 4;

  agentIds.forEach(function(id) {
    var rows = data.filter(function(r){ return r.agentId === id; });
    if (!rows.length) return;
    var info = agentMap[id] || alumniMap[id] || { name: 'Agent ' + id };

    // Agent header
    sh.getRange(row, 1, 1, 12).merge()
      .setValue('AGENT: ' + info.name + '  (ID: ' + id + ')')
      .setBackground(V8_BRAND.navy).setFontColor(V8_BRAND.gold)
      .setFontWeight('bold').setFontSize(11);
    row++;

    // Column headers
    sh.getRange(row, 1, 1, 9).setValues([[
      'Week', 'Pay Period', 'Base', 'KPI', 'Deduction', 'OT', 'Sunday', 'Vacation', 'Total'
    ]]);
    v8_styleHeader_(sh.getRange(row, 1, 1, 9));
    row++;

    // Data rows
    var subtotal = 0;
    rows.forEach(function(r) {
      sh.getRange(row, 1, 1, 9).setValues([[
        r.weekLabel, r.ppCode, r.base, r.kpiAmt, r.missedDed,
        r.otPay, r.sunPay, r.vacPay, r.total
      ]]);
      sh.getRange(row, 3, 1, 7).setNumberFormat('$#,##0.00');
      if (r.status === 'PAID') sh.getRange(row, 1, 1, 9).setBackground(V8_BRAND.greenLight);
      else sh.getRange(row, 1, 1, 9).setBackground(V8_BRAND.yellowLight);
      subtotal += r.total;
      row++;
    });

    // Agent subtotal
    sh.getRange(row, 1, 1, 8).merge()
      .setValue('TOTAL FOR ' + info.name.toUpperCase())
      .setBackground(V8_BRAND.gold).setFontColor(V8_BRAND.navy).setFontWeight('bold').setHorizontalAlignment('right');
    sh.getRange(row, 9).setValue(subtotal).setNumberFormat('$#,##0.00')
      .setBackground(V8_BRAND.gold).setFontColor(V8_BRAND.navy).setFontWeight('bold');
    row += 2; // blank gap between agents
  });

  sh.autoResizeColumns(1, 12);
  ss.setActiveSheet(sh);
  SpreadsheetApp.getUi().alert('✅ Pay stubs generated on sheet "' + name + '".');
}

// =============================================================
//  ADD NEW WEEK — PAYROLL RUN  (key weekly workflow function)
// =============================================================

function v8_addNewWeekPayrollRun() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(V8_SH_RUN);
  if (!sh) { ui.alert('❌ Payroll Run v8 not found. Run Install first.'); return; }

  // ── Step 1: Auto-detect next week from the last entry in Payroll Run v8 ──
  var lastRow = sh.getLastRow();
  var suggestedStart, suggestedEnd, suggestedWeekNum = 1;

  if (lastRow >= V8_DATA_START) {
    var scanData = sh.getRange(V8_DATA_START, 1, lastRow - V8_DATA_START + 1, 3).getValues();
    var latestEnd = null;
    scanData.forEach(function(r) {
      var wl = String(r[0] || '');
      var m  = wl.match(/WEEK\s*(\d+)/i);
      if (m) suggestedWeekNum = Math.max(suggestedWeekNum, Number(m[1]) + 1);
      // End date is column C (index 2).  Sheets may return a Date or a number.
      var raw = r[2];
      var ed  = (raw instanceof Date) ? raw
              : (typeof raw === 'number' && raw > 0) ? new Date(Math.round((raw - 25569) * 86400000)) : null;
      if (ed && (!latestEnd || ed > latestEnd)) latestEnd = ed;
    });
    if (latestEnd) {
      suggestedStart = new Date(latestEnd.getTime());
      suggestedStart.setDate(suggestedStart.getDate() + 1);
    }
  }
  if (!suggestedStart) suggestedStart = new Date();
  suggestedEnd = new Date(suggestedStart.getTime());
  suggestedEnd.setDate(suggestedEnd.getDate() + 6);

  var tz = Session.getScriptTimeZone();

  // ── Step 2: Show suggested dates and let the user override end date ──
  // We ask for the END date because pay period code is derived from it.
  var suggestedEndStr = Utilities.formatDate(suggestedEnd, tz, 'MM/dd/yy');
  var endResp = ui.prompt(
    'Add New Week — End Date',
    'Suggested week end date: ' + suggestedEndStr + '\n\n' +
    'Press OK to accept, or type a different end date (MM/DD/YY):\n' +
    'Example: 05/03/26  for May 3, 2026',
    ui.ButtonSet.OK_CANCEL
  );
  if (endResp.getSelectedButton() !== ui.Button.OK) return;

  var endInput = String(endResp.getResponseText() || '').trim();
  var finalEnd;
  if (!endInput) {
    finalEnd = suggestedEnd;
  } else {
    var parts = endInput.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!parts) { ui.alert('❌ Date format not recognised. Use MM/DD/YY (e.g. 05/03/26).'); return; }
    var yr = Number(parts[3]);
    if (yr < 100) yr += 2000;
    finalEnd = new Date(yr, Number(parts[1]) - 1, Number(parts[2]));
  }

  // Derive start from end (7-day week back)
  var finalStart = new Date(finalEnd.getTime());
  finalStart.setDate(finalEnd.getDate() - 6);

  // ── Step 3: Let the user confirm or override the Week Label ──
  var ppCode    = v8_payPeriodCode_(finalEnd);
  var autoLabel = 'WEEK ' + suggestedWeekNum;
  var startStr  = Utilities.formatDate(finalStart, tz, 'MM/dd/yy');
  var endStr    = Utilities.formatDate(finalEnd,   tz, 'MM/dd/yy');

  var labelResp = ui.prompt(
    'Add New Week — Week Label',
    'Confirm details:\n\n' +
    '  Start Date :  ' + startStr + '\n' +
    '  End Date   :  ' + endStr + '\n' +
    '  Pay Period :  ' + ppCode + '\n\n' +
    'Week Label (press OK to use "' + autoLabel + '", or type a custom label):',
    ui.ButtonSet.OK_CANCEL
  );
  if (labelResp.getSelectedButton() !== ui.Button.OK) return;

  var labelInput = String(labelResp.getResponseText() || '').trim().toUpperCase();
  var weekLabel  = labelInput || autoLabel;

  // ── Step 4: Final confirmation ──
  var confirm = ui.alert(
    'Add New Week — Confirm',
    '✅  Adding payroll week:\n\n' +
    '  Week Label :  ' + weekLabel + '\n' +
    '  Start Date :  ' + startStr + '\n' +
    '  End Date   :  ' + endStr + '\n' +
    '  Pay Period :  ' + ppCode + '\n\n' +
    'Rows will be created for ALL active agents with status UNPAID.\n\nProceed?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  // ── Step 5: Write rows ──
  var agents = v8_getActiveAgents_();
  if (!agents.length) { ui.alert('❌ No active agents found in the Agents sheet.'); return; }

  var insertRow = (lastRow < V8_DATA_START ? V8_DATA_START : lastRow + 1);
  var rows = agents.map(function(a) {
    return [
      weekLabel, v8_dateOnly_(finalStart), v8_dateOnly_(finalEnd), ppCode, 'UNPAID',
      a.id, '', '', 'YES',
      0, 0, 0, 0, 'NO',
      0, 0, 0, 0, 0, 0, 0, 0, '', '', '', ''
    ];
  });

  sh.getRange(insertRow, 1, rows.length, V8_HEADERS.length).setValues(rows);
  v8_writeFormulaBlock_(sh, insertRow, rows.length);
  v8_formatRowRange_(sh, insertRow, rows.length, rows.map(function(){ return 'UNPAID'; }));

  ss.setActiveSheet(sh);
  sh.setActiveRange(sh.getRange(insertRow, V8_COL.MISSED));

  ui.alert(
    '✅ ' + rows.length + ' rows added for ' + weekLabel + ' (' + ppCode + ').\n\n' +
    'You are now on the first data row.\n\n' +
    'Fill in for each agent:\n' +
    '  Col J — Missed Days\n' +
    '  Col K — Overtime Days\n' +
    '  Col L — Sundays Worked\n' +
    '  Col M — Vacation Days\n' +
    '  Col N — KPI (YES / NO)\n' +
    '  Col U — Extra Bonus / Spiffs\n\n' +
    'Columns O–V calculate automatically.\n' +
    'When done paying → "6. Lock Selected Week as PAID"'
  );
}

// =============================================================
//  ADD NEW WEEK — MONTHLY PAY SHEET
// =============================================================

function v8_addNewWeekMonthlyPaySheet() {
  var ui   = SpreadsheetApp.getUi();
  var resp = ui.prompt(
    'Refresh Monthly Pay Sheet',
    'Enter month and year (example: May 2026):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var text = String(resp.getResponseText() || '').trim();
  if (text) v8_refreshMonthlySheet_(text);
}

// =============================================================
//  START NEW MONTH — CREATE PAY SHEET
// =============================================================

function v8_startNewMonthCreatePaySheet() {
  var ui = SpreadsheetApp.getUi();
  // Suggest next calendar month
  var today = new Date();
  var months = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
  var nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  var suggestion = months[nextMonth.getMonth()] + ' ' + nextMonth.getFullYear();

  var resp = ui.prompt(
    'Start New Month — Create Pay Sheet',
    'Enter the month to create (suggested: ' + suggestion + '):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var text = String(resp.getResponseText() || '').trim() || suggestion;
  v8_refreshMonthlySheet_(text);
}

// =============================================================
//  FILL IN WEEKLY PAY AMOUNTS
// =============================================================

function v8_fillInWeeklyPayAmounts() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(V8_SH_RUN);
  if (!sh) { ui.alert('❌ Payroll Run v8 not found.'); return; }

  // Navigate to the sheet and show guidance
  ss.setActiveSheet(sh);

  // Find the last UNPAID week
  var lastRow = sh.getLastRow();
  if (lastRow < V8_DATA_START) { ui.alert('No payroll data found yet. Use "Add New Week" first.'); return; }

  var data = sh.getRange(V8_DATA_START, 1, lastRow - V8_DATA_START + 1, V8_HEADERS.length).getValues();
  var unpaidWeeks = {};
  data.forEach(function(r) {
    var status = v8_cleanStatus_(r[V8_COL.STATUS - 1]);
    if (status === 'UNPAID') {
      var key = String(r[V8_COL.WEEK_LABEL - 1]) + '|' + String(r[V8_COL.PP_CODE - 1]);
      unpaidWeeks[key] = true;
    }
  });

  var weekList = Object.keys(unpaidWeeks);
  if (!weekList.length) {
    ui.alert('ℹ️ No UNPAID weeks found. All weeks are locked as PAID.');
    return;
  }

  // Scroll to first UNPAID row and highlight the input columns
  for (var i = 0; i < data.length; i++) {
    if (v8_cleanStatus_(data[i][V8_COL.STATUS - 1]) === 'UNPAID') {
      var firstUnpaidRow = V8_DATA_START + i;
      sh.setActiveRange(sh.getRange(firstUnpaidRow, V8_COL.MISSED));
      break;
    }
  }

  ui.alert(
    'Fill In Weekly Pay Amounts\n\n' +
    'UNPAID weeks found:\n  ' + weekList.join('\n  ') + '\n\n' +
    'You are now on the first UNPAID row.\n\n' +
    'Columns to fill in for each agent:\n' +
    '  J — Missed Days\n' +
    '  K — Overtime Days\n' +
    '  L — Sundays Worked\n' +
    '  M — Vacation Days\n' +
    '  N — KPI Achieved (YES/NO)\n' +
    '  U — Extra Bonus / Spiffs\n\n' +
    'Columns O–V calculate automatically from Pay Rules.'
  );
}

// =============================================================
//  COMPLETE WEEK — AUTO NEXT WEEK
// =============================================================

function v8_completeWeekAutoNextWeek() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    'Complete Week — Auto Next Week',
    'This will:\n' +
    '  1. Lock the currently selected week as PAID\n' +
    '  2. Immediately create the next week\'s rows for all active agents\n\n' +
    'Open "Payroll Run v8", select any row in the week you want to lock, then click OK.\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  // Step 1: Lock selected week
  v8_lockSelectedWeekAsPaid();

  // Step 2: Add next week
  v8_addNewWeekPayrollRun();
}

// =============================================================
//  REMOVE A WEEK — PAYROLL RUN
// =============================================================

function v8_removeWeekPayrollRun() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(V8_SH_RUN);
  if (!sh) { ui.alert('❌ Payroll Run v8 not found.'); return; }

  var resp = ui.prompt(
    'Remove a Week — Payroll Run',
    'Enter the Week Label to remove (e.g. "WEEK 5").\n\nWARNING: PAID weeks cannot be removed.',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var target = String(resp.getResponseText() || '').trim().toUpperCase();
  if (!target) return;

  var lastRow = sh.getLastRow();
  if (lastRow < V8_DATA_START) { ui.alert('No payroll data found.'); return; }

  var data = sh.getRange(V8_DATA_START, 1, lastRow - V8_DATA_START + 1, V8_HEADERS.length).getValues();
  var toDelete = [];
  data.forEach(function(r, i) {
    var wl = String(r[V8_COL.WEEK_LABEL - 1] || '').trim().toUpperCase();
    if (wl === target) {
      if (v8_cleanStatus_(r[V8_COL.STATUS - 1]) === 'PAID') {
        ui.alert('❌ Cannot remove ' + target + ' — it is already PAID and locked.');
        return;
      }
      toDelete.push(V8_DATA_START + i);
    }
  });

  if (!toDelete.length) { ui.alert('❌ No UNPAID rows found for "' + target + '".'); return; }

  var confirm = ui.alert(
    'Confirm Remove',
    'Delete ' + toDelete.length + ' rows for "' + target + '"?\nThis cannot be undone.',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  // Delete from bottom up to preserve row indices
  for (var i = toDelete.length - 1; i >= 0; i--) sh.deleteRow(toDelete[i]);
  ui.alert('✅ Removed ' + toDelete.length + ' rows for ' + target + '.');
}

// =============================================================
//  REMOVE A WEEK — MONTHLY PAY SHEET
// =============================================================

function v8_removeWeekMonthlyPaySheet() {
  var ui   = SpreadsheetApp.getUi();
  var resp = ui.prompt(
    'Remove Monthly Pay Sheet',
    'Enter the month and year of the sheet to delete (e.g. "May 2026"):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var text   = String(resp.getResponseText() || '').trim();
  var parsed = v8_parseMonthYear_(text);
  if (!parsed) { ui.alert('❌ Could not parse "' + text + '". Use format: May 2026'); return; }

  var sheetName = parsed.name + ' ' + String(parsed.year).slice(-2) + ' PayRoll';
  var sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sh) { ui.alert('❌ Sheet "' + sheetName + '" not found.'); return; }

  var confirm = ui.alert('Delete sheet "' + sheetName + '"?', ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;
  SpreadsheetApp.getActive().deleteSheet(sh);
  ui.alert('✅ Sheet "' + sheetName + '" deleted.');
}

// =============================================================
//  MARK A PAY PERIOD AS PAID
// =============================================================

function v8_markPayPeriodAsPaid() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt(
    'Mark Pay Period as PAID',
    'Enter the Pay Period code to mark as PAID (e.g. "MAYPP1" or "MAYPP2"):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var target = String(resp.getResponseText() || '').trim().toUpperCase();
  if (!target) return;

  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(V8_SH_RUN);
  if (!sh) { ui.alert('❌ Payroll Run v8 not found.'); return; }

  var lastRow = sh.getLastRow();
  if (lastRow < V8_DATA_START) { ui.alert('No payroll data found.'); return; }
  var data = sh.getRange(V8_DATA_START, 1, lastRow - V8_DATA_START + 1, V8_HEADERS.length).getValues();

  var count = 0;
  data.forEach(function(r, i) {
    var pp = String(r[V8_COL.PP_CODE - 1] || '').trim().toUpperCase();
    if (pp !== target) return;
    var sheetRow = V8_DATA_START + i;
    sh.getRange(sheetRow, V8_COL.STATUS).setValue('PAID');
    sh.getRange(sheetRow, V8_COL.LOCK_TS).setValue(new Date()).setNumberFormat('yyyy-mm-dd hh:mm');
    v8_freezePayrollRow_(sh, sheetRow);
    sh.getRange(sheetRow, V8_COL.STATUS)
      .setBackground(V8_BRAND.greenLight).setFontColor(V8_BRAND.green).setFontWeight('bold');
    count++;
  });

  if (!count) { ui.alert('❌ No rows found for pay period "' + target + '".'); return; }
  ui.alert('✅ Marked ' + count + ' rows as PAID for pay period ' + target + '.');
}

// =============================================================
//  AGENT MANAGEMENT
// =============================================================

function v8_fixLastWeekRemoveInactiveAgents() {
  v8_removeInactiveAgentsFromWeek_(null); // null = auto-detect last week
}

function v8_cleanUpAnyWeekInactiveAgents() {
  var ui   = SpreadsheetApp.getUi();
  var resp = ui.prompt(
    'Clean Up Week — Remove Inactive Agents',
    'Enter Week Label (e.g. "WEEK 5"), or leave blank to clean ALL unpaid weeks:',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var week = String(resp.getResponseText() || '').trim().toUpperCase() || null;
  v8_removeInactiveAgentsFromWeek_(week);
}

function v8_removeInactiveAgentsFromWeek_(weekLabelFilter) {
  var ui  = SpreadsheetApp.getUi();
  var ss  = SpreadsheetApp.getActive();
  var sh  = ss.getSheetByName(V8_SH_RUN);
  if (!sh) { ui.alert('❌ Payroll Run v8 not found.'); return; }

  var activeMap = v8_buildAgentMap_(true); // active only
  var lastRow   = sh.getLastRow();
  if (lastRow < V8_DATA_START) { ui.alert('No payroll data found.'); return; }

  var data    = sh.getRange(V8_DATA_START, 1, lastRow - V8_DATA_START + 1, V8_HEADERS.length).getValues();
  var toDelete = [];

  // If no week specified, auto-detect the most recent UNPAID week
  if (!weekLabelFilter) {
    var lastUnpaidWeek = null;
    data.forEach(function(r) {
      if (v8_cleanStatus_(r[V8_COL.STATUS - 1]) === 'UNPAID') {
        lastUnpaidWeek = String(r[V8_COL.WEEK_LABEL - 1] || '').trim().toUpperCase();
      }
    });
    weekLabelFilter = lastUnpaidWeek;
  }

  if (!weekLabelFilter) { ui.alert('No UNPAID weeks found.'); return; }

  data.forEach(function(r, i) {
    var wl     = String(r[V8_COL.WEEK_LABEL - 1] || '').trim().toUpperCase();
    var status = v8_cleanStatus_(r[V8_COL.STATUS - 1]);
    var id     = Number(r[V8_COL.AGENT_ID - 1]);
    var matchesWeek = (weekLabelFilter === null || wl === weekLabelFilter);
    if (matchesWeek && status === 'UNPAID' && id && !activeMap[id]) {
      toDelete.push(V8_DATA_START + i);
    }
  });

  if (!toDelete.length) {
    ui.alert('✅ No inactive agent rows found in ' + (weekLabelFilter || 'unpaid weeks') + '.');
    return;
  }

  var confirm = ui.alert(
    'Remove ' + toDelete.length + ' row(s) for inactive agents in ' + weekLabelFilter + '?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  for (var i = toDelete.length - 1; i >= 0; i--) sh.deleteRow(toDelete[i]);
  ui.alert('✅ Removed ' + toDelete.length + ' inactive agent row(s) from ' + weekLabelFilter + '.');
}

function v8_archiveInactiveAgentsToAlumni() {
  var ui  = SpreadsheetApp.getUi();
  var ss  = SpreadsheetApp.getActive();
  var shA = ss.getSheetByName(V8_SH_AGENTS);
  var shL = ss.getSheetByName(V8_SH_ALUMNI);
  if (!shA) { ui.alert('❌ Agents sheet not found.'); return; }
  if (!shL) { ui.alert('❌ Alumni sheet not found.'); return; }

  var lastRowA = shA.getLastRow();
  if (lastRowA < 4) { ui.alert('No agent data found.'); return; }

  var data  = shA.getRange(4, 1, lastRowA - 3, Math.max(11, shA.getLastColumn())).getValues();
  var toArchive = [];
  var toDeleteRows = [];

  data.forEach(function(r, i) {
    var id     = Number(r[0]);
    var active = String(r[6] || '').trim().toUpperCase();
    if (id && active !== 'YES') {
      toArchive.push(r);
      toDeleteRows.push(4 + i);
    }
  });

  if (!toArchive.length) { ui.alert('✅ No inactive agents found to archive.'); return; }

  var confirm = ui.alert(
    'Archive ' + toArchive.length + ' inactive agent(s) to Alumni?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  // Append to Alumni
  var lastRowL = shL.getLastRow();
  var insertAt = Math.max(lastRowL + 1, 4);
  toArchive.forEach(function(r, i) {
    // Alumni cols: ID, Name, Campaign, Department, Shift, Rule Key, Archive Date
    shL.getRange(insertAt + i, 1, 1, 7).setValues([[
      r[0], r[1], r[2], r[3], r[4], r[5], new Date()
    ]]);
  });

  // Delete from Agents bottom-up
  for (var i = toDeleteRows.length - 1; i >= 0; i--) shA.deleteRow(toDeleteRows[i]);

  ui.alert('✅ Archived ' + toArchive.length + ' agent(s) to Alumni and removed from Agents sheet.');
}

function v8_markAlumniPayoutAsPaid() {
  var ui   = SpreadsheetApp.getUi();
  var resp = ui.prompt(
    'Mark Alumni Payout as PAID',
    'Enter Alumni Agent ID to mark all their rows as PAID:',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var id = Number(String(resp.getResponseText()).trim());
  if (!id) { ui.alert('❌ Invalid Agent ID.'); return; }

  var ss   = SpreadsheetApp.getActive();
  var sh   = ss.getSheetByName(V8_SH_RUN);
  if (!sh) { ui.alert('❌ Payroll Run v8 not found.'); return; }

  var lastRow = sh.getLastRow();
  if (lastRow < V8_DATA_START) { ui.alert('No payroll data found.'); return; }
  var data    = sh.getRange(V8_DATA_START, 1, lastRow - V8_DATA_START + 1, V8_HEADERS.length).getValues();
  var count   = 0;
  data.forEach(function(r, i) {
    if (Number(r[V8_COL.AGENT_ID - 1]) !== id) return;
    if (v8_cleanStatus_(r[V8_COL.STATUS - 1]) === 'PAID') return;
    var sheetRow = V8_DATA_START + i;
    sh.getRange(sheetRow, V8_COL.STATUS).setValue('PAID');
    sh.getRange(sheetRow, V8_COL.LOCK_TS).setValue(new Date()).setNumberFormat('yyyy-mm-dd hh:mm');
    v8_freezePayrollRow_(sh, sheetRow);
    sh.getRange(sheetRow, V8_COL.STATUS)
      .setBackground(V8_BRAND.greenLight).setFontColor(V8_BRAND.green).setFontWeight('bold');
    count++;
  });

  if (!count) ui.alert('No UNPAID rows found for Agent ID ' + id + '.');
  else ui.alert('✅ Marked ' + count + ' row(s) as PAID for Agent ID ' + id + '.');
}

// =============================================================
//  SYSTEM CHECK
// =============================================================

function v8_systemCheck() {
  var ss     = SpreadsheetApp.getActive();
  var issues = [];

  // Required sheets
  [V8_SH_RULES, V8_SH_AGENTS, V8_SH_ALUMNI, V8_SH_RUN].forEach(function(name) {
    if (!ss.getSheetByName(name)) issues.push('❌ Missing sheet: ' + name);
  });

  // Agent / rule key counts
  var agentMap  = v8_buildAgentMap_(false);
  var alumniMap = v8_buildAlumniMap_();
  var ruleSet   = v8_buildRuleSet_();
  var activeCount = 0;
  Object.keys(agentMap).forEach(function(id) { if (agentMap[id].active) activeCount++; });

  // Unknown rule keys in Agents
  var badRuleAgents = [];
  Object.keys(agentMap).forEach(function(id) {
    var rk = v8_normalizeRuleKey_(agentMap[id].ruleKey);
    if (rk && !ruleSet[rk]) badRuleAgents.push('Agent ' + id + ': ' + rk);
  });
  if (badRuleAgents.length) issues.push('⚠️ Agents with unknown Rule Keys:\n    ' + badRuleAgents.join('\n    '));

  // Payroll Run v8 row count
  var shRun    = ss.getSheetByName(V8_SH_RUN);
  var rowCount = shRun ? Math.max(0, shRun.getLastRow() - V8_DATA_START + 1) : 0;

  var msg =
    '🔍  JOI Payroll — System Check\n\n' +
    'Active Agents  :  ' + activeCount + '\n' +
    'Alumni         :  ' + Object.keys(alumniMap).length + '\n' +
    'Pay Rules      :  ' + Object.keys(ruleSet).length + '\n' +
    'Payroll Rows   :  ' + rowCount + '\n\n';

  if (issues.length) msg += '⚠️  Issues found:\n' + issues.join('\n') + '\n\n';
  else msg += '✅  No structural issues detected.\n\n';
  msg += 'Run "3. Run Validation" for full data-level checks.';

  SpreadsheetApp.getUi().alert(msg);
}

// =============================================================
//  FORMATTING UTILITIES
// =============================================================

function v8_fixColumnFormatting() {
  var sh = SpreadsheetApp.getActive().getSheetByName(V8_SH_RUN);
  if (!sh) { SpreadsheetApp.getUi().alert('❌ Payroll Run v8 not found.'); return; }
  var lastRow = sh.getLastRow();
  var count   = Math.max(0, lastRow - V8_DATA_START + 1);
  if (!count) { SpreadsheetApp.getUi().alert('No data rows to format.'); return; }

  sh.getRange(V8_DATA_START, V8_COL.START_DATE, count, 2).setNumberFormat('yyyy-mm-dd');
  sh.getRange(V8_DATA_START, V8_COL.BASE,        count, 8).setNumberFormat('$#,##0.00');
  sh.getRange(V8_DATA_START, V8_COL.AGENT_ID,    count, 1).setHorizontalAlignment('center');
  sh.getRange(V8_DATA_START, V8_COL.STATUS,       count, 1).setHorizontalAlignment('center');
  sh.getRange(V8_DATA_START, V8_COL.INCLUDE,      count, 1).setDataValidation(v8_yesNoValidation_());
  sh.getRange(V8_DATA_START, V8_COL.KPI,          count, 1).setDataValidation(v8_yesNoValidation_());
  sh.autoResizeColumns(1, V8_HEADERS.length);
  SpreadsheetApp.getUi().alert('✅ Column formatting applied to Payroll Run v8.');
}

function v8_fixStylingAllSheets() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActive();
  var fixed = [];

  // Re-apply banner + header styles on every v8 sheet
  var sheetDefs = [
    { name: V8_SH_RUN,   subtitle: 'PAYROLL RUN — SINGLE SOURCE OF TRUTH', cols: V8_HEADERS.length },
    { name: V8_SH_DASH,  subtitle: 'JOI PAYROLL — DASHBOARD',            cols: 12 }
  ];
  sheetDefs.forEach(function(def) {
    var sh = ss.getSheetByName(def.name);
    if (!sh) return;
    sh.getRange(1, 1, 1, def.cols).setBackground(V8_BRAND.navy).setFontColor(V8_BRAND.gold)
      .setFontSize(22).setFontWeight('bold').setHorizontalAlignment('center');
    sh.getRange(2, 1, 1, def.cols).setBackground(V8_BRAND.gold).setFontColor(V8_BRAND.navy)
      .setFontSize(10).setFontWeight('bold').setHorizontalAlignment('center');
    fixed.push(def.name);
  });
  ui.alert('✅ Styling refreshed on: ' + fixed.join(', ') + '\n\nFor a full rebuild use "Initialize — Brand All Sheets".');
}

function v8_initializeBrandAllSheets() {
  var ui   = SpreadsheetApp.getUi();
  var resp = ui.alert(
    'Initialize — Brand All Sheets',
    'Rebuild banners and header rows on Dashboard v8, Payroll Run v8, and all Monthly sheets.\n\nData is NOT deleted.\n\nContinue?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  var ss   = SpreadsheetApp.getActive();
  var done = [];

  // Payroll Run v8
  var shRun = ss.getSheetByName(V8_SH_RUN);
  if (shRun) {
    v8_writeBanner_(shRun, 'PAYROLL RUN — SINGLE SOURCE OF TRUTH', V8_HEADERS.length);
    shRun.getRange(V8_HEADER_ROW, 1, 1, V8_HEADERS.length).setValues([V8_HEADERS]);
    v8_styleHeader_(shRun.getRange(V8_HEADER_ROW, 1, 1, V8_HEADERS.length));
    shRun.setFrozenRows(V8_HEADER_ROW);
    done.push(V8_SH_RUN);
  }

  // Dashboard v8 — full rebuild
  var shDash = ss.getSheetByName(V8_SH_DASH);
  if (shDash) {
    v8_refreshDashboard();
    done.push(V8_SH_DASH);
  }

  // Any Monthly v8 sheets
  ss.getSheets().forEach(function(sh) {
    var n = sh.getName();
    if (n.indexOf('PayRoll') >= 0 && n !== V8_SH_RUN && n !== V8_SH_LEGACY_RUN) {
      var cols = Math.max(sh.getLastColumn(), 10);
      sh.getRange(1, 1, 1, cols).setBackground(V8_BRAND.navy).setFontColor(V8_BRAND.gold)
        .setFontSize(22).setFontWeight('bold').setHorizontalAlignment('center');
      sh.getRange(2, 1, 1, cols).setBackground(V8_BRAND.gold).setFontColor(V8_BRAND.navy)
        .setFontSize(10).setFontWeight('bold').setHorizontalAlignment('center');
      done.push(n);
    }
  });

  ui.alert('✅ Branding applied to:\n' + done.join('\n'));
}

function v8_fixPayRulesHeaders() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(V8_SH_RULES);
  if (!sh) { SpreadsheetApp.getUi().alert('❌ Pay Rules sheet not found.'); return; }

  var headers = ['Rule Key','Campaign','Department','Shift Type',
                 'Notes','Weekly Base Pay','Vacation Multiplier','KPI Bonus',
                 'Missed Day Deduction','OT Day Pay','Sunday Pay','Vacation Day Pay'];
  sh.getRange(3, 1, 1, headers.length).setValues([headers]);
  v8_styleHeader_(sh.getRange(3, 1, 1, headers.length));
  sh.setFrozenRows(3);
  sh.autoResizeColumns(1, headers.length);
  SpreadsheetApp.getUi().alert('✅ Pay Rules headers restored.');
}

function v8_fixAgentsHeaders() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(V8_SH_AGENTS);
  if (!sh) { SpreadsheetApp.getUi().alert('❌ Agents sheet not found.'); return; }

  var headers = ['Agent ID','Agent Name','Campaign','Department','Shift Type',
                 'Rule Key','Active','Phone','Email','Start Date','Validation'];
  sh.getRange(3, 1, 1, headers.length).setValues([headers]);
  v8_styleHeader_(sh.getRange(3, 1, 1, headers.length));
  sh.setFrozenRows(3);
  sh.autoResizeColumns(1, headers.length);
  SpreadsheetApp.getUi().alert('✅ Agents headers restored.');
}

function v8_testJOILogoSetup() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(V8_SH_DASH) || ss.getSheetByName(V8_SH_RUN);
  if (!sh) { ui.alert('❌ No v8 sheet found to test on.'); return; }

  var cell = sh.getRange(1, 1);
  var bg   = cell.getBackground();
  var fc   = cell.getFontColor();
  var val  = String(cell.getValue() || '');

  ui.alert(
    '🎨  JOI Logo / Banner Test\n\n' +
    'Sheet     :  ' + sh.getName() + '\n' +
    'Cell A1   :  "' + val + '"\n' +
    'Background:  ' + bg  + (bg  === V8_BRAND.navy ? ' ✅' : ' ❌ expected ' + V8_BRAND.navy) + '\n' +
    'Font Color:  ' + fc  + (fc  === V8_BRAND.gold ? ' ✅' : ' ❌ expected ' + V8_BRAND.gold) + '\n\n' +
    (val === 'JOI' ? '✅ Banner text is correct.' : '⚠️ Banner text should be "JOI" — run "Initialize — Brand All Sheets" to fix.')
  );
}

// =============================================================
//  ROW FORMAT HELPER  (for newly added rows at any position)
// =============================================================

/**
 * Applies standard Payroll Run v8 formatting to a range starting at any row.
 * Used by v8_addNewWeekPayrollRun and similar functions.
 */
function v8_formatRowRange_(sh, startRow, count, statusArr) {
  if (!count) return;
  var lastCol = v8_colLetter_(V8_HEADERS.length);

  sh.getRange(startRow, 1, count, V8_HEADERS.length).setFontSize(9).setVerticalAlignment('middle');
  sh.getRange(startRow, V8_COL.START_DATE, count, 2).setNumberFormat('yyyy-mm-dd');
  sh.getRange(startRow, V8_COL.BASE,       count, 8).setNumberFormat('$#,##0.00');
  sh.getRange(startRow, V8_COL.AGENT_ID,   count, 1).setHorizontalAlignment('center');
  sh.getRange(startRow, V8_COL.STATUS,     count, 1).setHorizontalAlignment('center');
  sh.getRange(startRow, V8_COL.INCLUDE,    count, 1).setDataValidation(v8_yesNoValidation_());
  sh.getRange(startRow, V8_COL.KPI,        count, 1).setDataValidation(v8_yesNoValidation_());

  // Alternating backgrounds
  sh.getRange(startRow, 1, count, V8_HEADERS.length).setBackground(V8_BRAND.white);
  var oddRanges = [];
  for (var i = 1; i < count; i += 2) {
    oddRanges.push('A' + (startRow + i) + ':' + lastCol + (startRow + i));
  }
  if (oddRanges.length) sh.getRangeList(oddRanges).setBackground(V8_BRAND.goldSubtle);

  // Status colors — UNPAID (yellow) / COMPLETE (blue) / PAID (green)
  var paidCells = [], completeCells = [], unpaidCells = [];
  statusArr.forEach(function(s, i) {
    var cell = 'E' + (startRow + i);
    if (s === 'PAID')          paidCells.push(cell);
    else if (s === 'COMPLETE') completeCells.push(cell);
    else                       unpaidCells.push(cell);
  });
  if (paidCells.length)
    sh.getRangeList(paidCells).setBackground(V8_BRAND.greenLight).setFontColor(V8_BRAND.green).setFontWeight('bold');
  if (completeCells.length)
    sh.getRangeList(completeCells).setBackground('#E3F2FD').setFontColor('#1565C0').setFontWeight('bold');
  if (unpaidCells.length)
    sh.getRangeList(unpaidCells).setBackground(V8_BRAND.yellowLight).setFontColor('#7a4f00').setFontWeight('bold');
}

// =============================================================
//  MARK WEEK AS COMPLETE  (UNPAID → COMPLETE with memo)
// =============================================================

function v8_markWeekAsComplete() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(V8_SH_RUN);
  if (!sh) { ui.alert('❌ Payroll Run sheet not found.'); return; }

  var lastRow = sh.getLastRow();
  if (lastRow < V8_DATA_START) { ui.alert('No payroll data found yet.'); return; }

  var data = sh.getRange(V8_DATA_START, 1, lastRow - V8_DATA_START + 1, V8_HEADERS.length).getValues();
  var weekMap = {};

  data.forEach(function(r, i) {
    var status = v8_cleanStatus_(r[V8_COL.STATUS - 1]);
    if (status !== 'UNPAID') return;
    var wl = String(r[V8_COL.WEEK_LABEL - 1] || '').trim();
    var pp = String(r[V8_COL.PP_CODE    - 1] || '').trim();
    if (!wl) return;
    var key = wl + '|' + pp;
    if (!weekMap[key]) weekMap[key] = { weekLabel:wl, ppCode:pp, rows:[], totalPay:0, hasBlanks:false };
    var total = v8_num_(r[V8_COL.TOTAL - 1]);
    var kpi   = String(r[V8_COL.KPI - 1] || '').trim();
    weekMap[key].rows.push({ sheetRow: V8_DATA_START + i, agentId: r[V8_COL.AGENT_ID-1],
                             name: r[V8_COL.AGENT_NAME-1], total: total, kpi: kpi });
    weekMap[key].totalPay += total;
    if (!kpi) weekMap[key].hasBlanks = true;
  });

  var weekKeys = Object.keys(weekMap);
  if (!weekKeys.length) {
    ui.alert('ℹ️ No UNPAID weeks found.\nAll weeks are already COMPLETE or PAID.');
    return;
  }

  var weekList = weekKeys.map(function(k, i) {
    var w = weekMap[k];
    return (i+1) + '.  ' + w.weekLabel + '  (' + w.ppCode + ')  —  ' +
           w.rows.length + ' agents  —  ' + v8_fmt_(w.totalPay) +
           (w.hasBlanks ? '  ⚠️ KPI missing for some agents' : '');
  }).join('\n');

  var pickResp = ui.prompt(
    'Mark Week as Complete — Select Week',
    'UNPAID weeks:\n\n' + weekList + '\n\nType the number of the week to mark COMPLETE:',
    ui.ButtonSet.OK_CANCEL
  );
  if (pickResp.getSelectedButton() !== ui.Button.OK) return;
  var pick = parseInt(String(pickResp.getResponseText()).trim(), 10) - 1;
  if (isNaN(pick) || pick < 0 || pick >= weekKeys.length) { ui.alert('❌ Invalid selection.'); return; }

  var chosen = weekMap[weekKeys[pick]];

  var summary = chosen.rows.map(function(r) {
    return '  ' + String(r.agentId).padStart(3) + '  ' +
           String(r.name || '').substring(0, 20).padEnd(20) +
           '  KPI: ' + (r.kpi || '—').padEnd(3) +
           '  ' + v8_fmt_(r.total);
  }).join('\n');

  var memoResp = ui.prompt(
    'Review: ' + chosen.weekLabel + ' (' + chosen.ppCode + ')',
    'AGENT SUMMARY:\n\n' + summary +
    '\n\n──────────────────────\nWEEK TOTAL: ' + v8_fmt_(chosen.totalPay) +
    '\n\nAdd a memo / note (optional — press OK to skip):',
    ui.ButtonSet.OK_CANCEL
  );
  if (memoResp.getSelectedButton() !== ui.Button.OK) return;
  var memo = String(memoResp.getResponseText() || '').trim();

  var confirm = ui.alert(
    'Confirm: Mark as COMPLETE?',
    chosen.weekLabel + ' / ' + chosen.ppCode +
    '\n' + chosen.rows.length + ' agents  —  ' + v8_fmt_(chosen.totalPay) +
    (memo ? '\nMemo: ' + memo : '') +
    '\n\nCOMPLETE = verified, still editable until marked PAID.\nContinue?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  chosen.rows.forEach(function(r) {
    sh.getRange(r.sheetRow, V8_COL.STATUS)
      .setValue('COMPLETE')
      .setBackground('#E3F2FD').setFontColor('#1565C0').setFontWeight('bold');
    if (memo) {
      var cur = String(sh.getRange(r.sheetRow, V8_COL.PARTIAL).getValue() || '').trim();
      if (!cur) sh.getRange(r.sheetRow, V8_COL.PARTIAL).setValue(memo);
    }
  });

  ui.alert(
    '✅ ' + chosen.weekLabel + ' marked COMPLETE.\n\n' +
    '🔵 COMPLETE = verified, ready to pay.\n' +
    'Pay date: ' + (chosen.ppCode.indexOf('PP1') >= 0 ? '15th of the month.' : 'Last day of the month.') +
    '\n\nWhen payments are sent:\nMenu → 💰 Mark Pay Period as PAID → ' + chosen.ppCode
  );
}

// =============================================================
//  WEEK STATUS OVERVIEW
// =============================================================

function v8_weekStatusOverview() {
  var data = v8_getPayrollRunV8Data_();
  if (!data.length) { SpreadsheetApp.getUi().alert('No payroll data found yet.'); return; }

  var weekMap = {};
  data.forEach(function(r) {
    var key = r.weekLabel + '|' + r.ppCode;
    if (!weekMap[key]) weekMap[key] = {
      weekLabel:r.weekLabel, ppCode:r.ppCode, endDate:r.endDate,
      totalPay:0, agentCount:0, paid:0, complete:0, unpaid:0
    };
    weekMap[key].totalPay += r.total;
    weekMap[key].agentCount++;
    var s = v8_cleanStatus_(r.status);
    if      (s === 'PAID')     weekMap[key].paid++;
    else if (s === 'COMPLETE') weekMap[key].complete++;
    else                       weekMap[key].unpaid++;
    if (r.endDate instanceof Date &&
       (!weekMap[key].endDate || r.endDate > weekMap[key].endDate))
      weekMap[key].endDate = r.endDate;
  });

  var weeks = Object.keys(weekMap).map(function(k){ return weekMap[k]; })
    .sort(function(a,b){
      var da = a.endDate instanceof Date ? a.endDate.getTime() : 0;
      var db = b.endDate instanceof Date ? b.endDate.getTime() : 0;
      return da - db;
    });

  var recent = weeks.slice(-8);
  var tz = Session.getScriptTimeZone();
  var lines = recent.map(function(w) {
    var icon = w.unpaid > 0   ? '🟡 OPEN    '
             : w.complete > 0 ? '🔵 COMPLETE'
             :                  '✅ PAID    ';
    var dt = w.endDate instanceof Date
           ? Utilities.formatDate(w.endDate, tz, 'MM/dd/yy') : '—';
    return icon + '  ' + w.weekLabel + '  ' + w.ppCode +
           '  ends ' + dt + '  ' + w.agentCount + ' agents  ' + v8_fmt_(w.totalPay);
  });

  var openCount     = weeks.filter(function(w){ return w.unpaid > 0; }).length;
  var completeCount = weeks.filter(function(w){ return w.unpaid===0 && w.complete>0; }).length;
  var paidCount     = weeks.filter(function(w){ return w.unpaid===0 && w.complete===0; }).length;
  var stillOwed = 0;
  data.forEach(function(r){ if (v8_cleanStatus_(r.status) !== 'PAID') stillOwed += r.total; });

  SpreadsheetApp.getUi().alert(
    '📋  WEEK STATUS OVERVIEW\n\n' +
    lines.join('\n') +
    '\n\n──────────────────────────────────\n' +
    '🟡 Open: ' + openCount +
    '   🔵 Complete (awaiting payment): ' + completeCount +
    '   ✅ Paid: ' + paidCount +
    '\nStill to pay out: ' + v8_fmt_(stillOwed)
  );
}
