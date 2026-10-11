/* =============================================================================
 * faculty.js — Faculty Dashboard (faculty.html)
 *   Login (password) · Dashboard & results · Malpractice log · Question bank
 *   (edit / Excel import / template / JSON) · Configuration · Session control
 * ========================================================================== */
(function () {
  'use strict';
  const CO1 = window.CO1;
  const { $, $$, escapeHtml, fmtTime, fmtDuration, fmtDateLong } = CO1.util;
  const K = CO1.KEYS;

  let results = [];
  let remoteResults = null;      // last records loaded from the Google Sheet (null = not loaded)
  let remoteInfo = { state: 'off', at: 0, error: '' };
  let bank = [];
  let cfg = null;

  /* ============================ LOGIN ============================ */
  async function init() {
    if (!CO1.storage.available()) {
      return CO1.ui.fatal($('#facultyApp'), 'Browser storage unavailable', 'The dashboard needs browser storage (localStorage).');
    }
    cfg = await CO1.data.getConfig();
    CO1.ui.applyBranding(cfg);

    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (await CO1.auth.verify($('#pin').value)) {
        CO1.auth.login($('#pin').value);
        showApp();
      } else {
        $('#pinErr').textContent = 'Incorrect password.';
        $('#pin').classList.add('is-invalid');
      }
    });
    if (CO1.auth.isLoggedIn()) showApp();
  }

  async function showApp() {
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
    $('#btnLogout').hidden = false;
    $('#btnLogout').addEventListener('click', () => { CO1.auth.logout(); location.reload(); });

    $$('.tab-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    wireDashboard();
    wireBank();
    wireConfig();
    wireSession();
    await refreshAll();

    // live updates when a student finishes in another tab of this browser
    window.addEventListener('storage', (e) => {
      if ([K.RESULTS, K.ACTIVE, K.BROWSER_LOCK, K.BANK, K.CONFIG].includes(e.key)) refreshAll(false);
    });
    setInterval(renderSession, 2000);
  }

  function switchTab(name) {
    $$('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tab-pane').forEach((p) => (p.hidden = p.id !== 'tab-' + name));
  }

  /** Load results: this browser + (online mode) the central Google Sheet, merged by attempt ID. */
  async function loadRemote() {
    if (!(await CO1.remote.enabled())) { remoteInfo = { state: 'off' }; remoteResults = null; return; }
    remoteInfo = { state: 'loading' };
    renderSource();
    try {
      remoteResults = await CO1.remote.fetchResults(CO1.auth.key());
      remoteInfo = { state: 'ok', at: Date.now(), count: remoteResults.length };
    } catch (e) {
      remoteInfo = { state: 'error', error: e.message };
    }
  }
  function renderSource() {
    const bar = $('#sourceBar');
    if (!bar) return;
    const pending = CO1.remote.queue().length;
    if (remoteInfo.state === 'off') {
      bar.className = 'source-bar';
      bar.innerHTML = '<b>Results source:</b> this browser only (offline/lab mode). To collect results from all computers in one place, set up the Google Sheet (see README → Online setup).';
    } else if (remoteInfo.state === 'loading') {
      bar.className = 'source-bar';
      bar.innerHTML = '<span class="spinner"></span> Loading results from the Google Sheet…';
    } else if (remoteInfo.state === 'ok') {
      bar.className = 'source-bar';
      bar.innerHTML = `<b>Results source:</b> Google Sheet (all classes, all computers) · ${remoteInfo.count} record(s) · updated ${fmtTime(remoteInfo.at)}` +
        (pending ? ` · <b>${pending}</b> result(s) on this computer still waiting to be sent` : '') +
        ' · Use <b>Faculty</b> filter to see only your students.';
    } else {
      bar.className = 'source-bar err';
      bar.innerHTML = `<b>Could not load online results:</b> ${escapeHtml(remoteInfo.error || '')} — showing this browser's results only. Check the internet connection and press <b>↻ Refresh</b>.`;
    }
  }

  async function refreshAll(fetchRemote = true) {
    cfg = await CO1.data.getConfig();
    if (fetchRemote) await loadRemote();
    const map = new Map();
    (await CO1.data.getResults()).forEach((r) => map.set(r.attemptId, Object.assign({}, r, { source: 'local' })));
    (remoteResults || []).forEach((r) => map.set(r.attemptId, Object.assign({}, map.get(r.attemptId) || {}, r, { source: 'online' })));
    results = [...map.values()].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    renderSource();
    renderFacultyFilter();
    bank = await CO1.data.getQuestionBank();
    renderStats();
    renderCourseFilter();
    renderResults();
    renderViolationLog();
    renderBank();
    fillConfigForm();
    renderSession();
  }

  /* ============================ DASHBOARD ============================ */
  function wireDashboard() {
    ['fFaculty', 'fSearch', 'fCourse', 'fStatus', 'fDate'].forEach((id) => $('#' + id).addEventListener('input', () => { renderResults(); renderStats(); }));
    $('#fReset').addEventListener('click', () => {
      ['fFaculty', 'fSearch', 'fCourse', 'fStatus', 'fDate'].forEach((id) => ($('#' + id).value = ''));
      renderResults();
    });
    $('#btnRefresh').addEventListener('click', async () => { await refreshAll(); CO1.ui.toast('Results refreshed.', 'success', 1500); });
    $('#btnExcel').addEventListener('click', () => doExport('xlsx'));
    $('#btnCsv').addEventListener('click', () => doExport('csv'));
    $('#btnClear').addEventListener('click', clearResults);
    $('#resultsBody').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const r = results.find((x) => x.attemptId === btn.dataset.id);
      if (!r) return;
      if (btn.dataset.act === 'view') viewResult(r);
      if (btn.dataset.act === 'del') deleteResult(r);
    });
  }

  function renderStats() {
    const fac = $('#fFaculty') ? $('#fFaculty').value : '';
    const s = CO1.stats(fac ? results.filter((r) => normName(r.facultyName) === fac) : results);
    $('#statTotal').textContent = s.total;
    $('#statCompleted').textContent = s.completed;
    $('#statPassed').textContent = s.passed;
    $('#statFailed').textContent = s.failed;
    $('#statMal').textContent = s.malpractice;
    $('#statAvg').textContent = s.completed ? s.avgPct.toFixed(1) + '%' : '—';
    $('#statAvgMarks').textContent = s.completed ? `avg ${s.avgMarks.toFixed(2)} marks` : 'no completed attempts';
    $('#statPassRate').textContent = s.completed ? `${s.passRate.toFixed(1)}% pass rate` : '';
  }

  function renderCourseFilter() {
    const sel = $('#fCourse');
    const cur = sel.value;
    const courses = [...new Set(results.map((r) => r.courseCode))].sort();
    sel.innerHTML = '<option value="">All courses</option>' + courses.map((c) => `<option>${escapeHtml(c)}</option>`).join('');
    if (courses.includes(cur)) sel.value = cur;
  }

  const normName = (n) => String(n || '').toLowerCase().replace(/^(dr|mr|mrs|ms|prof)\.?\s*/, '').replace(/[^a-z]/g, '');
  function renderFacultyFilter() {
    const sel = $('#fFaculty');
    const cur = sel.value;
    const seen = new Map();
    results.forEach((r) => { const k = normName(r.facultyName); if (k && !seen.has(k)) seen.set(k, r.facultyName); });
    const opts = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    sel.innerHTML = '<option value="">All faculty</option>' + opts.map(([k, n]) => `<option value="${escapeHtml(k)}">${escapeHtml(n)}</option>`).join('');
    if (seen.has(cur)) sel.value = cur;
  }
  function filtered() {
    const fac = $('#fFaculty').value;
    const q = $('#fSearch').value.trim().toLowerCase();
    const course = $('#fCourse').value;
    const status = $('#fStatus').value;
    const date = $('#fDate').value;
    return results.filter((r) =>
      (!fac || normName(r.facultyName) === fac) &&
      (!q || r.studentName.toLowerCase().includes(q) || r.regNo.toLowerCase().includes(q)) &&
      (!course || r.courseCode === course) &&
      (!status || (status === 'PASS' || status === 'FAIL' ? r.result === status : r.status === status)) &&
      (!date || r.date === date));
  }

  function renderResults() {
    const rows = filtered();
    $('#resultCount').textContent = `${rows.length} of ${results.length} attempt(s)`;
    const body = $('#resultsBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="11" class="empty">${results.length ? 'No attempts match the filters.' : 'No quiz attempts yet. Results appear here as soon as students submit.'}</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((r, i) => {
      const mal = r.status === 'MALPRACTICE';
      return `<tr class="${mal ? 'row-danger' : ''}">
        <td>${i + 1}</td>
        <td><b>${escapeHtml(r.studentName)}</b></td>
        <td>${escapeHtml(r.regNo)}</td>
        <td>${escapeHtml(r.courseCode)}</td>
        <td>${escapeHtml(r.date)}<div class="muted small">${fmtTime(r.startTime)}</div></td>
        <td class="num">${mal ? '--' : `${r.marksObtained} / ${r.totalMarks}`}</td>
        <td class="num">${mal ? '--' : r.percentage.toFixed(2) + '%'}</td>
        <td>${mal ? '--' : `<span class="badge ${r.result === 'PASS' ? 'badge-success' : 'badge-danger'}">${r.result}</span>`}</td>
        <td class="num"><span class="vcount ${r.violationCount ? 'has' : ''}">${r.violationCount}</span></td>
        <td><span class="badge ${mal ? 'badge-danger' : 'badge-primary'}">${r.status}</span><div class="muted small">${escapeHtml(r.quizStatus)}</div></td>
        <td class="actions">
          <button class="btn btn-sm btn-secondary" data-act="view" data-id="${escapeHtml(r.attemptId)}">View</button>
          <button class="btn btn-sm btn-ghost-danger" data-act="del" data-id="${escapeHtml(r.attemptId)}" title="Delete this attempt (allows a re-attempt)">Delete</button>
        </td></tr>`;
    }).join('');
  }

  function viewResult(r) {
    const mal = r.status === 'MALPRACTICE';
    const vlog = (r.violations || []).length
      ? `<table class="table table-sm"><thead><tr><th>#</th><th>Time</th><th>Type</th><th>Q</th><th>Time left</th><th>Away</th></tr></thead><tbody>
          ${r.violations.map((v) => `<tr class="${v.no > r.maxViolations ? 'row-danger' : ''}"><td>${v.no}</td><td>${fmtTime(v.timestamp)}</td>
            <td>${escapeHtml(v.events && v.events.length > 1 ? v.events.join(' + ') : v.type)}${v.detail ? `<div class="muted small">${escapeHtml(v.detail)}</div>` : ''}</td>
            <td>${v.questionNo}</td><td>${v.no > r.maxViolations ? '<b>MALPRACTICE</b>' : escapeHtml(v.timeRemaining)}</td><td>${v.awaySeconds !== null && v.awaySeconds !== undefined ? v.awaySeconds + 's' : '—'}</td></tr>`).join('')}
         </tbody></table>`
      : '<p class="muted">No violations recorded.</p>';
    const byId = new Map(bank.concat(CO1.DEFAULT_QUESTIONS || []).map((q) => [q.id, q]));
    const review = (r.review || []).map((q) => {
      if (q.text) return q;
      const bq = byId.get(q.qid);
      const letters = (q.letters || 'ABCD').split('');
      return Object.assign({}, q, bq
        ? { text: bq.question, options: letters.map((L) => bq.options[L]) }
        : { text: `(question ${q.qid} is no longer in the bank)`, options: ['A', 'B', 'C', 'D'] });
    }).map((q, i) => `
      <div class="review-item ${q.isCorrect ? 'ok' : q.chosen === null ? 'skip' : 'bad'}">
        <div class="review-q"><b>Q${i + 1}.</b> ${CO1.math.html(q.text)}</div>
        <div class="small">Answer: <b>${q.chosen === null ? '—' : CO1.LETTERS[q.chosen] + '. ' + CO1.math.html(q.options[q.chosen])}</b>
        · Correct: ${CO1.LETTERS[q.correct]}. ${CO1.math.html(q.options[q.correct])}</div>
      </div>`).join('');
    CO1.ui.modal({
      title: `${r.studentName} — ${r.regNo}`,
      variant: mal ? 'danger' : 'info',
      dismissible: true,
      html: `
        <div class="detail-grid">
          <div><span>Course</span>${escapeHtml(r.courseCode)}</div>
          <div><span>Faculty</span>${escapeHtml(r.facultyName)}</div>
          <div><span>Date</span>${fmtDateLong(r.startTime)}</div>
          <div><span>Time</span>${fmtTime(r.startTime)} – ${fmtTime(r.endTime)}</div>
          <div><span>Duration</span>${fmtDuration(r.durationSec * 1000)}</div>
          <div><span>Status</span>${r.status} · ${r.quizStatus}</div>
          <div><span>Attempted</span>${r.attempted} / ${r.totalQuestions}</div>
          <div><span>Correct / Wrong</span>${mal ? '--' : `${r.correct} / ${r.wrong}`}</div>
          <div><span>Marks</span>${mal ? '--' : `${r.marksObtained} / ${r.totalMarks} (${r.percentage.toFixed(2)}%)`}</div>
          <div><span>Result</span>${r.result}</div>
          <div><span>Blocked actions</span>${r.blockedActions || 0}</div>
          <div><span>Attempt ID</span><small>${escapeHtml(r.attemptId)}</small></div>
        </div>
        <h4>Violation Log</h4>${vlog}
        <details class="mt-2"><summary>Answer sheet (${r.totalQuestions} questions, served order)</summary>${review}</details>`,
      buttons: [{ label: 'Close', value: true, className: 'btn-primary' }]
    });
  }

  async function deleteResult(r) {
    const ok = await CO1.ui.confirm('Delete attempt?',
      `<p>Delete the attempt of <b>${escapeHtml(r.studentName)}</b> (${escapeHtml(r.regNo)})?</p>
       <p class="small muted">This allows the student to attempt the quiz again. Export the results first if you need a record.</p>`, 'Delete', 'danger');
    if (!ok) return;
    if (r.source === 'online') {
      try { await CO1.remote.deleteAttempt(CO1.auth.key(), r.attemptId); }
      catch (e) { return CO1.ui.alert('Could not delete', `<p>${escapeHtml(e.message)}</p>`, 'danger'); }
    }
    await CO1.data.deleteResult(r.attemptId);
    if (CO1.storage.get(K.BROWSER_LOCK) === r.attemptId) CO1.storage.remove(K.BROWSER_LOCK);
    await refreshAll();
    CO1.ui.toast('Attempt deleted.', 'success');
  }

  function doExport(kind) {
    try {
      const onlyFiltered = $('#exportFiltered').checked;
      const rows = onlyFiltered ? filtered() : results.slice();
      const course = $('#fCourse').value || (new Set(rows.map((r) => r.courseCode)).size === 1 ? rows[0] && rows[0].courseCode : cfg.courseCode) || 'ALL';
      const facSel = $('#fFaculty');
      const facLabel = facSel.value ? facSel.options[facSel.selectedIndex].text : '';
      const tag = facLabel ? `${course}_${facLabel}` : course;
      const name = kind === 'xlsx' ? CO1.Excel.exportResults(rows, tag) : CO1.Excel.exportCSV(rows, tag);
      CO1.ui.toast(`Downloaded ${name}`, 'success');
    } catch (e) {
      console.error(e);
      CO1.ui.alert('Export failed', `<p>${escapeHtml(e.message)}</p>`, 'danger');
    }
  }

  async function clearResults() {
    if (!results.filter((r) => r.source === 'local').length) return CO1.ui.toast('There are no results stored in this browser.', 'info');
    const ok = await CO1.ui.modal({
      title: 'Clear all results?',
      variant: 'danger',
      dismissible: true,
      html: `<p>This permanently deletes the result(s) stored in <b>this browser</b>.</p>
             ${remoteInfo.state === 'ok' ? '<p class="small">Results in the Google Sheet are <b>not</b> deleted — remove rows in the sheet itself if needed.</p>' : ''}
             <p>Download the Excel file first. Type <b>CLEAR</b> to confirm:</p>
             <input id="clearConfirm" class="form-control" autocomplete="off" placeholder="CLEAR">`,
      buttons: [
        { label: 'Download Excel first', value: 'export', className: 'btn-secondary' },
        { label: 'Cancel', value: false, className: 'btn-secondary' },
        { label: 'Clear Results', value: 'clear', className: 'btn-danger' }
      ]
    });
    // the modal element is still in the DOM for ~180 ms after closing
    const typed = ($('#clearConfirm') || {}).value || '';
    if (ok === 'export') return doExport('xlsx');
    if (ok !== 'clear') return;
    if (typed.trim().toUpperCase() !== 'CLEAR') {
      return CO1.ui.toast('Results NOT cleared — you must type CLEAR.', 'warning');
    }
    await CO1.data.clearResults();
    CO1.storage.remove(K.BROWSER_LOCK);
    await refreshAll();
    CO1.ui.toast('All results cleared.', 'success');
  }

  /* ============================ MALPRACTICE LOG ============================ */
  function renderViolationLog() {
    const rows = [];
    results.forEach((r) => (r.violations || []).forEach((v) => rows.push({ r, v })));
    rows.sort((a, b) => b.v.timestamp - a.v.timestamp);
    $('#vlogCount').textContent = `${rows.length} violation(s) across ${results.filter((r) => r.violationCount).length} attempt(s)`;
    $('#vlogBody').innerHTML = rows.length ? rows.map(({ r, v }) => `
      <tr class="${v.no > r.maxViolations ? 'row-danger' : ''}">
        <td><b>${escapeHtml(r.studentName)}</b><div class="muted small">${escapeHtml(r.regNo)} · ${escapeHtml(r.courseCode)}</div></td>
        <td class="num">Violation ${v.no}</td>
        <td>${escapeHtml(r.date)}<div class="small">${fmtTime(v.timestamp)}</div></td>
        <td>${escapeHtml(v.events && v.events.length > 1 ? v.events.join(' + ') : v.type)}${v.detail ? `<div class="muted small">${escapeHtml(v.detail)}</div>` : ''}</td>
        <td class="num">Question ${v.questionNo}</td>
        <td class="num">${v.no > r.maxViolations ? '--' : escapeHtml(v.timeRemaining)}</td>
        <td>${v.no > r.maxViolations ? '<span class="badge badge-danger">MALPRACTICE</span>' : `<span class="badge badge-warning">Warning ${v.no}</span>`}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="empty">No violations recorded.</td></tr>';
  }

  /* ============================ QUESTION BANK ============================ */
  function wireBank() {
    $('#btnAddQ').addEventListener('click', () => editQuestion(-1));
    $('#btnTemplate').addEventListener('click', () => {
      try { CO1.Excel.downloadTemplate(); } catch (e) { CO1.ui.alert('Template error', `<p>${escapeHtml(e.message)}</p>`, 'danger'); }
    });
    $('#btnImport').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', onImportExcel);
    $('#btnImportJson').addEventListener('click', () => $('#jsonFile').click());
    $('#jsonFile').addEventListener('change', onImportJson);
    $('#btnExportJson').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ title: cfg.quizTitle, exportedAt: new Date().toISOString(), questions: bank }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `CO1_Question_Bank_${CO1.util.fmtDate(Date.now())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#btnResetBank').addEventListener('click', async () => {
      if (!(await CO1.ui.confirm('Reset question bank?', '<p>Replace the current bank with the default questions from <code>js/questions.js</code>?</p>', 'Reset', 'danger'))) return;
      await CO1.data.resetQuestionBank();
      await refreshAll();
      CO1.ui.toast('Question bank reset to default.', 'success');
    });
    $('#bankBody').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const i = Number(b.dataset.i);
      if (b.dataset.act === 'edit') editQuestion(i);
      if (b.dataset.act === 'del') {
        if (!(await CO1.ui.confirm('Delete question?', `<p>Delete question ${i + 1}?</p>`, 'Delete', 'danger'))) return;
        bank.splice(i, 1);
        await saveBank();
      }
      if (b.dataset.act === 'up' && i > 0) { [bank[i - 1], bank[i]] = [bank[i], bank[i - 1]]; await saveBank(); }
      if (b.dataset.act === 'down' && i < bank.length - 1) { [bank[i + 1], bank[i]] = [bank[i], bank[i + 1]]; await saveBank(); }
    });
  }

  async function saveBank() {
    try {
      await CO1.data.saveQuestionBank(bank.map((q, i) => CO1.questions.normalize(q, i)));
      await refreshAll();
    } catch (e) {
      CO1.ui.alert('Could not save', `<p>${escapeHtml(e.message)}</p>`, 'danger');
    }
  }

  function renderBank() {
    const { valid, errors } = CO1.questions.validateBank(bank);
    const totalMarks = cfg.marksMode === 'uniform'
      ? valid.length * Number(cfg.marksPerQuestion)
      : valid.reduce((a, q) => a + q.marks, 0);
    const served = cfg.questionsPerAttempt > 0 ? Math.min(cfg.questionsPerAttempt, valid.length) : valid.length;
    $('#bankSummary').innerHTML = `<b>${bank.length}</b> question(s) in bank · <b>${served}</b> served per attempt · bank total <b>${totalMarks}</b> marks`
      + (errors.length ? ` · <span class="text-danger">${errors.length} invalid (will be skipped)</span>` : '');
    $('#bankBody').innerHTML = bank.length ? bank.map((q, i) => {
      const e = CO1.questions.validate(CO1.questions.normalize(q, i));
      return `<tr class="${e.length ? 'row-danger' : ''}">
        <td class="num">${i + 1}</td>
        <td>${q.topic ? `<div class="small muted">${escapeHtml(q.topic)}</div>` : ''}<div class="q-cell">${CO1.math.html(q.question)}</div>${e.length ? `<div class="small text-danger">${escapeHtml(e.join('; '))}</div>` : ''}</td>
        <td class="small">${CO1.LETTERS.map((L) => `<div class="${L === q.answer ? 'opt-correct' : ''}"><b>${L}.</b> ${CO1.math.html(q.options ? q.options[L] : '')}</div>`).join('')}</td>
        <td class="num"><span class="badge badge-success">${escapeHtml(q.answer)}</span></td>
        <td class="num">${cfg.marksMode === 'uniform' ? `<span class="muted" title="Uniform marks mode">${cfg.marksPerQuestion}</span>` : escapeHtml(q.marks)}</td>
        <td class="actions">
          <button class="btn btn-sm btn-icon" data-act="up" data-i="${i}" title="Move up">↑</button>
          <button class="btn btn-sm btn-icon" data-act="down" data-i="${i}" title="Move down">↓</button>
          <button class="btn btn-sm btn-secondary" data-act="edit" data-i="${i}">Edit</button>
          <button class="btn btn-sm btn-ghost-danger" data-act="del" data-i="${i}">Delete</button>
        </td></tr>`;
    }).join('') : '<tr><td colspan="6" class="empty">The question bank is empty. Add questions or import an Excel file.</td></tr>';
  }

  async function editQuestion(i) {
    const q = i >= 0 ? bank[i] : { question: '', options: { A: '', B: '', C: '', D: '' }, answer: 'A', marks: 1 };
    const html = `
      <form id="qForm" class="form-grid" onsubmit="return false">
        <label class="span-2">Question<textarea id="qeText" class="form-control" rows="3">${escapeHtml(q.question)}</textarea></label>
        ${CO1.LETTERS.map((L) => `<label>Option ${L}<input id="qe${L}" class="form-control" value="${escapeHtml(q.options[L])}"></label>`).join('')}
        <label>Correct Answer<select id="qeAns" class="form-control">${CO1.LETTERS.map((L) => `<option ${L === q.answer ? 'selected' : ''}>${L}</option>`).join('')}</select></label>
        <label>Marks<input id="qeMarks" type="number" min="0.25" step="0.25" class="form-control" value="${escapeHtml(q.marks)}"></label>
        <div id="qeErr" class="span-2 small text-danger"></div>
      </form>`;
    const read = () => ({
      id: q.id || `Q${bank.length + 1}`,
      question: $('#qeText').value, answer: $('#qeAns').value, marks: Number($('#qeMarks').value),
      options: { A: $('#qeA').value, B: $('#qeB').value, C: $('#qeC').value, D: $('#qeD').value }
    });
    const ok = await CO1.ui.modal({
      title: i >= 0 ? `Edit Question ${i + 1}` : 'Add Question', variant: 'info', dismissible: true, html,
      buttons: [{ label: 'Cancel', value: false }, { label: 'Save Question', value: true, className: 'btn-primary' }]
    });
    if (!ok) return;
    // The modal element stays in the DOM ~180 ms after closing, so the fields can still be read here.
    const nq = CO1.questions.normalize(read(), i >= 0 ? i : bank.length);
    const errs = CO1.questions.validate(nq);
    if (errs.length) {
      await CO1.ui.alert('Question not saved', `<ul>${errs.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`, 'danger');
      return;
    }
    if (i >= 0) bank[i] = nq; else bank.push(nq);
    await saveBank();
    CO1.ui.toast('Question saved.', 'success');
  }

  async function applyImported(questions, errors, sourceName) {
    const errHtml = errors.length
      ? `<div class="alert alert-warning small"><b>${errors.length} row(s) skipped:</b><ul>${errors.slice(0, 15).map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>${errors.length > 15 ? '…' : ''}</div>` : '';
    if (!questions.length) {
      return CO1.ui.alert('Import failed', `<p>No valid questions were found in <b>${escapeHtml(sourceName)}</b>.</p>${errHtml}`, 'danger');
    }
    const preview = questions.slice(0, 3).map((q, i) => `<li>${CO1.math.html(q.question)} <b>(${q.answer}, ${q.marks} mark)</b></li>`).join('');
    const choice = await CO1.ui.modal({
      title: 'Import questions', variant: 'info', dismissible: true,
      html: `<p><b>${questions.length}</b> valid question(s) found in <b>${escapeHtml(sourceName)}</b>.</p>
             <ol class="small">${preview}</ol>${questions.length > 3 ? `<p class="small muted">…and ${questions.length - 3} more</p>` : ''}${errHtml}
             <p>Replace the current bank (${bank.length} questions) or append to it?</p>`,
      buttons: [{ label: 'Cancel', value: null }, { label: 'Append', value: 'append', className: 'btn-secondary' }, { label: 'Replace Bank', value: 'replace', className: 'btn-primary' }]
    });
    if (!choice) return;
    bank = choice === 'replace' ? questions : bank.concat(questions);
    bank = bank.map((q, i) => Object.assign({}, q, { id: `Q${i + 1}` }));
    await saveBank();
    CO1.ui.toast(`${questions.length} question(s) imported.`, 'success');
  }

  async function onImportExcel(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { questions, errors } = await CO1.Excel.parseQuestionFile(file);
      await applyImported(questions, errors, file.name);
    } catch (err) {
      CO1.ui.alert('Import failed', `<p>${escapeHtml(err.message)}</p><p class="small">Use <b>Download Question Template</b> to get the correct format.</p>`, 'danger');
    }
  }

  async function onImportJson(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data.questions;
      if (!Array.isArray(list)) throw new Error('JSON must be an array of questions or { "questions": [...] }');
      const { valid, errors } = CO1.questions.validateBank(list);
      await applyImported(valid, errors, file.name);
    } catch (err) {
      CO1.ui.alert('Import failed', `<p>${escapeHtml(err.message)}</p>`, 'danger');
    }
  }

  /* ============================ CONFIGURATION ============================ */
  function wireConfig() {
    $('#configForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const next = Object.assign({}, cfg);
      const errs = [];
      $$('[name]', f).forEach((el) => {
        if (el.type === 'checkbox') next[el.name] = el.checked;
        else if (el.type === 'number') next[el.name] = Number(el.value);
        else next[el.name] = el.value.trim();
      });
      if (!(next.durationMinutes >= 1 && next.durationMinutes <= 300)) errs.push('Duration must be 1–300 minutes.');
      if (!(next.questionsPerAttempt >= 0)) errs.push('Number of questions must be 0 (all) or more.');
      if (!(next.marksPerQuestion > 0)) errs.push('Marks per question must be positive.');
      if (!(next.passPercentage >= 0 && next.passPercentage <= 100)) errs.push('Pass percentage must be 0–100.');
      if (!(next.maxViolations >= 0 && next.maxViolations <= 10 && Number.isInteger(next.maxViolations))) errs.push('Maximum violations must be a whole number 0–10.');
      if (!(next.warnAtMinutes >= 0)) errs.push('Warning time must be 0 or more.');
      try { new RegExp(next.regNoPattern); } catch (x) { errs.push('Register number pattern is not a valid regular expression.'); }
      if (next.remoteEndpoint && !/^https:\/\//.test(next.remoteEndpoint)) errs.push('Remote endpoint must start with https://');
      if (errs.length) return CO1.ui.alert('Settings not saved', `<ul>${errs.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`, 'danger');
      next.courseCode = next.courseCode.toUpperCase();
      try {
        cfg = await CO1.data.saveConfig(next);
        await refreshAll();
        CO1.ui.toast('Configuration saved. New attempts will use these settings.', 'success');
      } catch (x) {
        CO1.ui.alert('Could not save', `<p>${escapeHtml(x.message)}</p>`, 'danger');
      }
    });
    $('#btnResetConfig').addEventListener('click', async () => {
      if (!(await CO1.ui.confirm('Restore defaults?', '<p>Reset all settings to their defaults? (The faculty password is kept.)</p>', 'Restore Defaults'))) return;
      cfg = await CO1.data.resetConfig();
      await refreshAll();
      CO1.ui.toast('Default settings restored.', 'success');
    });
    $('#pinForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const a = $('#newPin').value, b = $('#confirmPin').value;
      if (a.length < 6) return CO1.ui.toast('Password must be at least 6 characters.', 'danger');
      if (a !== b) return CO1.ui.toast('Passwords do not match.', 'danger');
      await CO1.auth.setPin(a);
      $('#newPin').value = $('#confirmPin').value = '';
      CO1.ui.toast('Faculty password changed.', 'success');
    });
  }

  function fillConfigForm() {
    const f = $('#configForm');
    if (f.contains(document.activeElement) && document.activeElement !== f) return; // don't overwrite while typing
    $$('[name]', f).forEach((el) => {
      const v = cfg[el.name];
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v === undefined || v === null ? '' : v;
    });
    $('#cfgSummary').textContent =
      `${cfg.durationMinutes} min · ${cfg.questionsPerAttempt > 0 ? cfg.questionsPerAttempt : 'all'} questions · pass ${cfg.passPercentage}% · ` +
      `${cfg.maxViolations} violations allowed (violation ${Number(cfg.maxViolations) + 1} = MALPRACTICE)`;
  }

  /* ============================ SESSION CONTROL ============================ */
  function wireSession() {
    $('#btnResetSession').addEventListener('click', async () => {
      const a = CO1.storage.get(K.ACTIVE);
      if (!a) return CO1.ui.toast('There is no active session in this browser.', 'info');
      const choice = await CO1.ui.modal({
        title: 'Reset active session', variant: 'danger', dismissible: true,
        html: `<p>Active attempt: <b>${escapeHtml(a.student.name)}</b> (${escapeHtml(a.student.regNo)}).</p>
               <p><b>Save &amp; close</b> records the attempt as submitted with the answers given so far.<br>
               <b>Discard</b> deletes it completely (the student can start again).</p>`,
        buttons: [{ label: 'Cancel', value: null }, { label: 'Discard Attempt', value: 'discard', className: 'btn-danger' }, { label: 'Save & Close', value: 'save', className: 'btn-primary' }]
      });
      if (!choice) return;
      if (choice === 'save') {
        if (!a.startTime) { a.startTime = a.createdAt; }
        a.endedAt = Date.now();
        const rec = CO1.Results.compute(a, a.status === 'MALPRACTICE' ? 'MALPRACTICE' : 'MANUAL');
        rec.quizStatus = a.status === 'MALPRACTICE' ? 'TERMINATED' : 'CLOSED BY FACULTY';
        rec.submissionType = 'Closed by faculty';
        await CO1.data.saveResult(rec);
      }
      CO1.storage.remove(K.ACTIVE);
      CO1.storage.remove(K.HEARTBEAT);
      await refreshAll();
      CO1.ui.toast('Active session reset.', 'success');
    });
    $('#btnClearLock').addEventListener('click', async () => {
      CO1.storage.remove(K.BROWSER_LOCK);
      CO1.storage.remove(K.LAST_RESULT);
      renderSession();
      CO1.ui.toast('Browser unlocked — the next student can register.', 'success');
    });
  }

  function renderSession() {
    const a = CO1.storage.get(K.ACTIVE);
    const hb = CO1.storage.get(K.HEARTBEAT);
    const lock = CO1.storage.get(K.BROWSER_LOCK);
    const box = $('#activeInfo');
    if (!box) return;
    if (!a) {
      box.innerHTML = '<p class="muted">No quiz is in progress in this browser.</p>';
    } else {
      const live = hb && hb.attemptId === a.attemptId && Date.now() - hb.ts < 4000;
      const rem = a.endTime ? fmtDuration(Math.max(0, a.endTime - Date.now())) : 'not started';
      box.innerHTML = `
        <div class="detail-grid">
          <div><span>Student</span>${escapeHtml(a.student.name)}</div>
          <div><span>Register No</span>${escapeHtml(a.student.regNo)}</div>
          <div><span>Course</span>${escapeHtml(a.student.courseCode)}</div>
          <div><span>Started</span>${a.startTime ? fmtTime(a.startTime) : '—'}</div>
          <div><span>Time remaining</span>${rem}</div>
          <div><span>Answered</span>${a.answers.filter((x) => x !== null).length} / ${a.questions.length}</div>
          <div><span>Violations</span>${a.violations.length} / ${a.config.maxViolations}</div>
          <div><span>Quiz tab</span>${live ? '<span class="badge badge-success">OPEN</span>' : '<span class="badge badge-warning">NOT OPEN</span>'}</div>
        </div>`;
    }
    $('#lockInfo').innerHTML = lock
      ? `<span class="badge badge-warning">LOCKED</span> An attempt was completed on this browser (${escapeHtml(lock)}). New registrations are blocked${cfg && cfg.lockBrowserAfterAttempt ? '' : ' only if “Lock browser after attempt” is ON'}.`
      : '<span class="badge badge-success">UNLOCKED</span> A new student can register on this browser.';
  }

  document.addEventListener('DOMContentLoaded', () => {
    init().catch((e) => { console.error(e); CO1.ui.fatal($('#facultyApp'), 'Something went wrong', escapeHtml(e.message)); });
  });
})();
