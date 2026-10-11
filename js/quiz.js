/* =============================================================================
 * quiz.js — Quiz engine (quiz.html)
 *
 *  • Loads the active attempt created on student.html
 *  • Detects duplicate tabs (heartbeat + BroadcastChannel)
 *  • Start gate (enters full screen — needs a user click)
 *  • Question rendering, navigation, palette, progress
 *  • Countdown timer driven by an absolute deadline (survives refresh)
 *  • Violation handling via CO1.MalpracticeMonitor (malpractice.js)
 *  • Submission, auto-submit on time-up, termination on malpractice
 * ========================================================================== */
(function () {
  'use strict';
  const CO1 = window.CO1;
  const { $, $$, escapeHtml, richText, fmtDuration } = CO1.util;
  const K = CO1.KEYS;

  const INSTANCE_ID = CO1.util.uid('INS'); // unique per page load (sessionStorage is copied by "Duplicate tab")
  let s = null;            // active session
  let tabId = null;
  let monitor = null;
  let timerId = null, hbId = null;
  let finalizing = false;
  let channel = null;
  let lastBlockedToast = 0;

  /* ======================= persistence ======================= */
  function save() {
    try {
      CO1.storage.set(K.ACTIVE, s);
    } catch (e) {
      showStorageError(e.message);
    }
  }
  function showStorageError(msg) {
    const bar = $('#storageError');
    if (bar) { bar.textContent = msg; bar.hidden = false; }
  }
  function heartbeat() {
    try { CO1.storage.set(K.HEARTBEAT, { attemptId: s.attemptId, tabId, instance: INSTANCE_ID, ts: Date.now() }); } catch (e) { /* ignore */ }
  }

  /* ======================= duplicate-session detection ======================= */
  function setupChannel() {
    if (!('BroadcastChannel' in window)) return;
    channel = new BroadcastChannel('uba10co1-quiz');
    channel.onmessage = (ev) => {
      const m = ev.data || {};
      if (m.type === 'ping' && s && m.attemptId === s.attemptId && m.instance !== INSTANCE_ID && !finalizing && monitor) {
        channel.postMessage({ type: 'pong', attemptId: s.attemptId, instance: INSTANCE_ID });
      }
    };
  }
  function anotherTabIsActive() {
    return new Promise((resolve) => {
      const hb = CO1.storage.get(K.HEARTBEAT);
      // A fresh heartbeat written by a DIFFERENT tab = the quiz is open elsewhere.
      if (hb && hb.attemptId === s.attemptId && hb.tabId !== tabId && Date.now() - hb.ts < 4000) return resolve(true);
      if (!channel) return resolve(false);
      // Ask live pages directly (also catches "Duplicate tab", which copies sessionStorage).
      let answered = false;
      const onMsg = (ev) => {
        const m = ev.data || {};
        if (m.type === 'pong' && m.attemptId === s.attemptId && m.instance !== INSTANCE_ID) { answered = true; }
      };
      channel.addEventListener('message', onMsg);
      channel.postMessage({ type: 'ping', attemptId: s.attemptId, instance: INSTANCE_ID });
      setTimeout(() => { channel.removeEventListener('message', onMsg); resolve(answered); }, 400);
    });
  }

  /* ======================= helpers ======================= */
  const remainingMs = () => (s && s.endTime ? Math.max(0, s.endTime - Date.now()) : (s ? s.config.durationMinutes * 60000 : 0));
  const total = () => s.questions.length;
  const answeredCount = () => s.answers.filter((a) => a !== null && a !== undefined).length;
  const fsEnforced = () => s.config.requireFullscreen && s.fullscreen !== false;

  /* ======================= boot ======================= */
  async function boot() {
    const root = $('#quizApp');
    if (!CO1.storage.available()) {
      return CO1.ui.fatal(root, 'Browser storage unavailable', 'This quiz needs browser storage to save your answers. Please disable private/incognito mode or allow site data, then try again.');
    }
    const cfg = await CO1.data.getConfig();
    CO1.ui.applyBranding(cfg);

    s = CO1.storage.get(K.ACTIVE);
    if (!s || !Array.isArray(s.questions) || !s.questions.length) {
      if (CO1.storage.get(K.LAST_RESULT)) { location.replace('result.html'); return; }
      location.replace('student.html');
      return;
    }
    tabId = CO1.util.tabId();
    setupChannel();

    // An attempt that already ended (e.g. terminated while the tab was closing) → finish it.
    if (s.status !== 'IN_PROGRESS') {
      await finalize(s.finishMode || (s.status === 'MALPRACTICE' ? 'MALPRACTICE' : 'MANUAL'));
      location.replace('result.html');
      return;
    }

    if (await anotherTabIsActive()) {
      channel && channel.close();
      root.innerHTML = `
        <div class="card state-card">
          <div class="state-icon warning">!</div>
          <h2>An active quiz session already exists.</h2>
          <p>This quiz is already open in another tab or window of this browser. Close this tab and continue in the original one.</p>
          <p class="muted small">Opening the quiz in several tabs is not allowed. Only your faculty can reset an active session.</p>
        </div>`;
      return;
    }

    const prevHeartbeat = CO1.storage.get(K.HEARTBEAT); // read BEFORE overwriting (absence check)
    s.ownerTab = tabId;
    save();
    heartbeat();
    renderShell();

    if (!s.startTime) {
      showStartGate();
    } else {
      startRunning(true, prevHeartbeat);
    }

    // Faculty reset / submission from another tab
    window.addEventListener('storage', (e) => {
      if (e.key === K.ACTIVE && !e.newValue && !finalizing) {
        stopAll();
        CO1.ui.fatal($('#quizApp'), 'Session closed', 'This quiz session was closed or reset by the faculty.');
      }
    });
  }

  /* ======================= shell ======================= */
  function renderShell() {
    const st = s.student;
    $('#infoName').textContent = st.name;
    $('#infoReg').textContent = st.regNo;
    $('#infoFaculty').textContent = st.facultyName;
    $('#infoCourse').textContent = st.courseCode;
    $('#examTitle').textContent = (s.config.quizTitle || 'CO1 Quiz Assessment').toUpperCase();
    $('#timer').textContent = fmtDuration(remainingMs());
    updateViolationBadge();

    $('#btnPrev').addEventListener('click', () => go(s.current - 1));
    $('#btnNext').addEventListener('click', () => go(s.current + 1));
    $('#btnClear').addEventListener('click', clearResponse);
    $('#btnSubmit').addEventListener('click', confirmSubmit);
    $('#btnSubmit2').addEventListener('click', confirmSubmit);
    document.addEventListener('keydown', onShortcut);
    if (!s.config.allowBackNavigation) $('#navHint').hidden = false;
  }

  function showStartGate() {
    const gate = $('#gate');
    gate.innerHTML = `
      <div class="gate-card">
        <div class="state-icon primary">▶</div>
        <h2>You are ready to begin</h2>
        <ul class="gate-facts">
          <li><b>${total()}</b> questions</li>
          <li><b>${s.config.durationMinutes}</b> minutes</li>
          <li>Max <b>${s.config.maxViolations}</b> violations</li>
        </ul>
        <p>${fsEnforced() ? 'The quiz will open in <b>full-screen mode</b>. ' : ''}The timer starts as soon as you click <b>Start Quiz Now</b>. Do not leave this screen until you submit.</p>
        <button id="btnBegin" class="btn btn-primary btn-lg" type="button">Start Quiz Now</button>
      </div>`;
    gate.hidden = false;
    $('#examLayout').classList.add('blurred');
    $('#btnBegin').addEventListener('click', begin, { once: true });
  }

  async function begin() {
    if (s.config.requireFullscreen) {
      try {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        s.fullscreen = true;
      } catch (e) {
        s.fullscreen = false; // browser refused (e.g. embedded frame) — continue without it
        CO1.ui.toast('Full-screen mode is not available in this browser window. Continuing in normal mode.', 'warning', 6000);
      }
    }
    s.startTime = Date.now();
    s.endTime = s.startTime + Number(s.config.durationMinutes) * 60000;
    save();
    startRunning(false);
  }

  /** Start timer, heartbeat and monitoring. resumed = page was reloaded mid-quiz. */
  function startRunning(resumed, prevHeartbeat) {
    $('#gate').hidden = true;
    $('#examLayout').classList.remove('blurred');
    renderPalette();
    renderQuestion();

    monitor = new CO1.MalpracticeMonitor({
      cooldownMs: Number(s.config.violationCooldownMs) || 2000,
      requireFullscreen: fsEnforced(),
      blockCopyPaste: s.config.blockCopyPaste !== false,
      getContext: () => ({ questionNo: s.current + 1, timeRemaining: fmtDuration(remainingMs()) }),
      onViolation: handleViolation,
      onViolationUpdate: (rec) => {
        const v = s.violations.find((x) => x.timestamp === rec.timestamp);
        if (v) { v.events = rec.events.slice(); v.awaySeconds = rec.awaySeconds; save(); }
      },
      onFullscreenLost: showFullscreenGate,
      onFullscreenRestored: hideFullscreenGate,
      onBlockedAction: (what) => {
        s.blockedActions = (s.blockedActions || 0) + 1;
        save();
        if (Date.now() - lastBlockedToast > 2500) {
          lastBlockedToast = Date.now();
          CO1.ui.toast(`${what} is disabled during the quiz.`, 'warning', 2500);
        }
      }
    });
    monitor.start();

    // Resume after refresh / re-open: a long absence is a violation (a quick refresh is not).
    if (resumed) {
      const hb = prevHeartbeat;
      const lastSeen = hb && hb.attemptId === s.attemptId ? hb.ts : 0; // heartbeat is written every second
      const gapSec = lastSeen ? Math.round((Date.now() - lastSeen) / 1000) : 0;
      if (gapSec > Number(s.config.reloadGraceSeconds || 20)) {
        monitor.registerViolation('ABSENCE', { immediate: true, detail: `Away from the quiz page for ${gapSec}s (page closed/reloaded)` });
      } else {
        CO1.ui.toast('Your quiz has been restored. Answers, timer and violations were preserved.', 'success');
      }
      if (fsEnforced() && !document.fullscreenElement && s.status === 'IN_PROGRESS') showFullscreenGate(true);
    }

    heartbeat();
    hbId = setInterval(heartbeat, 1000);
    tick();
    timerId = setInterval(tick, 250);
  }

  function stopAll() {
    clearInterval(timerId);
    clearInterval(hbId);
    if (monitor) monitor.stop();
  }

  /* ======================= full screen gate ======================= */
  function showFullscreenGate(afterReload) {
    if (s.status !== 'IN_PROGRESS' || finalizing) return;
    const gate = $('#gate');
    gate.innerHTML = `
      <div class="gate-card">
        <div class="state-icon warning">⤢</div>
        <h2>${afterReload ? 'Resume in full-screen mode' : 'Full-screen mode exited'}</h2>
        <p>The quiz must be taken in full-screen mode. The timer is still running.</p>
        <button id="btnFs" class="btn btn-primary btn-lg" type="button">Return to Full Screen</button>
      </div>`;
    gate.hidden = false;
    $('#examLayout').classList.add('blurred');
    $('#btnFs').addEventListener('click', async () => {
      try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); }
      catch (e) { CO1.ui.toast('Could not enter full screen. Press F11 or try again.', 'danger'); }
    });
  }
  function hideFullscreenGate() {
    if (!s.startTime) return;
    $('#gate').hidden = true;
    $('#examLayout').classList.remove('blurred');
  }

  /* ======================= timer ======================= */
  function tick() {
    if (!s || s.status !== 'IN_PROGRESS') return;
    const ms = remainingMs();
    const el = $('#timer');
    el.textContent = fmtDuration(ms);
    const box = $('#timerBox');
    box.classList.toggle('warn', ms <= Number(s.config.warnAtMinutes) * 60000);
    box.classList.toggle('critical', ms <= 60000);

    const warnMs = Number(s.config.warnAtMinutes) * 60000;
    if (!s.warnedLowTime && ms <= warnMs && ms > 0 && s.endTime - s.startTime > warnMs) {
      s.warnedLowTime = true;
      save();
      CO1.ui.toast(`Only ${s.config.warnAtMinutes} minutes remaining. The quiz will be submitted automatically at 00:00.`, 'warning', 8000);
    }
    if (ms <= 0) {
      s.endedAt = s.endTime;
      finalize('TIME_UP').then((ok) => {
        if (!ok) return;
        CO1.ui.modal({ title: 'Time is up', variant: 'info', html: '<p>Your quiz has been submitted automatically.</p>', buttons: [{ label: 'View Result', value: true, className: 'btn-primary' }] })
          .then(() => location.replace('result.html'));
        setTimeout(() => location.replace('result.html'), 4000);
      });
    }
  }

  /* ======================= violations ======================= */
  function updateViolationBadge() {
    const n = (s.violations || []).length;
    const max = Number(s.config.maxViolations);
    const pill = $('#violationPill');
    $('#violationCount').textContent = `${Math.min(n, max + 1)} / ${max}`;
    pill.classList.toggle('level-1', n > 0 && n < max);
    pill.classList.toggle('level-2', n >= max);
  }

  function handleViolation(rec) {
    if (!s || s.status !== 'IN_PROGRESS' || finalizing) return;
    rec.no = s.violations.length + 1;
    s.violations.push(rec);
    save();
    updateViolationBadge();

    const max = Number(s.config.maxViolations);
    if (rec.no > max) return terminate();

    $$('.modal-backdrop').forEach((m) => m.remove()); // only one warning visible at a time
    const final = rec.no === max;
    const msg = final
      ? `<b>Warning ${rec.no}:</b> This is your final warning. One more violation will terminate the quiz.`
      : `<b>Warning ${rec.no}:</b> Leaving the quiz screen is not permitted. Further violations may terminate the quiz.`;
    CO1.ui.modal({
      title: final ? 'Final Warning' : 'Malpractice Warning',
      variant: final ? 'danger' : 'warning',
      html: `<p>${msg}</p>
             <p class="small muted">Recorded: ${escapeHtml(rec.type)} · Question ${rec.questionNo} · ${CO1.util.fmtTime(rec.timestamp)}</p>
             <p class="small">Malpractice Violations: <b>${rec.no} / ${max}</b></p>`,
      buttons: [{ label: 'I understand — continue', value: true, className: final ? 'btn-danger' : 'btn-primary' }]
    });
  }

  async function terminate() {
    s.status = 'MALPRACTICE';
    s.endedAt = Date.now();
    save();
    stopAll();
    $('#examLayout').classList.add('locked');
    $$('#examLayout button, #examLayout input').forEach((b) => (b.disabled = true));
    $$('.modal-backdrop').forEach((m) => m.remove());
    await finalize('MALPRACTICE');
    CO1.ui.modal({
      title: 'Malpractice Detected',
      variant: 'danger',
      html: '<p>You have exceeded the maximum number of permitted violations. <b>Your quiz has been terminated.</b></p><p class="small muted">Your details, answers and the violation log have been recorded for your faculty.</p>',
      buttons: [{ label: 'View Status', value: true, className: 'btn-danger' }]
    }).then(() => location.replace('result.html'));
    setTimeout(() => location.replace('result.html'), 6000);
  }

  /* ======================= finalize (submit / time-up / malpractice) ======================= */
  async function finalize(mode) {
    if (finalizing) return false;
    finalizing = true;
    stopAll();
    if (mode !== 'MALPRACTICE') s.status = 'COMPLETED';
    s.endedAt = s.endedAt || Date.now();
    s.finishMode = mode;
    save();
    try {
      const rec = CO1.Results.compute(s, mode);
      await CO1.data.saveResult(rec);
      await CO1.remote.push(rec, 60000);  // queued; result.html sends it (with random spacing)
      CO1.storage.set(K.LAST_RESULT, s.attemptId);
      if (s.config.lockBrowserAfterAttempt) CO1.storage.set(K.BROWSER_LOCK, s.attemptId);
      CO1.storage.remove(K.ACTIVE);       // final submission lock: the attempt can no longer be opened
      CO1.storage.remove(K.HEARTBEAT);
    } catch (e) {
      finalizing = false;
      await CO1.ui.modal({
        title: 'Could not save your result', variant: 'danger',
        html: `<p>${escapeHtml(e.message)}</p><p>Do not close this page. Inform your faculty immediately.</p>`,
        buttons: [{ label: 'Try Again', value: true, className: 'btn-primary' }]
      });
      return finalize(mode);
    }
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch (e) { /* ignore */ } }
    if (channel) channel.close();
    return true;
  }

  async function confirmSubmit() {
    if (finalizing || s.status !== 'IN_PROGRESS') return;
    const a = answeredCount();
    const ok = await CO1.ui.modal({
      title: 'Submit Quiz',
      variant: 'info',
      dismissible: true,
      html: `<p><b>Are you sure you want to submit your quiz?</b></p>
        <div class="submit-stats">
          <div><span>${a}</span>Answered</div>
          <div class="${total() - a ? 'warn' : ''}"><span>${total() - a}</span>Unanswered</div>
          <div><span id="submitTime">${fmtDuration(remainingMs())}</span>Time remaining</div>
        </div>
        ${total() - a ? '<p class="small text-danger">You still have unanswered questions.</p>' : ''}
        <p class="small muted">After submission your answers are locked and cannot be changed.</p>`,
      buttons: [
        { label: 'Cancel', value: false, className: 'btn-secondary' },
        { label: 'Submit Quiz', value: true, className: 'btn-success' }
      ]
    });
    if (!ok || finalizing || s.status !== 'IN_PROGRESS') return;
    if (await finalize('MANUAL')) location.replace('result.html');
  }

  /* ======================= questions & navigation ======================= */
  function canVisit(i) {
    if (i < 0 || i >= total()) return false;
    if (!s.config.allowBackNavigation && i < s.current) return false;
    return true;
  }

  function go(i) {
    if (s.status !== 'IN_PROGRESS' || !canVisit(i)) return;
    s.current = i;
    save();
    renderQuestion();
  }

  function renderQuestion() {
    const i = s.current;
    const q = s.questions[i];
    s.visited[i] = true;
    save();
    const chosen = s.answers[i];
    const card = $('#questionCard');
    card.innerHTML = `
      <div class="q-head">
        <span class="q-num">Question ${i + 1} <small>of ${total()}</small></span>
        <span class="q-marks">${q.marks} Mark${q.marks > 1 ? 's' : ''}</span>
      </div>
      <div class="q-text" id="qText">${CO1.math.html(q.text)}</div>
      <div class="options" role="radiogroup" aria-labelledby="qText">
        ${q.options.map((o, k) => `
          <button type="button" class="option ${chosen === k ? 'selected' : ''}" role="radio" aria-checked="${chosen === k}" data-k="${k}">
            <span class="opt-letter">${CO1.LETTERS[k]}</span>
            <span class="opt-text">${CO1.math.html(o)}</span>
          </button>`).join('')}
      </div>`;
    $$('.option', card).forEach((btn) => btn.addEventListener('click', () => choose(Number(btn.dataset.k))));

    $('#btnPrev').disabled = !canVisit(i - 1);
    const last = i === total() - 1;
    $('#btnNext').hidden = last;
    $('#btnSubmit2').hidden = !last;
    $('#btnClear').disabled = chosen === null || chosen === undefined;
    renderPalette();
    updateProgress();
  }

  function choose(k) {
    if (s.status !== 'IN_PROGRESS') return;
    s.answers[s.current] = k;
    save();
    $$('#questionCard .option').forEach((b) => {
      const on = Number(b.dataset.k) === k;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-checked', on);
    });
    $('#btnClear').disabled = false;
    renderPalette();
    updateProgress();
  }

  function clearResponse() {
    if (s.status !== 'IN_PROGRESS') return;
    s.answers[s.current] = null;
    save();
    renderQuestion();
  }

  function renderPalette() {
    const grid = $('#palette');
    grid.innerHTML = s.questions.map((_, i) => {
      const ans = s.answers[i] !== null && s.answers[i] !== undefined;
      const cls = ans ? 'answered' : s.visited[i] ? 'not-answered' : 'not-visited';
      const cur = i === s.current ? ' current' : '';
      const dis = canVisit(i) ? '' : ' disabled';
      return `<button type="button" class="pal ${cls}${cur}" data-i="${i}"${dis} title="Question ${i + 1}">${i + 1}</button>`;
    }).join('');
    $$('.pal', grid).forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.i))));

    const a = answeredCount();
    const visitedUnanswered = s.questions.filter((_, i) => s.visited[i] && (s.answers[i] === null || s.answers[i] === undefined)).length;
    $('#cntAnswered').textContent = a;
    $('#cntNotAnswered').textContent = visitedUnanswered;
    $('#cntNotVisited').textContent = s.visited.filter((v) => !v).length;
  }

  function updateProgress() {
    const pct = Math.round((answeredCount() / total()) * 100);
    $('#progressBar').style.width = pct + '%';
    $('#progressText').textContent = `${answeredCount()} of ${total()} answered (${pct}%)`;
  }

  function onShortcut(e) {
    if (!s || s.status !== 'IN_PROGRESS' || !s.startTime || $('.modal-backdrop') || !$('#gate').hidden) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toUpperCase();
    const idx = ['A', 'B', 'C', 'D'].indexOf(k);
    if (idx >= 0) { choose(idx); e.preventDefault(); }
    else if (e.key === 'ArrowRight') go(s.current + 1);
    else if (e.key === 'ArrowLeft') go(s.current - 1);
  }

  document.addEventListener('DOMContentLoaded', () => {
    boot().catch((e) => {
      console.error(e);
      CO1.ui.fatal($('#quizApp'), 'Something went wrong', escapeHtml(e.message || String(e)));
    });
  });
})();
