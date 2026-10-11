/**
 * ONLINE RESULTS SERVER — UBA10 CO1 Quiz (MS2 SEP–DEC 2026)
 * ---------------------------------------------------------------------------
 * Collects every student's result from every computer/phone into ONE Google
 * Sheet, so several faculty can run the quiz for their own classes (e.g. 40
 * students at the same time, another class the next day) and each faculty can
 * download their own students' results from the Faculty Dashboard.
 *
 * SETUP (about 5 minutes, once)
 *  1. Sign in to a PERSONAL Gmail account (institutional Workspace accounts
 *     usually block "Anyone" access, and students then see a Google sign-in).
 *  2. Create a new Google Sheet, e.g. "UBA10 CO1 Quiz Results – MS2 2026".
 *  3. Extensions → Apps Script. Delete the sample code and paste THIS file.
 *  4. Change FACULTY_PASSWORD below if you want (it must match the password the
 *     faculty type in the Faculty Dashboard). Click 💾 Save.
 *  5. Deploy → New deployment → ⚙ Select type: "Web app"
 *        Description:     UBA10 quiz results
 *        Execute as:      Me
 *        Who has access:  Anyone
 *     → Deploy → Authorize access (choose your account → Advanced → Go to … → Allow).
 *  6. Copy the "Web app URL" (it ends with /exec) and paste it into
 *     js/site-config.js  →  RESULTS_ENDPOINT: 'https://script.google.com/macros/s/…/exec'
 *
 * If you edit this script later: Deploy → Manage deployments → ✏ Edit →
 * Version: "New version" → Deploy (the URL stays the same).
 *
 * The password is checked HERE on Google's server; it is not stored in the
 * quiz files that students download.
 */

var FACULTY_PASSWORD = 'CHANGE-ME';   // set the faculty password here in YOUR copy of the script only (never in a public file)
var SHEET_NAME = 'Results';
// Leave '' when this script is opened from the sheet (Extensions → Apps Script).
// For a standalone script, put the Google Sheet ID here (the long code in the sheet's URL).
var SPREADSHEET_ID = '';

// Must match CO1.RESULT_COLUMNS in js/app.js (without "S.No")
var HEADERS = [
  'Student Name', 'Register Number', 'Faculty Name', 'Course Code', 'Quiz Date',
  'Start Time', 'End Time', 'Total Questions', 'Attempted', 'Correct', 'Wrong', 'Unanswered',
  'Total Marks', 'Marks Obtained', 'Percentage', 'Result', 'Violation Count',
  'Violation Details', 'Quiz Status', 'Status', 'Duration', 'Submission Type',
  'Blocked Actions', 'Session', 'Attempt ID'
];
var ALL_HEADERS = ['Received At'].concat(HEADERS).concat(['Record JSON']);

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    switch (req.action) {
      case 'submit':  return out_(submit_(req));
      case 'check':   return out_(check_(req));
      case 'results': auth_(req); return out_(results_());
      case 'delete':  auth_(req); return out_(delete_(req));
      case 'ping':    return out_({ ok: true });
      default:        return out_({ ok: false, fatal: true, error: 'Unknown action' });
    }
  } catch (err) {
    return out_({ ok: false, fatal: !!err.fatal, error: String(err && err.message || err) });
  }
}

function doGet() {
  return out_({ ok: true, service: 'UBA10 CO1 quiz results server is running' });
}

/* ------------------------------------------------------------------------- */

function sheet_() {
  var ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(ALL_HEADERS);
    sh.getRange(1, 1, 1, ALL_HEADERS.length)
      .setFontWeight('bold').setBackground('#1F3864').setFontColor('#FFFFFF').setWrap(true);
    sh.setFrozenRows(1);
    sh.hideColumns(ALL_HEADERS.length); // Record JSON (used by the dashboard)
  }
  return sh;
}

function col_(name) { return ALL_HEADERS.indexOf(name) + 1; }

function findRow_(sh, colName, value) {
  if (sh.getLastRow() < 2) return 0;
  var cell = sh.getRange(2, col_(colName), sh.getLastRow() - 1, 1)
    .createTextFinder(String(value)).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : 0;
}

function submit_(req) {
  var row = req.row || {};
  var rec = req.record || {};
  if (!row['Attempt ID']) throw new Error('Missing attempt ID');
  var lock = LockService.getScriptLock();
  lock.waitLock(28000);          // many students may submit at the same moment
  try {
    var sh = sheet_();
    if (findRow_(sh, 'Attempt ID', row['Attempt ID'])) return { ok: true, duplicate: true };
    var values = [new Date()];
    HEADERS.forEach(function (h) { values.push(row[h] === undefined ? '' : row[h]); });
    var json = JSON.stringify(rec);
    values.push(json.length > 49000 ? JSON.stringify(slim_(rec)) : json);
    sh.appendRow(values);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function slim_(rec) { var c = JSON.parse(JSON.stringify(rec)); c.review = []; return c; }

function norm_(s) { return String(s || '').toUpperCase().replace(/\s+/g, ''); }

function check_(req) {
  var sh = sheet_();
  if (sh.getLastRow() < 2) return { ok: true, exists: false };
  var n = sh.getLastRow() - 1;
  var regs = sh.getRange(2, col_('Register Number'), n, 1).getValues();
  var courses = sh.getRange(2, col_('Course Code'), n, 1).getValues();
  var reg = norm_(req.regNo), course = norm_(req.courseCode);
  for (var i = 0; i < n; i++) {
    if (norm_(regs[i][0]) === reg && norm_(courses[i][0]) === course) {
      var r = sh.getRange(i + 2, col_('Status')).getValue();
      var d = sh.getRange(i + 2, col_('Quiz Date')).getDisplayValue();
      return { ok: true, exists: true, status: String(r), date: d };
    }
  }
  return { ok: true, exists: false };
}

function auth_(req) {
  if (String(req.key || '') !== FACULTY_PASSWORD) {
    var e = new Error('Wrong faculty password for the online results.'); e.fatal = true; throw e;
  }
}

function results_() {
  var sh = sheet_();
  if (sh.getLastRow() < 2) return { ok: true, records: [] };
  var vals = sh.getRange(2, col_('Record JSON'), sh.getLastRow() - 1, 1).getValues();
  var records = [];
  vals.forEach(function (v) { try { if (v[0]) records.push(JSON.parse(v[0])); } catch (e) { /* skip */ } });
  return { ok: true, records: records };
}

function delete_(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    var sh = sheet_();
    var r = findRow_(sh, 'Attempt ID', req.attemptId);
    if (r) sh.deleteRow(r);
    return { ok: true, deleted: !!r };
  } finally {
    lock.releaseLock();
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
