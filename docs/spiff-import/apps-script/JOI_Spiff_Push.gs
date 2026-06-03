const MENU_TITLE = 'JOI';
const PUSH_MENU_ITEM = 'Push spiffs to app';
const DRY_RUN_MENU_ITEM = 'Dry run (preview only)';
const LOOKBACK_DAYS = 14;
const DEFAULT_MIN_SCORE = 70;

const COL_DATE = ['date'];
const COL_AGENT = ['agent', 'agent name'];
const COL_AMOUNT = ['charge to client', 'amount', 'charge'];
const COL_CLIENT = ['client'];
const COL_INVOICED = ['invoiced to client', 'invoiced'];
const COL_INVOICE_NUM = ['invoice #', 'invoice number', 'invoice no'];
const COL_IMPORTED_AT = ['imported at', 'imported'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(MENU_TITLE)
    .addItem(PUSH_MENU_ITEM, 'pushSpiffsToApp')
    .addItem(DRY_RUN_MENU_ITEM, 'dryRunSpiffsToApp')
    .addToUi();
}

function pushSpiffsToApp() {
  runImport_(false);
}
function dryRunSpiffsToApp() {
  runImport_(true);
}

function runImport_(dryRun) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('SPIFF_IMPORT_URL');
  const token = props.getProperty('SPIFF_IMPORT_TOKEN');
  if (!url || !token) {
    SpreadsheetApp.getUi().alert(
      'Setup needed: open File → Project properties → Script properties and add ' +
      'SPIFF_IMPORT_URL and SPIFF_IMPORT_TOKEN.'
    );
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const headerInfo = ensureColumns_(sheet);
  const cols = headerInfo.cols;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('Nothing to push — sheet is empty.');
    return;
  }

  const dataRange = sheet.getRange(2, 1, lastRow - 1, headerInfo.numCols);
  const values = dataRange.getValues();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  cutoff.setHours(0, 0, 0, 0);

  const rowsToSend = [];
  const skippedReasons = { 'invoiced=yes': 0, 'no date': 0, 'out of window': 0, 'no amount': 0 };

  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    const rowNumber = i + 2;

    const invoicedVal = String(r[cols.invoiced] || '').trim().toLowerCase();
    if (invoicedVal === 'yes' || invoicedVal === 'y') {
      skippedReasons['invoiced=yes']++;
      continue;
    }

    const dateVal = r[cols.date];
    const dateISO = toISODate_(dateVal);
    if (!dateISO) {
      skippedReasons['no date']++;
      continue;
    }
    const dateObj = new Date(dateISO + 'T00:00:00');
    if (dateObj < cutoff) {
      skippedReasons['out of window']++;
      continue;
    }

    const amountVal = parseAmount_(r[cols.amount]);
    if (amountVal === null || amountVal === 0) {
      skippedReasons['no amount']++;
      continue;
    }

    const agentVal = String(r[cols.agent] || '').trim();
    if (!agentVal) {
      skippedReasons['no amount']++;
      continue;
    }

    const clientVal = cols.client >= 0 ? String(r[cols.client] || '').trim() : '';

    rowsToSend.push({
      row_id: rowNumber,
      date: dateISO,
      agent_name: agentVal,
      amount: amountVal,
      client_hint: clientVal || null,
    });
  }

  if (rowsToSend.length === 0) {
    SpreadsheetApp.getUi().alert(
      'Nothing to push.\n\n' +
      'Skipped: ' + JSON.stringify(skippedReasons, null, 2)
    );
    return;
  }

  if (dryRun) {
    const preview = rowsToSend.slice(0, 10).map(function (r) {
      return r.row_id + ' · ' + r.date + ' · ' + r.agent_name + ' · $' + r.amount + ' · ' + (r.client_hint || '—');
    }).join('\n');
    SpreadsheetApp.getUi().alert(
      'Dry run — would send ' + rowsToSend.length + ' row(s):\n\n' +
      preview +
      (rowsToSend.length > 10 ? '\n…and ' + (rowsToSend.length - 10) + ' more' : '') +
      '\n\nSkipped: ' + JSON.stringify(skippedReasons)
    );
    return;
  }

  let response;
  try {
    response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-spiff-import-token': token },
      payload: JSON.stringify({ rows: rowsToSend, min_score: DEFAULT_MIN_SCORE }),
      muteHttpExceptions: true,
    });
  } catch (e) {
    SpreadsheetApp.getUi().alert('Network error calling JOI app: ' + e);
    return;
  }

  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status !== 200) {
    SpreadsheetApp.getUi().alert('JOI app rejected the push (HTTP ' + status + '):\n\n' + body);
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    SpreadsheetApp.getUi().alert('JOI app returned non-JSON:\n\n' + body);
    return;
  }

  const now = new Date();
  const timestampStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

  const matched = parsed.matched || [];
  const unmatched = parsed.unmatched || [];

  for (let i = 0; i < matched.length; i++) {
    const m = matched[i];
    const rowNum = Number(m.row_id);
    if (!rowNum) continue;
    sheet.getRange(rowNum, cols.invoiced + 1).setValue('YES');
    if (cols.invoiceNum >= 0) {
      sheet.getRange(rowNum, cols.invoiceNum + 1).setValue(m.invoice_number || '');
    }
    if (cols.importedAt >= 0) {
      sheet.getRange(rowNum, cols.importedAt + 1).setValue(timestampStr);
    }
  }

  const lines = [];
  lines.push('Pushed ' + rowsToSend.length + ' row(s) to JOI.');
  lines.push('');
  lines.push('Applied:        ' + (matched.filter(function (m) { return m.status === 'applied'; }).length));
  lines.push('Already applied: ' + (parsed.already_processed_count || 0));
  lines.push('Unmatched:       ' + unmatched.length);
  lines.push('Total $ applied: $' + Number(parsed.applied_total || 0).toFixed(2));
  if (unmatched.length > 0) {
    lines.push('');
    lines.push('Unmatched rows (left as INVOICED=NO):');
    unmatched.slice(0, 15).forEach(function (u) {
      lines.push('  • row ' + u.row_id + ' — ' + u.reason + (u.hint ? ' — ' + u.hint : ''));
    });
    if (unmatched.length > 15) lines.push('  …and ' + (unmatched.length - 15) + ' more');
  }
  SpreadsheetApp.getUi().alert(lines.join('\n'));
}

function ensureColumns_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const normHeaders = headers.map(function (h) {
    return String(h || '').trim().toLowerCase();
  });

  function findCol(names) {
    for (let i = 0; i < normHeaders.length; i++) {
      const h = normHeaders[i];
      for (let j = 0; j < names.length; j++) {
        if (h === names[j] || h.indexOf(names[j]) >= 0) return i;
      }
    }
    return -1;
  }

  const cols = {
    date: findCol(COL_DATE),
    agent: findCol(COL_AGENT),
    amount: findCol(COL_AMOUNT),
    client: findCol(COL_CLIENT),
    invoiced: findCol(COL_INVOICED),
    invoiceNum: findCol(COL_INVOICE_NUM),
    importedAt: findCol(COL_IMPORTED_AT),
  };

  if (cols.date < 0 || cols.agent < 0 || cols.amount < 0 || cols.invoiced < 0) {
    throw new Error(
      'Sheet is missing required columns. Need: DATE, AGENT, CHARGE TO CLIENT, INVOICED. ' +
      'Found headers: ' + JSON.stringify(headers)
    );
  }

  let numCols = lastCol;

  if (cols.invoiceNum < 0) {
    numCols++;
    sheet.getRange(1, numCols).setValue('Invoice #');
    cols.invoiceNum = numCols - 1;
  }
  if (cols.importedAt < 0) {
    numCols++;
    sheet.getRange(1, numCols).setValue('Imported At');
    cols.importedAt = numCols - 1;
  }

  return { cols: cols, numCols: numCols };
}

function toISODate_(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    const tz = Session.getScriptTimeZone();
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  const s = String(v).trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    return iso[1] + '-' + pad2_(iso[2]) + '-' + pad2_(iso[3]);
  }
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (slash) {
    let yr = parseInt(slash[3], 10);
    if (slash[3].length === 2) yr = yr < 50 ? 2000 + yr : 1900 + yr;
    return yr + '-' + pad2_(slash[1]) + '-' + pad2_(slash[2]);
  }
  return null;
}

function pad2_(s) {
  s = String(s);
  return s.length === 1 ? '0' + s : s;
}

function parseAmount_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/["$,\s]/g, '');
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}
