/* =============================================================================
 * student.js — Registration + instructions (student.html)
 * Step 1: registration form & validation
 * Step 2: instructions + "I have read and understood" checkbox
 * Then: creates the attempt (session) and opens quiz.html
 * ========================================================================== */
(function () {
  'use strict';
  const CO1 = window.CO1;
  const { $, escapeHtml } = CO1.util;
  const K = CO1.KEYS;

  let cfg = null;
  let bank = null;
  let pendingStudent = null;

  function fieldError(id, msg) {
    const input = $('#' + id);
    const err = $(`#${id}Err`);
    input.classList.toggle('is-invalid', !!msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (err) err.textContent = msg || '';
    return !msg;
  }

  function showBlock(title, html, actions = '') {
    $('#regStep').hidden = true;
    $('#instStep').hidden = true;
    const b = $('#blockStep');
    b.hidden = false;
    b.innerHTML = `
      <div class="card state-card">
        <div class="state-icon warning">!</div>
        <h2>${title}</h2>
        ${html}
        <div class="btn-row center">${actions || '<a class="btn btn-secondary" href="index.html">Return to Home</a>'}</div>
      </div>`;
  }

  async function init() {
    if (!CO1.storage.available()) {
      return showBlock('Browser storage unavailable', '<p>This quiz needs browser storage (localStorage). Please turn off private/incognito mode or allow site data for this page.</p>');
    }
    cfg = await CO1.data.getConfig();
    bank = await CO1.data.getQuestionBank();
    CO1.ui.applyBranding(cfg);

    const { valid } = CO1.questions.validateBank(bank);
    const qCount = cfg.questionsPerAttempt > 0 ? Math.min(cfg.questionsPerAttempt, valid.length) : valid.length;
    $('#factQuestions').textContent = qCount;
    $('#factDuration').textContent = cfg.durationMinutes + ' min';
    $('#factViolations').textContent = cfg.maxViolations;
    $('#factPass').textContent = cfg.passPercentage + '%';
    $('#instViolations').textContent = cfg.maxViolations;
    $('#instTerminate').textContent = ordinal(Number(cfg.maxViolations) + 1);
    $('#instDuration').textContent = cfg.durationMinutes;
    $('#instQuestions').textContent = qCount;
    if (!cfg.allowBackNavigation) $('#instNoBack').hidden = false;
    if (cfg.requireFullscreen) $('#instFullscreen').hidden = false;
    $('#regNoHint').textContent = cfg.regNoHint || '';
    if (await CO1.remote.enabled()) CO1.remote.flush().catch(() => {}); // send any result left from an earlier student

    // Pre-fill faculty name / course code from the faculty configuration
    const facList = (CO1.SITE.FACULTY_LIST || []).filter(Boolean);
    if (facList.length) {
      // Choose from a list → no spelling differences between students of the same faculty
      const sel = document.createElement('select');
      sel.id = 'facultyName';
      sel.className = 'form-control';
      sel.innerHTML = '<option value="">— Select your faculty —</option>' + facList.map((f) => `<option>${escapeHtml(f)}</option>`).join('');
      $('#facultyName').replaceWith(sel);
    }
    if (cfg.facultyName) $('#facultyName').value = cfg.facultyName;
    if (cfg.courseCode) $('#courseCode').value = cfg.courseCode;
    if (cfg.enforceCourseCode && cfg.courseCode) $('#courseCode').readOnly = true;

    // ---- 1. An attempt is already running in this browser ----
    const active = CO1.storage.get(K.ACTIVE);
    if (active && active.status === 'IN_PROGRESS') {
      return showBlock('An active quiz session already exists.',
        `<p>A quiz attempt is already in progress in this browser for
          <b>${escapeHtml(active.student.name)}</b> (${escapeHtml(active.student.regNo)}).</p>
         <p class="small muted">A new attempt cannot be started until this one is submitted or the faculty resets the session.
         If this is your attempt, resume it below — your answers, timer and violations are preserved.</p>`,
        `<a class="btn btn-primary" href="quiz.html">Resume My Quiz</a><a class="btn btn-secondary" href="index.html">Home</a>`);
    }
    if (active) {
      // attempt ended but was not finalised (rare: tab closed during save) → let quiz.html finish it
      location.replace('quiz.html');
      return;
    }

    // ---- 2. Browser already used for an attempt (lab mode) ----
    const lock = CO1.storage.get(K.BROWSER_LOCK);
    if (cfg.lockBrowserAfterAttempt && lock) {
      return showBlock('Attempt already completed on this browser',
        '<p>A quiz attempt has already been completed on this computer/browser. Another attempt is not allowed until your faculty resets the session.</p>',
        `<a class="btn btn-primary" href="result.html">View Last Result</a><a class="btn btn-secondary" href="index.html">Home</a>`);
    }

    // ---- 3. No questions ----
    if (!valid.length) {
      return showBlock('Quiz not available', '<p>The question bank is empty or invalid. Please inform your faculty.</p>');
    }

    $('#regForm').addEventListener('submit', onRegister);
    $('#agree').addEventListener('change', (e) => { $('#btnBegin').disabled = !e.target.checked; });
    $('#btnBack').addEventListener('click', () => { $('#instStep').hidden = true; $('#regStep').hidden = false; });
    $('#btnBegin').addEventListener('click', onBegin);
    ['studentName', 'regNo', 'facultyName', 'courseCode'].forEach((id) =>
      $('#' + id).addEventListener('input', () => fieldError(id, '')));
  }

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  async function onRegister(e) {
    e.preventDefault();
    const name = $('#studentName').value.trim().replace(/\s+/g, ' ');
    const regNo = $('#regNo').value.trim().toUpperCase();
    const facultyName = $('#facultyName').value.trim().replace(/\s+/g, ' ');
    const courseCode = $('#courseCode').value.trim().toUpperCase();

    let ok = true;
    ok = fieldError('studentName',
      !name ? 'Student name is required.' :
      !/^[A-Za-z][A-Za-z .'-]{1,79}$/.test(name) ? 'Use letters, spaces and . \' - only (2–80 characters).' : '') && ok;

    let pattern;
    try { pattern = new RegExp(cfg.regNoPattern || '^[A-Za-z0-9]{5,15}$'); } catch (err) { pattern = /^[A-Za-z0-9]{5,15}$/; }
    ok = fieldError('regNo', !regNo ? 'Register number is required.' : !pattern.test(regNo) ? `Invalid register number. ${cfg.regNoHint || ''}` : '') && ok;
    ok = fieldError('facultyName', !facultyName ? 'Faculty name is required.' : facultyName.length < 3 ? 'Enter the full faculty name.' : '') && ok;
    ok = fieldError('courseCode',
      !courseCode ? 'Course code is required.' :
      !/^[A-Z0-9][A-Z0-9 -]{1,19}$/.test(courseCode) ? 'Invalid course code (letters, digits, hyphen).' :
      cfg.enforceCourseCode && cfg.courseCode && courseCode !== cfg.courseCode.toUpperCase() ? `This quiz is for course ${cfg.courseCode}.` : '') && ok;
    if (!ok) { CO1.ui.toast('Please correct the highlighted fields.', 'danger'); return; }

    // Duplicate attempt (same register number + course code)
    const results = await CO1.data.getResults();
    const dup = results.find((r) => r.regNo === regNo && r.courseCode === courseCode);
    if (dup) {
      return showBlock('Quiz already attempted',
        `<p>Register number <b>${escapeHtml(regNo)}</b> has already attempted this quiz for <b>${escapeHtml(courseCode)}</b>
         (${escapeHtml(dup.status)}, ${escapeHtml(dup.date)}).</p><p class="small muted">Only the faculty can allow a re-attempt.</p>`);
    }
    // Online mode: also check the central sheet (other computers / earlier classes)
    if (await CO1.remote.enabled()) {
      const btn = $('#regForm button[type=submit]');
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Checking…';
      const chk = await CO1.remote.checkAttempt(regNo, courseCode);
      btn.disabled = false;
      btn.textContent = label;
      if (chk && chk.exists) {
        return showBlock('Quiz already attempted',
          `<p>Register number <b>${escapeHtml(regNo)}</b> has already attempted this quiz for <b>${escapeHtml(courseCode)}</b>
           (${escapeHtml(chk.status || '')}${chk.date ? ', ' + escapeHtml(chk.date) : ''}).</p>
           <p class="small muted">Only the faculty can allow a re-attempt.</p>`);
      }
      // chk === null → server could not be reached; the attempt is allowed and checked later by the faculty
    }

    pendingStudent = { name, regNo, facultyName, courseCode };
    $('#confirmName').textContent = name;
    $('#confirmReg').textContent = regNo;
    $('#confirmFaculty').textContent = facultyName;
    $('#confirmCourse').textContent = courseCode;
    $('#regStep').hidden = true;
    $('#instStep').hidden = false;
    $('#agree').checked = false;
    $('#btnBegin').disabled = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onBegin() {
    if (!$('#agree').checked || !pendingStudent) {
      CO1.ui.toast('Please confirm that you have read and understood the instructions.', 'danger');
      return;
    }
    // Re-check: another tab may have started a quiz meanwhile
    if (CO1.storage.get(K.ACTIVE)) {
      return showBlock('An active quiz session already exists.', '<p>A quiz attempt is already active in this browser.</p>',
        '<a class="btn btn-primary" href="quiz.html">Go to Active Quiz</a>');
    }
    try {
      const questions = CO1.questions.buildAttempt(bank, cfg);
      const snapshot = {};
      ['quizTitle', 'courseName', 'sessionLabel', 'durationMinutes', 'passPercentage', 'maxViolations', 'allowBackNavigation', 'showCorrectAnswers',
        'requireFullscreen', 'blockCopyPaste', 'lockBrowserAfterAttempt', 'warnAtMinutes', 'violationCooldownMs',
        'reloadGraceSeconds', 'randomizeQuestions', 'randomizeOptions'].forEach((k) => (snapshot[k] = cfg[k]));

      const session = {
        attemptId: CO1.util.uid('ATT'),
        createdAt: Date.now(),
        student: pendingStudent,
        config: snapshot,                // settings frozen for this attempt
        questions,
        answers: questions.map(() => null),
        visited: questions.map(() => false),
        current: 0,
        startTime: null,                 // set when the student clicks "Start Quiz Now"
        endTime: null,
        status: 'IN_PROGRESS',
        violations: [],
        blockedActions: 0,
        ownerTab: CO1.util.tabId()
      };
      CO1.storage.set(K.ACTIVE, session);
      CO1.storage.remove(K.LAST_RESULT);
      location.href = 'quiz.html';
    } catch (err) {
      CO1.ui.alert('Unable to start the quiz', `<p>${escapeHtml(err.message)}</p>`, 'danger');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    init().catch((e) => {
      console.error(e);
      showBlock('Something went wrong', `<p>${escapeHtml(e.message || String(e))}</p>`);
    });
  });
})();
