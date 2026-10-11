/* =============================================================================
 * excel.js — Excel / CSV export and question import (SheetJS)
 *
 * Library: js/lib/xlsx.bundle.js = "xlsx-js-style", a build of SheetJS 0.18.5
 * that adds cell styling. It exposes the standard global `XLSX`.
 * SheetJS Community Edition cannot write frozen panes, so after writing the
 * workbook we patch each sheet's <sheetViews> XML inside the .xlsx (zip) using
 * SheetJS's own bundled CFB/zip engine. Result: header styling, auto widths,
 * filters, frozen header row and real Excel date/time cells.
 * ========================================================================== */
(function () {
  'use strict';
  const CO1 = (window.CO1 = window.CO1 || {});

  const NAVY = '1F3864', MAROON = '8B1E3F', WHITE = 'FFFFFF';
  const BORDER = { style: 'thin', color: { rgb: 'C9D1E0' } };
  const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
  const HEADER_STYLE = {
    font: { bold: true, color: { rgb: WHITE }, sz: 11, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: NAVY } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: BORDERS
  };

  function requireXLSX() {
    if (!window.XLSX || !window.XLSX.utils) {
      throw new Error('The Excel library (js/lib/xlsx.bundle.js) did not load. Check that the js/lib folder was copied with the app.');
    }
    return window.XLSX;
  }

  /** JS timestamp → Excel serial number in LOCAL time (avoids timezone shifts). */
  function excelSerial(t) {
    const d = new Date(t);
    return (d.getTime() - d.getTimezoneOffset() * 60000) / 86400000 + 25569;
  }

  function download(bytes, filename, mime) {
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  /**
   * Build a styled worksheet.
   * columns: [{ header, key, width?, type?: 'date'|'time'|'datetime'|'percent'|'number'|'text', wrap? }]
   * rows:    array of plain objects
   * opts.rowStyle(row, col) → optional style overrides per cell
   */
  function buildSheet(columns, rows, opts = {}) {
    const XLSX = requireXLSX();
    const ws = {};
    const enc = XLSX.utils.encode_cell;

    columns.forEach((c, ci) => {
      ws[enc({ r: 0, c: ci })] = { t: 's', v: c.header, s: HEADER_STYLE };
    });

    rows.forEach((row, ri) => {
      const zebra = ri % 2 === 1;
      columns.forEach((c, ci) => {
        let v = row[c.key];
        let cell;
        const base = {
          border: BORDERS,
          alignment: { vertical: 'top', wrapText: !!c.wrap, horizontal: c.align || (c.type && c.type !== 'text' ? 'center' : 'left') },
          font: { name: 'Calibri', sz: 11 }
        };
        if (zebra) base.fill = { patternType: 'solid', fgColor: { rgb: 'F3F6FB' } };

        if (v === null || v === undefined || v === '') {
          cell = { t: 's', v: '' };
        } else if (typeof v === 'string' && v.trim() === '--') {
          cell = { t: 's', v: '--' };
          base.alignment.horizontal = 'center';
        } else if (c.type === 'date') {
          cell = { t: 'n', v: Math.floor(excelSerial(v)), z: 'dd-mmm-yyyy' };
        } else if (c.type === 'time') {
          cell = { t: 'n', v: excelSerial(v), z: 'hh:mm:ss AM/PM' };
        } else if (c.type === 'datetime') {
          cell = { t: 'n', v: excelSerial(v), z: 'dd-mmm-yyyy hh:mm:ss AM/PM' };
        } else if (c.type === 'percent') {
          cell = { t: 'n', v: Number(v) / 100, z: '0.00%' };
        } else if (c.type === 'number' && !isNaN(Number(v))) {
          cell = { t: 'n', v: Number(v) };
        } else {
          cell = { t: 's', v: String(v) };
        }
        const extra = opts.rowStyle ? opts.rowStyle(row, c) : null;
        cell.s = extra ? deepMerge(base, extra) : base;
        ws[enc({ r: ri + 1, c: ci })] = cell;
      });
    });

    const lastRow = Math.max(1, rows.length);
    const ref = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: columns.length - 1 } });
    ws['!ref'] = ref;
    ws['!autofilter'] = { ref };
    ws['!rows'] = [{ hpt: 30 }];

    // Auto column width from the longest displayed text (bounded)
    ws['!cols'] = columns.map((c, ci) => {
      if (c.width) return { wch: c.width };
      let max = c.header.length;
      rows.forEach((r) => {
        let v = r[c.key];
        if (c.type === 'date') v = '06-Oct-2026';
        else if (c.type === 'time') v = '10:23:15 AM';
        else if (c.type === 'datetime') v = '06-Oct-2026 10:23:15 AM';
        const len = String(v === undefined || v === null ? '' : v).length;
        if (len > max) max = len;
      });
      return { wch: Math.min(60, Math.max(8, max + 2)) };
    });
    return ws;
  }

  function deepMerge(a, b) {
    const out = JSON.parse(JSON.stringify(a));
    Object.keys(b).forEach((k) => {
      out[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? Object.assign({}, out[k] || {}, b[k]) : b[k];
    });
    return out;
  }

  /** Write workbook → bytes, then freeze row 1 of every sheet by patching the XML. */
  function writeWithFrozenHeader(wb) {
    const XLSX = requireXLSX();
    const raw = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
    try {
      const zip = XLSX.CFB.read(new Uint8Array(raw), { type: 'array' });
      const FROZEN = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>';
      zip.FullPaths.forEach((p, i) => {
        if (!/xl\/worksheets\/sheet\d+\.xml$/.test(p)) return;
        const entry = zip.FileIndex[i];
        let xml = new TextDecoder('utf-8').decode(entry.content);
        xml = xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, FROZEN);
        entry.content = new TextEncoder().encode(xml);
        entry.size = entry.content.length;
      });
      const out = XLSX.CFB.write(zip, { type: 'array', fileType: 'zip', compression: true });
      return new Uint8Array(out);
    } catch (e) {
      console.warn('[CO1] Could not freeze header row; exporting without it.', e);
      return new Uint8Array(raw);
    }
  }

  const statusStyle = (row, col) => {
    if (col.key === 'Status' || col.key === 'Result' || col.key === 'Quiz Status') {
      const v = row[col.key];
      if (v === 'MALPRACTICE' || v === 'TERMINATED') return { font: { bold: true, color: { rgb: WHITE } }, fill: { patternType: 'solid', fgColor: { rgb: 'C0392B' } } };
      if (v === 'PASS') return { font: { bold: true, color: { rgb: '1E7B34' } } };
      if (v === 'FAIL') return { font: { bold: true, color: { rgb: 'C0392B' } } };
    }
    if (col.key === 'Violation Count' && Number(row[col.key]) > 0) return { font: { bold: true, color: { rgb: MAROON } } };
    return null;
  };

  CO1.Excel = {
    /** Rows for the Results sheet (real date/time values, '--' for malpractice scores) */
    _resultRows(records) {
      return records.map((r, i) => {
        const mal = r.status === 'MALPRACTICE';
        return {
          'S.No': i + 1,
          'Student Name': r.studentName,
          'Register Number': r.regNo,
          'Faculty Name': r.facultyName,
          'Course Code': r.courseCode,
          'Quiz Date': r.startTime,
          'Start Time': r.startTime,
          'End Time': r.endTime,
          'Total Questions': r.totalQuestions,
          'Attempted': r.attempted,
          'Correct': mal ? '--' : r.correct,
          'Wrong': mal ? '--' : r.wrong,
          'Unanswered': r.unanswered,
          'Total Marks': r.totalMarks,
          'Marks Obtained': mal ? '--' : r.marksObtained,
          'Percentage': mal ? '--' : r.percentage,
          'Result': r.result,
          'Violation Count': r.violationCount,
          'Violation Details': r.violationDetails || 'None',
          'Quiz Status': r.quizStatus,
          'Status': r.status,
          'Duration (mm:ss)': CO1.util.fmtDuration(r.durationSec * 1000),
          'Submission Type': r.submissionType,
          'Blocked Actions': r.blockedActions || 0,
          'Session': r.sessionLabel || '',
          'Attempt ID': r.attemptId
        };
      });
    },

    /** Excel export: Results + Violation Log + Summary sheets. */
    exportResults(records, courseCode) {
      const XLSX = requireXLSX();
      if (!records.length) throw new Error('There are no results to export.');
      const resultCols = [
        { header: 'S.No', key: 'S.No', type: 'number', width: 6 },
        { header: 'Student Name', key: 'Student Name' },
        { header: 'Register Number', key: 'Register Number' },
        { header: 'Faculty Name', key: 'Faculty Name' },
        { header: 'Course Code', key: 'Course Code' },
        { header: 'Quiz Date', key: 'Quiz Date', type: 'date' },
        { header: 'Start Time', key: 'Start Time', type: 'time' },
        { header: 'End Time', key: 'End Time', type: 'time' },
        { header: 'Total Questions', key: 'Total Questions', type: 'number' },
        { header: 'Attempted', key: 'Attempted', type: 'number' },
        { header: 'Correct', key: 'Correct', type: 'number' },
        { header: 'Wrong', key: 'Wrong', type: 'number' },
        { header: 'Unanswered', key: 'Unanswered', type: 'number' },
        { header: 'Total Marks', key: 'Total Marks', type: 'number' },
        { header: 'Marks Obtained', key: 'Marks Obtained', type: 'number' },
        { header: 'Percentage', key: 'Percentage', type: 'percent' },
        { header: 'Result', key: 'Result', align: 'center' },
        { header: 'Violation Count', key: 'Violation Count', type: 'number' },
        { header: 'Violation Details', key: 'Violation Details', width: 70, wrap: true },
        { header: 'Quiz Status', key: 'Quiz Status', align: 'center' },
        { header: 'Status', key: 'Status', align: 'center' },
        { header: 'Duration (mm:ss)', key: 'Duration (mm:ss)', align: 'center' },
        { header: 'Submission Type', key: 'Submission Type' },
        { header: 'Blocked Actions', key: 'Blocked Actions', type: 'number' },
        { header: 'Session', key: 'Session' },
        { header: 'Attempt ID', key: 'Attempt ID' }
      ];
      const wsResults = buildSheet(resultCols, this._resultRows(records), { rowStyle: statusStyle });

      // ---- Violation log: one row per violation ----
      const vRows = [];
      records.forEach((r) => (r.violations || []).forEach((v) => {
        vRows.push({
          'S.No': vRows.length + 1,
          'Student Name': r.studentName,
          'Register Number': r.regNo,
          'Course Code': r.courseCode,
          'Violation No': v.no,
          'Date & Time': v.timestamp,
          'Violation Type': v.events && v.events.length > 1 ? v.events.join(' + ') : v.type,
          'Question No': v.questionNo,
          'Time Remaining': v.no > r.maxViolations ? '--' : v.timeRemaining,
          'Away (sec)': v.awaySeconds === null || v.awaySeconds === undefined ? '' : v.awaySeconds,
          'Details': v.detail || '',
          'Outcome': v.no > r.maxViolations ? 'MALPRACTICE' : `Warning ${v.no}`
        });
      }));
      const vCols = [
        { header: 'S.No', key: 'S.No', type: 'number', width: 6 },
        { header: 'Student Name', key: 'Student Name' },
        { header: 'Register Number', key: 'Register Number' },
        { header: 'Course Code', key: 'Course Code' },
        { header: 'Violation No', key: 'Violation No', type: 'number' },
        { header: 'Date & Time', key: 'Date & Time', type: 'datetime' },
        { header: 'Violation Type', key: 'Violation Type', width: 55, wrap: true },
        { header: 'Question No', key: 'Question No', type: 'number' },
        { header: 'Time Remaining', key: 'Time Remaining', align: 'center' },
        { header: 'Away (sec)', key: 'Away (sec)', type: 'number' },
        { header: 'Details', key: 'Details', width: 40, wrap: true },
        { header: 'Outcome', key: 'Outcome', align: 'center' }
      ];
      const wsViol = buildSheet(vCols, vRows, {
        rowStyle: (row, col) => (col.key === 'Outcome' && row.Outcome === 'MALPRACTICE'
          ? { font: { bold: true, color: { rgb: WHITE } }, fill: { patternType: 'solid', fgColor: { rgb: 'C0392B' } } } : null)
      });

      // ---- Summary ----
      const s = CO1.stats(records);
      const sRows = [
        { Metric: 'Course Code(s)', Value: [...new Set(records.map((r) => r.courseCode))].join(', ') },
        { Metric: 'Session', Value: [...new Set(records.map((r) => r.sessionLabel).filter(Boolean))].join(', ') },
        { Metric: 'Faculty', Value: [...new Set(records.map((r) => r.facultyName))].join(', ') },
        { Metric: 'Exported On', Value: new Date().toLocaleString('en-IN') },
        { Metric: 'Total Students', Value: s.total },
        { Metric: 'Completed', Value: s.completed },
        { Metric: 'Passed', Value: s.passed },
        { Metric: 'Failed', Value: s.failed },
        { Metric: 'Malpractice', Value: s.malpractice },
        { Metric: 'Average Score (%) — completed attempts', Value: s.avgPct.toFixed(2) },
        { Metric: 'Pass Percentage (%) — of completed attempts', Value: s.passRate.toFixed(2) }
      ];
      const wsSum = buildSheet([{ header: 'Metric', key: 'Metric', width: 46 }, { header: 'Value', key: 'Value', width: 40 }], sRows);

      const wb = XLSX.utils.book_new();
      wb.Props = { Title: 'CO1 Quiz Results', Author: 'CO1 Quiz Portal', CreatedDate: new Date() };
      XLSX.utils.book_append_sheet(wb, wsResults, 'Results');
      XLSX.utils.book_append_sheet(wb, wsViol, 'Violation Log');
      XLSX.utils.book_append_sheet(wb, wsSum, 'Summary');

      const fname = `CO1_Quiz_${safeName(courseCode || 'ALL')}_${CO1.util.fmtDate(Date.now())}.xlsx`;
      download(writeWithFrozenHeader(wb), fname, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return fname;
    },

    /** CSV export (UTF-8 with BOM so Excel shows Unicode names correctly). */
    exportCSV(records, courseCode) {
      if (!records.length) throw new Error('There are no results to export.');
      const cols = CO1.RESULT_COLUMNS;
      const esc = (v) => {
        const s = String(v === undefined || v === null ? '' : v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [cols.map(esc).join(',')];
      records.forEach((r, i) => {
        const row = CO1.flattenResult(r, i + 1);
        lines.push(cols.map((c) => esc(row[c])).join(','));
      });
      const fname = `CO1_Quiz_${safeName(courseCode || 'ALL')}_${CO1.util.fmtDate(Date.now())}.csv`;
      download('﻿' + lines.join('\r\n'), fname, 'text/csv;charset=utf-8');
      return fname;
    },

    /* ---------------------- Question bank import ---------------------- */
    TEMPLATE_HEADERS: ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Marks'],

    downloadTemplate() {
      const XLSX = requireXLSX();
      const cols = this.TEMPLATE_HEADERS.map((h) => ({ header: h, key: h, width: h === 'Question' ? 60 : h.startsWith('Option') ? 28 : 15, wrap: h === 'Question', type: h === 'Marks' ? 'number' : undefined, align: h === 'Correct Answer' ? 'center' : undefined }));
      const rows = [
        { Question: 'The sum of the eigenvalues of a square matrix equals', 'Option A': 'its determinant', 'Option B': 'its trace', 'Option C': 'its rank', 'Option D': 'zero', 'Correct Answer': 'B', Marks: 1 },
        { Question: 'If λ is an eigenvalue of a non-singular matrix A, an eigenvalue of A⁻¹ is', 'Option A': 'λ', 'Option B': '−λ', 'Option C': '1/λ', 'Option D': 'λ²', 'Correct Answer': 'C', Marks: 1 }
      ];
      const ws = buildSheet(cols, rows);
      const help = buildSheet([{ header: 'How to fill this template', key: 't', width: 110, wrap: true }], [
        { t: '1. Enter one question per row in the "Questions" sheet. Delete the two sample rows.' },
        { t: '2. Fill all four options (Option A – Option D).' },
        { t: '3. Correct Answer: type the letter A, B, C or D (1–4 or the exact option text are also accepted).' },
        { t: '4. Marks: a positive number. Leave blank for 1 mark.' },
        { t: '5. Keep the header row unchanged. Save as .xlsx and import it from Faculty Dashboard → Question Bank → Import Excel.' }
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Questions');
      XLSX.utils.book_append_sheet(wb, help, 'Instructions');
      download(writeWithFrozenHeader(wb), 'CO1_Question_Template.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    },

    /**
     * Parse an uploaded .xlsx / .xls / .csv file into questions.
     * Resolves { questions: [...valid], errors: ['Row 5: ...'] }
     */
    parseQuestionFile(file) {
      return new Promise((resolve, reject) => {
        let XLSX;
        try { XLSX = requireXLSX(); } catch (e) { reject(e); return; }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read the file.'));
        reader.onload = (ev) => {
          try {
            const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
            const norm = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');
            // find the header row (first row containing "question")
            const hIdx = aoa.findIndex((row) => row.some((c) => norm(c) === 'question'));
            if (hIdx < 0) throw new Error('Header row not found. The first sheet must have the columns: ' + this.TEMPLATE_HEADERS.join(' | '));
            const head = aoa[hIdx].map(norm);
            const col = (names) => head.findIndex((h) => names.includes(h));
            const idx = {
              q: col(['question', 'questiontext']),
              a: col(['optiona', 'a']), b: col(['optionb', 'b']), c: col(['optionc', 'c']), d: col(['optiond', 'd']),
              ans: col(['correctanswer', 'answer', 'correct', 'key', 'answerkey']),
              m: col(['marks', 'mark', 'score'])
            };
            const missing = Object.entries({ Question: idx.q, 'Option A': idx.a, 'Option B': idx.b, 'Option C': idx.c, 'Option D': idx.d, 'Correct Answer': idx.ans })
              .filter(([, v]) => v < 0).map(([k]) => k);
            if (missing.length) throw new Error('Missing column(s): ' + missing.join(', '));

            const questions = [];
            const errors = [];
            for (let r = hIdx + 1; r < aoa.length; r++) {
              const row = aoa[r];
              if (!row || row.every((c) => String(c).trim() === '')) continue;
              const opts = { A: row[idx.a], B: row[idx.b], C: row[idx.c], D: row[idx.d] };
              let ans = String(row[idx.ans]).trim();
              if (/^[1-4]$/.test(ans)) ans = 'ABCD'[Number(ans) - 1];
              else if (/^\(?[a-dA-D]\)?\.?$/.test(ans)) ans = ans.replace(/[^a-dA-D]/g, '').toUpperCase();
              else {
                const hit = Object.keys(opts).find((L) => String(opts[L]).trim().toLowerCase() === ans.toLowerCase());
                if (hit) ans = hit;
              }
              const marksRaw = idx.m >= 0 ? String(row[idx.m]).trim() : '';
              const q = CO1.questions.normalize({
                id: `Q${questions.length + 1}`, question: row[idx.q], options: opts, answer: ans,
                marks: marksRaw === '' ? 1 : Number(marksRaw)
              }, questions.length);
              if (marksRaw !== '' && !(Number(marksRaw) > 0)) { errors.push(`Row ${r + 1}: Marks must be a positive number`); continue; }
              const e = CO1.questions.validate(q);
              if (e.length) errors.push(`Row ${r + 1}: ${e.join('; ')}`);
              else questions.push(q);
            }
            if (!questions.length && !errors.length) errors.push('No question rows were found below the header.');
            resolve({ questions, errors });
          } catch (e) {
            reject(e);
          }
        };
        reader.readAsArrayBuffer(file);
      });
    }
  };

  function safeName(s) { return String(s).trim().replace(/[^A-Za-z0-9_-]+/g, '_') || 'ALL'; }

  /** Dashboard / summary statistics (shared with faculty.js). */
  CO1.stats = function (records) {
    const completed = records.filter((r) => r.status === 'COMPLETED');
    const passed = completed.filter((r) => r.result === 'PASS').length;
    const avgPct = completed.length ? completed.reduce((a, r) => a + r.percentage, 0) / completed.length : 0;
    const avgMarks = completed.length ? completed.reduce((a, r) => a + r.marksObtained, 0) / completed.length : 0;
    return {
      total: records.length,
      completed: completed.length,
      passed,
      failed: completed.length - passed,
      malpractice: records.filter((r) => r.status === 'MALPRACTICE').length,
      avgPct,
      avgMarks,
      passRate: completed.length ? (passed / completed.length) * 100 : 0
    };
  };
})();
