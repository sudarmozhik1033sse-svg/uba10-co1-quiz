/* =============================================================================
 * results.js — Score calculation (shared) + result page rendering
 * ========================================================================== */
(function () {
  'use strict';
  const CO1 = (window.CO1 = window.CO1 || {});
  const U = () => CO1.util;

  CO1.Results = {
    /**
     * Build the immutable final record from a session.
     * @param {object} s     active session
     * @param {string} mode  'MANUAL' | 'TIME_UP' | 'MALPRACTICE'
     */
    compute(s, mode) {
      const end = s.endedAt || Date.now();
      const qs = s.questions;
      let correct = 0, wrong = 0, attempted = 0, obtained = 0, total = 0;
      const review = qs.map((q, i) => {
        const chosen = s.answers[i];
        total += Number(q.marks);
        const isAnswered = chosen !== null && chosen !== undefined;
        const isCorrect = isAnswered && chosen === q.correct;
        if (isAnswered) attempted++;
        if (isCorrect) { correct++; obtained += Number(q.marks); }
        else if (isAnswered) wrong++;
        return {
          qid: q.qid, letters: (q.originalLetters || []).join(''), text: q.text, options: q.options, marks: q.marks,
          correct: q.correct, chosen: isAnswered ? chosen : null, isCorrect
        };
      });
      const mal = mode === 'MALPRACTICE';
      const pct = total > 0 ? Math.round((obtained / total) * 10000) / 100 : 0;
      const pass = pct >= Number(s.config.passPercentage);
      const violations = s.violations || [];

      return {
        attemptId: s.attemptId,
        quizTitle: s.config.quizTitle,
        courseName: s.config.courseName || '',
        sessionLabel: s.config.sessionLabel || '',
        studentName: s.student.name,
        regNo: s.student.regNo,
        facultyName: s.student.facultyName,
        courseCode: s.student.courseCode,
        date: U().fmtDate(s.startTime),
        startTime: s.startTime,
        endTime: end,
        durationSec: Math.max(0, Math.round((end - s.startTime) / 1000)),
        totalQuestions: qs.length,
        attempted,
        correct,
        wrong,
        unanswered: qs.length - attempted,
        totalMarks: total,
        marksObtained: obtained,
        percentage: pct,
        passPercentage: Number(s.config.passPercentage),
        result: mal ? 'MALPRACTICE' : pass ? 'PASS' : 'FAIL',
        violationCount: violations.length,
        maxViolations: Number(s.config.maxViolations),
        violations,
        violationDetails: CO1.describeViolations(violations, Number(s.config.maxViolations)),
        blockedActions: s.blockedActions || 0,
        status: mal ? 'MALPRACTICE' : 'COMPLETED',
        quizStatus: mal ? 'TERMINATED' : mode === 'TIME_UP' ? 'AUTO-SUBMITTED' : 'SUBMITTED',
        submissionType: mal ? 'Terminated (malpractice)' : mode === 'TIME_UP' ? 'Auto (time up)' : 'Manual',
        showCorrectAnswers: !!s.config.showCorrectAnswers,
        review,
        locked: true,
        savedAt: Date.now()
      };
    },

    /* ---------------------- result.html ---------------------- */
    async renderPage(root) {
      if (!CO1.storage.available()) {
        return CO1.ui.fatal(root, 'Storage unavailable', 'Browser storage is disabled, so the result cannot be displayed.');
      }
      const cfg = await CO1.data.getConfig();
      CO1.ui.applyBranding(cfg);

      // If an attempt is still running, the student belongs on the quiz page.
      const active = CO1.storage.get(CO1.KEYS.ACTIVE);
      if (active && active.status === 'IN_PROGRESS') { location.replace('quiz.html'); return; }

      const id = CO1.storage.get(CO1.KEYS.LAST_RESULT);
      const r = id ? await CO1.data.getResult(id) : null;
      if (!r) {
        return CO1.ui.fatal(root, 'No result found', 'No completed quiz was found in this browser. If you have just finished, ask your faculty to check the Faculty Dashboard.');
      }
      root.innerHTML = r.status === 'MALPRACTICE' ? this._malpracticeHtml(r) : this._resultHtml(r);
      const pr = document.getElementById('btnPrint');
      if (pr) pr.addEventListener('click', () => window.print());

      await this._sync(r);

      // Block the browser Back button from returning to the quiz.
      history.pushState(null, '', location.href);
      window.addEventListener('popstate', () => history.pushState(null, '', location.href));
    },

    /** Online mode: send the result to the faculty's Google Sheet and show the status. */
    async _sync(r) {
      const box = document.getElementById('syncBox');
      if (!box || !(await CO1.remote.enabled())) { if (box) box.remove(); return; }
      const render = () => {
        const st = CO1.remote.status(r.attemptId);
        if (st === 'synced') {
          box.className = 'sync-box ok';
          box.innerHTML = '<b>✔ Your result has been submitted to your faculty.</b> You may close this page.';
        } else {
          box.className = 'sync-box wait';
          box.innerHTML = `<span class="spinner"></span><b>Submitting your result to your faculty…</b>
            <div class="small">Keep this page open until you see the green tick.${CO1.remote.lastError ? ' (Retrying: ' + CO1.util.escapeHtml(CO1.remote.lastError) + ')' : ''}</div>
            <button type="button" class="btn btn-sm btn-secondary mt-2" id="btnRetrySync">Retry now</button>`;
          const b = document.getElementById('btnRetrySync');
          if (b) b.addEventListener('click', () => CO1.remote.flush());
        }
      };
      window.addEventListener('co1-sync', render);
      render();
      if (CO1.remote.status(r.attemptId) === 'synced') return;
      // Spread out the requests: when the timer ends, a whole class submits at the same second.
      const maxDelay = r.submissionType === 'Auto (time up)' ? 15000 : 3000;
      setTimeout(() => CO1.remote.flush(), Math.random() * maxDelay);
      // keep trying every 20 s while the page is open
      setInterval(() => { if (CO1.remote.status(r.attemptId) !== 'synced') CO1.remote.flush(); }, 20000);
    },

    _row(label, value, cls = '') {
      return `<tr><th>${label}</th><td class="${cls}">${value}</td></tr>`;
    },

    _identity(r) {
      const e = U().escapeHtml;
      return this._row('Student Name', e(r.studentName)) +
        this._row('Register Number', e(r.regNo)) +
        this._row('Faculty Name', e(r.facultyName)) +
        this._row('Course Code', e(r.courseCode));
    },

    _resultHtml(r) {
      const u = U();
      const pass = r.result === 'PASS';
      let review = '';
      if (r.showCorrectAnswers) {
        review = `<div class="card mt-3"><h3 class="card-title">Answer Review</h3>` +
          r.review.map((q, i) => `
            <div class="review-item ${q.isCorrect ? 'ok' : q.chosen === null ? 'skip' : 'bad'}">
              <div class="review-q"><b>Q${i + 1}.</b> ${CO1.math.html(q.text)} <span class="muted">(${q.marks} mark${q.marks > 1 ? 's' : ''})</span></div>
              <ol class="review-opts" type="A">
                ${q.options.map((o, k) => `<li class="${k === q.correct ? 'is-correct' : ''} ${k === q.chosen && k !== q.correct ? 'is-wrong' : ''}">${CO1.math.html(o)}${k === q.chosen ? ' <em>(your answer)</em>' : ''}</li>`).join('')}
              </ol>
            </div>`).join('') + `</div>`;
      }
      return `
        <div id="syncBox" class="sync-box"></div>
        <div class="card result-card">
          <div class="result-banner ${pass ? 'pass' : 'fail'}">
            <div>
              <div class="eyebrow">Quiz Result · ${u.escapeHtml(r.sessionLabel || '')}</div>
              <h2>${u.escapeHtml(r.quizTitle || 'CO1 Quiz')}</h2>
              <div class="banner-sub">${u.escapeHtml(r.courseName || '')}</div>
            </div>
            <div class="score-ring" style="--p:${Math.min(100, r.percentage)}">
              <span>${r.percentage.toFixed(1)}%</span>
            </div>
          </div>
          <div class="result-grid">
            <table class="kv">
              ${this._identity(r)}
              ${this._row('Date', u.fmtDateLong(r.startTime))}
              ${this._row('Start Time', u.fmtTime(r.startTime))}
              ${this._row('End Time', u.fmtTime(r.endTime))}
              ${this._row('Duration', u.fmtDuration(r.durationSec * 1000))}
              ${this._row('Submission', r.submissionType)}
            </table>
            <table class="kv">
              ${this._row('Total Questions', r.totalQuestions)}
              ${this._row('Attempted Questions', r.attempted)}
              ${this._row('Correct Answers', r.correct, 'text-success')}
              ${this._row('Wrong Answers', r.wrong, 'text-danger')}
              ${this._row('Unanswered Questions', r.unanswered)}
              ${this._row('Total Marks', r.totalMarks)}
              ${this._row('Marks Obtained', `<b>${r.marksObtained}</b>`)}
              ${this._row('Percentage', r.percentage.toFixed(2) + '%')}
              ${this._row('Result', `<span class="badge ${pass ? 'badge-success' : 'badge-danger'}">${r.result}</span>`)}
              ${this._row('Malpractice Violations', `${r.violationCount} / ${r.maxViolations}`)}
              ${this._row('Status', '<span class="badge badge-primary">COMPLETED</span>')}
            </table>
          </div>
          <div class="result-actions no-print">
            <button id="btnPrint" class="btn btn-secondary" type="button">Print / Save as PDF</button>
            <a class="btn btn-primary" href="index.html">Return to Home</a>
          </div>
          <p class="muted small center">Attempt ID: ${u.escapeHtml(r.attemptId)} · This attempt is locked and cannot be modified.</p>
        </div>${review}`;
    },

    _malpracticeHtml(r) {
      const u = U();
      const log = (r.violations || []).map((v) => `
        <li><b>Violation ${v.no}</b> · ${u.fmtTime(v.timestamp)} · ${u.escapeHtml(v.events && v.events.length > 1 ? v.events.join(' + ') : v.type)} · Question ${v.questionNo}
        ${v.no > r.maxViolations ? ' · <b>Status: MALPRACTICE</b>' : ` · Time remaining ${v.timeRemaining}`}</li>`).join('');
      return `
        <div id="syncBox" class="sync-box"></div>
        <div class="card result-card malpractice">
          <div class="result-banner danger">
            <div>
              <div class="eyebrow">Assessment Terminated</div>
              <h2>MALPRACTICE DETECTED</h2>
            </div>
            <div class="state-icon danger big">!</div>
          </div>
          <p class="lead">Your quiz has been terminated because the maximum number of permitted violations was exceeded.</p>
          <table class="kv">
            ${this._identity(r)}
            ${this._row('Date', u.fmtDateLong(r.startTime))}
            ${this._row('Violations', `<b>${r.violationCount}</b>`, 'text-danger')}
            ${this._row('Status', '<span class="badge badge-danger">MALPRACTICE</span>')}
            ${this._row('Quiz Status', '<span class="badge badge-dark">TERMINATED</span>')}
          </table>
          <h4 class="mt-3">Violation Log</h4>
          <ul class="vlog">${log}</ul>
          <p class="muted small">This record has been saved and is visible to your faculty. The quiz cannot be restarted from this session.</p>
          <div class="result-actions no-print">
            <a class="btn btn-secondary" href="index.html">Return to Home</a>
          </div>
        </div>`;
    }
  };
})();

/* Boot result.html (only when its container exists) */
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('resultApp');
  if (!root) return;
  window.CO1.Results.renderPage(root).catch((e) => {
    console.error(e);
    window.CO1.ui.fatal(root, 'Something went wrong', window.CO1.util.escapeHtml(e.message));
  });
});
