/* =============================================================================
 * CO1 Quiz Assessment Portal — app.js
 * SIMATS Engineering · Department of Pure and Applied Mathematics
 *
 * Shared foundation used by every page:
 *   1. Namespace + storage keys
 *   2. Default faculty configuration
 *   3. Safe localStorage wrapper (handles quota / disabled-storage errors)
 *   4. DATA SERVICE  (async, adapter-based — swap LocalStorageAdapter for
 *      Firebase / Supabase / MySQL / Node without touching page code)
 *   5. Online results (Google Apps Script → Google Sheet) for multi-class use
 *   6. Utilities (ids, dates, formatting, shuffling, hashing)
 *   7. UI helpers (toast, modal dialogs)
 * ========================================================================== */
(function () {
  'use strict';

  const CO1 = (window.CO1 = window.CO1 || {});

  /* ---------------------------------------------------------------------------
   * 1. STORAGE KEYS
   * ------------------------------------------------------------------------- */
  CO1.KEYS = {
    CONFIG: 'uba10co1.config',            // faculty configuration
    BANK: 'uba10co1.questionBank',        // question bank (array)
    RESULTS: 'uba10co1.results',          // all final attempt records (array)
    ACTIVE: 'uba10co1.activeSession',     // the in-progress attempt (object)
    HEARTBEAT: 'uba10co1.heartbeat',      // {attemptId, tabId, ts} written every second
    BROWSER_LOCK: 'uba10co1.browserLock', // attemptId of the last finished attempt on this browser
    LAST_RESULT: 'uba10co1.lastResultId', // attemptId shown on result.html
    SYNC_QUEUE: 'uba10co1.syncQueue',     // results waiting to be sent to the Google Sheet
    SYNCED: 'uba10co1.synced',            // attemptIds confirmed by the Google Sheet
    FACULTY_KEY: 'uba10co1.facultyKey',   // (sessionStorage) password typed by faculty, sent to the sheet
    TAB_ID: 'uba10co1.tabId',             // (sessionStorage) identity of this browser tab
    FACULTY_AUTH: 'uba10co1.facultyAuth'  // (sessionStorage) faculty logged in for this tab
  };

  /* ---------------------------------------------------------------------------
   * 2. DEFAULT CONFIGURATION  (faculty can override everything in faculty.html)
   * ------------------------------------------------------------------------- */
  const SITE = window.CO1_SITE || {};          // from js/site-config.js
  CO1.SITE = SITE;
  CO1.DEFAULT_CONFIG = {
    quizTitle: 'CO1 Quiz Assessment',
    sessionLabel: SITE.SESSION_LABEL || 'MS2 · SEP – DEC 2026',
    courseName: 'UBA10 – Numerical Methods',
    institution: 'SIMATS Engineering',
    department: 'Department of Pure and Applied Mathematics',
    courseCode: 'UBA10',            // pre-fills the registration form
    facultyName: '',                // pre-fills the registration form when set
    enforceCourseCode: true,        // if true, the student must enter exactly this course code
    durationMinutes: 50,
    questionsPerAttempt: 0,         // 0 = use every question in the bank
    marksMode: 'perQuestion',       // 'perQuestion' (from bank) | 'uniform' (marksPerQuestion for all)
    marksPerQuestion: 1,
    passPercentage: 50,
    maxViolations: 2,               // allowed violations; violation (max+1) = MALPRACTICE
    randomizeQuestions: true,       // every student gets a different question order
    randomizeOptions: true,         // A–D order shuffled per student (answer key stays correct)
    allowBackNavigation: true,
    showCorrectAnswers: false,      // show answer review on the result page
    requireFullscreen: true,        // quiz runs in full screen; leaving it is a violation
    blockCopyPaste: true,           // block copy / paste / right-click / dev-tool shortcuts
    lockBrowserAfterAttempt: false, // ON = one attempt per browser until faculty resets (single-class lab mode)
    regNoPattern: '^[A-Za-z0-9]{5,15}$',
    regNoHint: '5–15 letters or digits, e.g. 23MATH001',
    warnAtMinutes: 5,
    violationCooldownMs: 2000,      // events within this window after a violation are merged into it
    reloadGraceSeconds: 20,         // a refresh shorter than this is NOT a violation
    remoteEndpoint: '',             // per-browser override; normally set once in js/site-config.js
    facultyPinHash: ''              // empty = the built-in faculty password (stored only as a hash)
  };
  CO1.DEFAULT_PIN_HASH = 'spbqcl4p1f';

  /* ---------------------------------------------------------------------------
   * 3. SAFE STORAGE WRAPPER
   * ------------------------------------------------------------------------- */
  class StorageError extends Error {}
  CO1.StorageError = StorageError;

  CO1.storage = {
    available() {
      try {
        const k = '__co1_test__';
        localStorage.setItem(k, '1');
        localStorage.removeItem(k);
        return true;
      } catch (e) {
        return false;
      }
    },
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null || raw === undefined) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        console.warn('[CO1] Could not read', key, e);
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        const quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
        throw new StorageError(
          quota
            ? 'Browser storage is full. Ask the faculty to export and clear old results.'
            : 'Browser storage is unavailable (private mode or blocked site data). The quiz cannot save your progress.'
        );
      }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    },
    sGet(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } },
    sSet(key, v) { try { sessionStorage.setItem(key, v); } catch (e) { /* ignore */ } },
    sRemove(key) { try { sessionStorage.removeItem(key); } catch (e) { /* ignore */ } }
  };

  /* ---------------------------------------------------------------------------
   * 4. DATA SERVICE
   *
   * Every method returns a Promise so that a remote backend can be dropped in
   * later. To migrate (e.g. to Firebase), write an adapter object with the same
   * method names and set  CO1.data = YourAdapter  at the bottom of this file.
   * ------------------------------------------------------------------------- */
  const LocalStorageAdapter = {
    name: 'localStorage',

    async getConfig() {
      const c = Object.assign({}, CO1.DEFAULT_CONFIG, CO1.storage.get(CO1.KEYS.CONFIG, {}));
      if (!c.remoteEndpoint) c.remoteEndpoint = SITE.RESULTS_ENDPOINT || '';
      if (!c.sessionLabel) c.sessionLabel = CO1.DEFAULT_CONFIG.sessionLabel;
      return c;
    },
    async saveConfig(cfg) {
      const clean = {};
      Object.keys(CO1.DEFAULT_CONFIG).forEach((k) => { if (k in cfg) clean[k] = cfg[k]; });
      CO1.storage.set(CO1.KEYS.CONFIG, clean);
      return this.getConfig();
    },
    async resetConfig() {
      const old = CO1.storage.get(CO1.KEYS.CONFIG, {});
      // keep the faculty PIN when resetting other settings
      CO1.storage.set(CO1.KEYS.CONFIG, { facultyPinHash: old.facultyPinHash || '' });
      return this.getConfig();
    },

    async getQuestionBank() {
      const bank = CO1.storage.get(CO1.KEYS.BANK, null);
      if (Array.isArray(bank)) return bank;
      return JSON.parse(JSON.stringify(CO1.DEFAULT_QUESTIONS || []));
    },
    async saveQuestionBank(bank) {
      CO1.storage.set(CO1.KEYS.BANK, bank);
      return bank;
    },
    async resetQuestionBank() {
      CO1.storage.remove(CO1.KEYS.BANK);
      return this.getQuestionBank();
    },

    async getResults() {
      const r = CO1.storage.get(CO1.KEYS.RESULTS, []);
      return Array.isArray(r) ? r : [];
    },
    async getResult(attemptId) {
      return (await this.getResults()).find((r) => r.attemptId === attemptId) || null;
    },
    /** Insert or replace a result (keyed by attemptId). Final results are immutable once saved. */
    async saveResult(record) {
      const all = await this.getResults();
      const idx = all.findIndex((r) => r.attemptId === record.attemptId);
      if (idx >= 0) {
        if (all[idx].locked) return all[idx]; // final submission lock — never overwrite
        all[idx] = record;
      } else {
        all.push(record);
      }
      CO1.storage.set(CO1.KEYS.RESULTS, all);
      // online sending is started by the caller (quiz.js) with a suitable random delay
      return record;
    },
    async deleteResult(attemptId) {
      const all = (await this.getResults()).filter((r) => r.attemptId !== attemptId);
      CO1.storage.set(CO1.KEYS.RESULTS, all);
    },
    async clearResults() {
      CO1.storage.set(CO1.KEYS.RESULTS, []);
    }
  };

  CO1.LocalStorageAdapter = LocalStorageAdapter;
  CO1.data = LocalStorageAdapter; // <-- swap the adapter here when a backend is added

  /* ---------------------------------------------------------------------------
   * 5. ONLINE RESULTS (Google Apps Script Web App → one Google Sheet)
   *
   * Used when the quiz is hosted online for many classes (e.g. 40 students at
   * the same time, a different faculty each day). Every result is saved in the
   * browser FIRST, then sent to the sheet. Sending is retried with back-off and
   * random spacing (so 40 simultaneous "time-up" submissions do not hit the
   * server at the same instant) and queued if the network is down; the queue is
   * retried on every page load and when the connection returns.
   * ------------------------------------------------------------------------- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let flushing = null;

  CO1.remote = {
    async endpoint() {
      const cfg = await LocalStorageAdapter.getConfig();
      return (cfg.remoteEndpoint || '').trim();
    },
    async enabled() { return !!(await this.endpoint()); },

    /** One POST to the Apps Script (text/plain body → no CORS pre-flight; JSON reply is readable). */
    async call(payload, timeoutMs = 20000) {
      const url = await this.endpoint();
      if (!url) throw new Error('Online results are not configured.');
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => ctrl && ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow', signal: ctrl ? ctrl.signal : undefined });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch (e) { throw new Error('The results server sent an unexpected reply (check the Web App URL and that access is set to "Anyone").'); }
        if (!data.ok) { const err = new Error(data.error || 'Server error'); err.fatal = !!data.fatal; throw err; }
        return data;
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('The results server did not respond in time.');
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
    /** call() with exponential back-off + jitter (handles busy server / brief network loss). */
    async callRetry(payload, tries = 5, timeoutMs = 20000) {
      let last;
      for (let i = 0; i < tries; i++) {
        try { return await this.call(payload, timeoutMs); } catch (e) {
          last = e;
          if (e.fatal) break;
          if (i < tries - 1) await sleep(Math.min(20000, 1200 * Math.pow(1.8, i)) + Math.random() * 1500);
        }
      }
      throw last;
    },

    /** Smaller copy of a record for the sheet (question text is looked up from the bank by id). */
    compact(r) {
      const c = Object.assign({}, r);
      c.review = (r.review || []).map((q) => ({ qid: q.qid, letters: q.letters || '', chosen: q.chosen, correct: q.correct, isCorrect: q.isCorrect, marks: q.marks }));
      return c;
    },

    queue() { return CO1.storage.get(CO1.KEYS.SYNC_QUEUE, []); },
    synced() { return CO1.storage.get(CO1.KEYS.SYNCED, []); },
    status(attemptId) {
      if (this.synced().includes(attemptId)) return 'synced';
      if (this.queue().some((r) => r.attemptId === attemptId)) return 'pending';
      return 'local';
    },
    _emit() { try { window.dispatchEvent(new CustomEvent('co1-sync')); } catch (e) { /* ignore */ } },

    /** Queue a final record and send it (after a random delay of up to maxDelayMs). */
    async push(record, maxDelayMs = 3000) {
      if (!(await this.enabled())) return;
      const q = this.queue().filter((r) => r.attemptId !== record.attemptId);
      q.push(this.compact(record));
      try { CO1.storage.set(CO1.KEYS.SYNC_QUEUE, q); } catch (e) { /* ignore */ }
      this._emit();
      setTimeout(() => this.flush().catch(() => {}), Math.random() * maxDelayMs);
    },

    /** Send everything in the queue. Safe to call often; only one run at a time. */
    async flush() {
      if (flushing) return flushing;
      flushing = (async () => {
        if (!(await this.enabled()) || (navigator.onLine === false)) return;
        for (const rec of this.queue()) {
          try {
            await this.callRetry({ action: 'submit', row: CO1.flattenResult(rec), record: rec }, 4);
            const s = this.synced(); s.push(rec.attemptId);
            CO1.storage.set(CO1.KEYS.SYNCED, s.slice(-200));
            CO1.storage.set(CO1.KEYS.SYNC_QUEUE, this.queue().filter((r) => r.attemptId !== rec.attemptId));
          } catch (e) {
            console.warn('[CO1] result not sent yet:', e.message);
            this.lastError = e.message;
          }
          this._emit();
        }
      })();
      try { await flushing; } finally { flushing = null; }
    },

    /** Has this register number already attempted this course? null = could not check. */
    async checkAttempt(regNo, courseCode) {
      if (!(await this.enabled())) return null;
      try { return await this.callRetry({ action: 'check', regNo, courseCode }, 3, 10000); } catch (e) { return null; }
    },
    /** Faculty: all results from the sheet (password is checked by the server). */
    async fetchResults(password) {
      const d = await this.callRetry({ action: 'results', key: password }, 3, 45000);
      return d.records || [];
    },
    async deleteAttempt(password, attemptId) {
      return this.callRetry({ action: 'delete', key: password, attemptId }, 3);
    }
  };

  /** Flat row used by CSV, Excel and the remote sheet (single source of truth for columns). */
  CO1.RESULT_COLUMNS = [
    'S.No', 'Student Name', 'Register Number', 'Faculty Name', 'Course Code', 'Quiz Date',
    'Start Time', 'End Time', 'Total Questions', 'Attempted', 'Correct', 'Wrong', 'Unanswered',
    'Total Marks', 'Marks Obtained', 'Percentage', 'Result', 'Violation Count',
    'Violation Details', 'Quiz Status', 'Status', 'Duration', 'Submission Type',
    'Blocked Actions', 'Session', 'Attempt ID'
  ];
  CO1.flattenResult = function (r, sno) {
    const mal = r.status === 'MALPRACTICE';
    return {
      'S.No': sno || '',
      'Student Name': r.studentName,
      'Register Number': r.regNo,
      'Faculty Name': r.facultyName,
      'Course Code': r.courseCode,
      'Quiz Date': r.date,
      'Start Time': r.startTime ? CO1.util.fmtTime(r.startTime) : '--',
      'End Time': r.endTime ? CO1.util.fmtTime(r.endTime) : '--',
      'Total Questions': r.totalQuestions,
      'Attempted': r.attempted,
      'Correct': mal ? '--' : r.correct,
      'Wrong': mal ? '--' : r.wrong,
      'Unanswered': r.unanswered,
      'Total Marks': r.totalMarks,
      'Marks Obtained': mal ? '--' : r.marksObtained,
      'Percentage': mal ? '--' : r.percentage.toFixed(2) + '%',
      'Result': r.result,
      'Violation Count': r.violationCount,
      'Violation Details': r.violationDetails || 'None',
      'Quiz Status': r.quizStatus,
      'Status': r.status,
      'Duration': CO1.util.fmtDuration(r.durationSec * 1000),
      'Submission Type': r.submissionType,
      'Blocked Actions': r.blockedActions || 0,
      'Session': r.sessionLabel || '',
      'Attempt ID': r.attemptId
    };
  };

  /* ---------------------------------------------------------------------------
   * 6. UTILITIES
   * ------------------------------------------------------------------------- */
  const pad = (n, w = 2) => String(n).padStart(w, '0');

  CO1.util = {
    uid(prefix = 'ATT') {
      const rnd = new Uint32Array(2);
      (window.crypto || window.msCrypto).getRandomValues(rnd);
      return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rnd[0].toString(36).toUpperCase()}`;
    },
    /** YYYY-MM-DD in local time */
    fmtDate(t) {
      const d = new Date(t);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },
    /** 10:23:15 AM */
    fmtTime(t) {
      const d = new Date(t);
      let h = d.getHours();
      const ap = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${pad(h)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${ap}`;
    },
    fmtDateLong(t) {
      return new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    },
    /** ms → "mm:ss" or "h:mm:ss" */
    fmtDuration(ms) {
      if (!isFinite(ms) || ms < 0) ms = 0;
      const total = Math.floor(ms / 1000);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    },
    /** Cryptographically-seeded Fisher–Yates shuffle (returns a new array). */
    shuffle(arr) {
      const a = arr.slice();
      const r = new Uint32Array(a.length || 1);
      crypto.getRandomValues(r);
      for (let i = a.length - 1; i > 0; i--) {
        const j = r[i] % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    escapeHtml(s) {
      return String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    /** Escape, then keep line breaks. Used for question text. */
    richText(s) {
      return CO1.util.escapeHtml(s).replace(/\n/g, '<br>');
    },
    /** Small synchronous 53-bit hash (cyrb53) used for the faculty PIN. A deterrent, not real security. */
    hash(str, seed = 7919) {
      let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
      for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
    },
    tabId() {
      let id = CO1.storage.sGet(CO1.KEYS.TAB_ID);
      if (!id) {
        id = CO1.util.uid('TAB');
        CO1.storage.sSet(CO1.KEYS.TAB_ID, id);
      }
      return id;
    },
    $(sel, root = document) { return root.querySelector(sel); },
    $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  };

  /* ---------------------------------------------------------------------------
   * 6b. MATH FORMATTING
   * Questions use a tiny markup so that powers, subscripts, fractions and
   * matrices display properly (works offline, no external library):
   *     x_{n+1}   e^{x}   e^{x_{n}}   \frac{a}{b}   \sqrt{N}
   *     \M{4 1 −1; 2 3 0; 0 −1 2}   (matrix: rows separated by ; entries by spaces)
   *     \M{1; 0.8; 0.2}             (column vector)
   * Plain text without markup is shown unchanged.
   * ------------------------------------------------------------------------- */
  const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '−': '⁻', '-': '⁻', 'n': 'ⁿ', 'x': 'ˣ', 'T': 'ᵀ', '(': '⁽', ')': '⁾' };
  const SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '−': '₋', '-': '₋', 'n': 'ₙ', 'x': 'ₓ', 's': 'ₛ', '(': '₍', ')': '₎' };
  const mapAll = (str, table) => ([...str].every((c) => table[c]) ? [...str].map((c) => table[c]).join('') : null);

  CO1.math = {
    /** markup → safe HTML */
    html(src) {
      let s = CO1.util.escapeHtml(src);
      s = s.replace(/\\M\{([^{}]*)\}/g, (m, body) => {
        const rows = body.split(';').map((r) => r.trim().split(/\s+/).filter(Boolean));
        return '<span class="mx"><span class="mx-in">' +
          rows.map((r) => '<span class="mx-row">' + r.map((c) => `<span class="mx-c">${c}</span>`).join('') + '</span>').join('') +
          '</span></span>';
      });
      let prev;
      do {
        prev = s;
        s = s.replace(/_\{([^{}]*)\}/g, '<sub>$1</sub>')
          .replace(/\^\{([^{}]*)\}/g, '<sup>$1</sup>')
          .replace(/\\sqrt\{([^{}]*)\}/g, '<span class="sqrt">√<span class="sqrt-in">$1</span></span>')
          .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '<span class="frac"><span class="num">$1</span><span class="den">$2</span></span>');
      } while (s !== prev);
      return s.replace(/\n/g, '<br>');
    },
    /** markup → readable plain text (Excel, CSV) */
    plain(src) {
      let s = String(src === undefined || src === null ? '' : src);
      s = s.replace(/\\M\{([^{}]*)\}/g, (m, body) => '[' + body.split(';').map((r) => r.trim()).join('; ') + ']');
      let prev;
      do {
        prev = s;
        s = s.replace(/_\{([^{}]*)\}/g, (m, a) => mapAll(a, SUB) || `_(${a})`)
          .replace(/\^\{([^{}]*)\}/g, (m, a) => mapAll(a, SUP) || `^(${a})`)
          .replace(/\\sqrt\{([^{}]*)\}/g, (m, a) => (a.length === 1 ? `√${a}` : `√(${a})`))
          .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (m, a, b) => {
            const w = (t) => (/^[\w.′]+$/.test(t) ? t : `(${t})`);
            return `${w(a)}/${w(b)}`;
          });
      } while (s !== prev);
      return s;
    }
  };

  /* ---------------------------------------------------------------------------
   * 7. UI HELPERS — toasts and promise-based modal dialogs
   * (Native alert/confirm are avoided: they steal focus and would trigger the
   *  malpractice monitor.)
   * ------------------------------------------------------------------------- */
  CO1.ui = {
    toast(message, type = 'info', ms = 4000) {
      let wrap = document.getElementById('toastWrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'toastWrap';
        wrap.className = 'toast-wrap';
        wrap.setAttribute('aria-live', 'polite');
        document.body.appendChild(wrap);
      }
      const t = document.createElement('div');
      t.className = `toast toast-${type}`;
      t.innerHTML = CO1.util.escapeHtml(message);
      wrap.appendChild(t);
      requestAnimationFrame(() => t.classList.add('show'));
      setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
      }, ms);
    },

    /**
     * Generic modal.
     * opts: { title, html, variant: 'info'|'warning'|'danger'|'success',
     *         buttons: [{label, value, className}], dismissible }
     * Resolves with the clicked button's value.
     */
    modal(opts) {
      return new Promise((resolve) => {
        const o = Object.assign({ variant: 'info', buttons: [{ label: 'OK', value: true, className: 'btn-primary' }], dismissible: false }, opts);
        const back = document.createElement('div');
        back.className = 'modal-backdrop';
        back.innerHTML = `
          <div class="modal modal-${o.variant}" role="dialog" aria-modal="true" aria-labelledby="mTitle">
            <div class="modal-head"><span class="modal-icon"></span><h3 id="mTitle">${CO1.util.escapeHtml(o.title || '')}</h3></div>
            <div class="modal-body">${o.html || ''}</div>
            <div class="modal-foot"></div>
          </div>`;
        const foot = back.querySelector('.modal-foot');
        const close = (val) => {
          back.classList.remove('show');
          document.removeEventListener('keydown', onKey);
          setTimeout(() => back.remove(), 180);
          resolve(val);
        };
        o.buttons.forEach((b, i) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `btn ${b.className || 'btn-secondary'}`;
          btn.textContent = b.label;
          btn.addEventListener('click', () => close(b.value));
          foot.appendChild(btn);
          if (i === o.buttons.length - 1) setTimeout(() => btn.focus(), 50);
        });
        const onKey = (e) => { if (e.key === 'Escape' && o.dismissible) close(null); };
        document.addEventListener('keydown', onKey);
        if (o.dismissible) back.addEventListener('click', (e) => { if (e.target === back) close(null); });
        document.body.appendChild(back);
        requestAnimationFrame(() => back.classList.add('show'));
      });
    },
    alert(title, html, variant = 'info') {
      return CO1.ui.modal({ title, html, variant });
    },
    confirm(title, html, okLabel = 'Confirm', variant = 'warning', cancelLabel = 'Cancel') {
      return CO1.ui.modal({
        title, html, variant, dismissible: true,
        buttons: [
          { label: cancelLabel, value: false, className: 'btn-secondary' },
          { label: okLabel, value: true, className: variant === 'danger' ? 'btn-danger' : 'btn-primary' }
        ]
      });
    },
    /** Fill elements carrying data-config="key" with config values (titles, department…). */
    applyBranding(cfg) {
      CO1.util.$$('[data-config]').forEach((el) => {
        const v = cfg[el.dataset.config];
        if (v !== undefined && v !== '') el.textContent = v;
      });
    },
    fatal(container, title, message) {
      container.innerHTML = `
        <div class="card state-card">
          <div class="state-icon danger">!</div>
          <h2>${CO1.util.escapeHtml(title)}</h2>
          <p>${message}</p>
          <a class="btn btn-primary" href="index.html">Return to Home</a>
        </div>`;
    }
  };

  /* ---------------------------------------------------------------------------
   * Faculty PIN helpers
   * ------------------------------------------------------------------------- */
  CO1.auth = {
    async verify(pin) {
      const cfg = await CO1.data.getConfig();
      const expected = cfg.facultyPinHash || CO1.DEFAULT_PIN_HASH;
      return CO1.util.hash(pin) === expected;
    },
    async setPin(pin) {
      const cfg = await CO1.data.getConfig();
      cfg.facultyPinHash = CO1.util.hash(pin);
      await CO1.data.saveConfig(cfg);
    },
    isLoggedIn() { return CO1.storage.sGet(CO1.KEYS.FACULTY_AUTH) === '1'; },
    login(key) { CO1.storage.sSet(CO1.KEYS.FACULTY_AUTH, '1'); if (key) CO1.storage.sSet(CO1.KEYS.FACULTY_KEY, key); },
    key() { return CO1.storage.sGet(CO1.KEYS.FACULTY_KEY) || ''; },
    logout() { CO1.storage.sRemove(CO1.KEYS.FACULTY_AUTH); CO1.storage.sRemove(CO1.KEYS.FACULTY_KEY); }
  };

  // Retry any queued remote results whenever a page loads or the network returns.
  window.addEventListener('load', () => { CO1.remote.flush().catch(() => {}); });
  window.addEventListener('online', () => { CO1.remote.flush().catch(() => {}); });
})();
