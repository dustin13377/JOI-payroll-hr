/**
 * ============================================================
 *  JOI PAYROLL — TAB CLEANUP & REORDER
 *  Run ONCE to clean up the spreadsheet to its final state.
 * ============================================================
 *
 *  WHAT THIS DOES (in safe order):
 *  1. Creates a full backup copy of the spreadsheet in Drive
 *  2. Deletes: Validation, Payroll Run v8, Pre-v8 Snapshot
 *  3. Reorders remaining tabs:
 *     Dashboard | Pay Rules | Agents | Payroll Run |
 *     March 26 PayRoll | April 26 PayRoll | Alumni
 *  4. Shows a summary of everything that was done
 *
 *  ⚠️  HOW TO RUN:
 *  Extensions → Apps Script → paste this file → Save →
 *  Run "cleanupAndReorderTabs" → authorize → done.
 * ============================================================
 */

function cleanupAndReorderTabs() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Step 0: Final confirmation ────────────────────────────
  const go = ui.alert(
    '🧹 JOI Payroll — Tab Cleanup',
    'This will:\n\n' +
    '  1. ✅ BACKUP your entire spreadsheet to Google Drive\n' +
    '  2. 🗑️  DELETE: Validation, Payroll Run v8, Pre-v8 Snapshot\n' +
    '  3. 📋 REORDER tabs to the final clean lineup\n\n' +
    'Your real data (Payroll Run, Pay Rules, Agents, etc.) is NOT touched.\n\n' +
    '⚠️ Run the backup step first — do not skip it.\n\nProceed?',
    ui.ButtonSet.YES_NO
  );
  if (go !== ui.Button.YES) return;

  const log = [];

  // ── Step 1: BACKUP ────────────────────────────────────────
  log.push('📦 BACKUP');
  try {
    const timestamp   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm');
    const backupName  = `JOI PayRoll BACKUP ${timestamp}`;
    const file        = DriveApp.getFileById(ss.getId());
    const backup      = file.makeCopy(backupName);
    const backupUrl   = `https://docs.google.com/spreadsheets/d/${backup.getId()}`;
    log.push(`  ✅ Backup created: "${backupName}"`);
    log.push(`  📎 ${backupUrl}`);
    Logger.log('BACKUP URL: ' + backupUrl);
  } catch (e) {
    ui.alert(
      '❌ Backup Failed',
      `Could not create backup: ${e.message}\n\nCleanup has been CANCELLED.\nFix the backup issue before proceeding.`,
      ui.ButtonSet.OK
    );
    return;
  }

  // ── Step 2: DELETE unwanted tabs ─────────────────────────
  log.push('\n🗑️  DELETIONS');

  const toDelete = ['Validation', 'Payroll Run v8', 'Pre-v8 Snapshot'];

  toDelete.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (sh) {
      try {
        ss.deleteSheet(sh);
        log.push(`  ✅ Deleted: "${name}"`);
      } catch (e) {
        log.push(`  ⚠️  Could not delete "${name}": ${e.message}`);
      }
    } else {
      log.push(`  ℹ️  Not found (already gone): "${name}"`);
    }
  });

  // ── Step 3: REORDER tabs ──────────────────────────────────
  log.push('\n📋 TAB ORDER');

  const finalOrder = [
    'Dashboard',
    'Pay Rules',
    'Agents',
    'Payroll Run',
    'March 26 PayRoll',
    'April 26 PayRoll',
    'Alumni',
  ];

  finalOrder.forEach((name, targetIndex) => {
    const sh = ss.getSheetByName(name);
    if (!sh) {
      log.push(`  ⚠️  Tab not found: "${name}" — skipping`);
      return;
    }
    // Move to the correct position (1-based in Sheets API)
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(targetIndex + 1);
    log.push(`  ✅ Position ${targetIndex + 1}: "${name}"`);
  });

  // ── Step 4: Summary ───────────────────────────────────────
  SpreadsheetApp.flush();

  const summary = log.join('\n');
  Logger.log(summary);

  ui.alert(
    '✅ Cleanup Complete',
    summary + '\n\n' +
    '─────────────────────────────────────\n' +
    'Your spreadsheet is now clean.\n\n' +
    'NEXT STEP:\n' +
    'Replace the script with JOI_PAYROLL_V9.gs\n' +
    'Then run: JOI Payroll → Admin → First-Time Setup',
    ui.ButtonSet.OK
  );
}


/**
 * verifyTabsBeforeCleanup
 * Run this FIRST to see a full inventory of all tabs
 * and what data is in each one — before deleting anything.
 * Gives you complete peace of mind.
 */
function verifyTabsBeforeCleanup() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();

  let msg = '📊 CURRENT TAB INVENTORY\n';
  msg += '─'.repeat(50) + '\n\n';

  sheets.forEach((sh, i) => {
    const name    = sh.getName();
    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    const dataRows = Math.max(0, lastRow - 3); // approx data rows (minus headers)

    let action;
    if (['Dashboard', 'Pay Rules', 'Agents', 'Payroll Run',
         'March 26 PayRoll', 'April 26 PayRoll', 'Alumni'].includes(name)) {
      action = '✅ KEEP';
    } else if (['Validation', 'Payroll Run v8', 'Pre-v8 Snapshot'].includes(name)) {
      action = '🗑️  DELETE';
    } else {
      action = '❓ UNKNOWN — check manually';
    }

    msg += `${i + 1}. "${name}"\n`;
    msg += `   ${action}\n`;
    msg += `   Rows: ${lastRow}  |  Cols: ${lastCol}  |  ~${dataRows} data rows\n\n`;
  });

  msg += '─'.repeat(50) + '\n';
  msg += 'Run "cleanupAndReorderTabs" when you\'re ready.';

  ui.alert('Tab Inventory', msg, ui.ButtonSet.OK);
}
