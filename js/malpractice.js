/* =============================================================================
 * malpractice.js — Browser-side malpractice monitoring
 *
 * DESIGN (why one tab switch = exactly ONE violation)
 * ---------------------------------------------------
 * A single physical action usually fires several DOM events:
 *     Ctrl+Tab      → blur  + visibilitychange(hidden)
 *     Alt+Tab       → blur  (+ visibilitychange on some systems)
 *     Minimize      → blur  + visibilitychange(hidden)
 *     Esc (in FS)   → fullscreenchange (+ sometimes blur)
 * Every listener therefore calls ONE function, leave(source). It works on
 * "away episodes":
 *
 *   1. If the student is already away (an episode is open), later events are
 *      merged into that episode — never counted again.
 *   2. If a violation was counted less than `cooldownMs` ago, the event is also
 *      merged (covers focus flicker and late events such as a delayed
 *      fullscreenchange). If the student then STAYS away past the cooldown, it
 *      is counted as a new violation, so the cooldown is never a loophole.
 *   3. Otherwise registerViolation(type) is called — the single, centralized
 *      place where a violation is created.
 *   4. The episode closes only when the page is BOTH visible AND focused again.
 *
 * A violation is committed after a short delay (commitDelayMs) or immediately
 * when the student returns. If the page is being unloaded (refresh/navigation)
 * the pending violation is discarded — a refresh is not a violation. Long
 * absences across a reload are handled by quiz.js via registerViolation('ABSENCE').
 *
 * LIMITATIONS: see README → "Known browser limitations". JavaScript cannot see
 * other devices, OS-level overlays, a second monitor, or every extension.
 * ========================================================================== */
(function () {
  'use strict';
  const CO1 = (window.CO1 = window.CO1 || {});

  const TYPES = {
    VISIBILITY: 'Browser tab switched / window minimized',
    BLUR: 'Browser window lost focus',
    FULLSCREEN: 'Exited full-screen mode',
    ABSENCE: 'Quiz page was closed or reloaded and left',
    MULTI_TAB: 'Quiz opened in another tab/window'
  };
  CO1.VIOLATION_TYPES = TYPES;

  class MalpracticeMonitor {
    /**
     * @param {object} o
     *  getContext(): {questionNo, timeRemaining}  – snapshot for the log
     *  onViolation(record)        – a NEW violation has been committed
     *  onViolationUpdate(record)  – an already-committed violation got more detail
     *  onFullscreenLost() / onFullscreenRestored()
     *  onBlockedAction(description)
     *  cooldownMs, commitDelayMs, requireFullscreen, blockCopyPaste
     */
    constructor(o) {
      this.o = Object.assign({ cooldownMs: 2000, commitDelayMs: 400, requireFullscreen: false, blockCopyPaste: true }, o);
      this.active = false;
      this.unloading = false;
      this.away = false;
      this.awaySince = 0;
      this.lastViolationAt = 0;
      this.pending = null;        // violation waiting to be committed
      this.pendingTimer = null;
      this.lastCommitted = null;  // most recent committed violation (for merging detail)
      this._bind();
    }

    /* ---------------- public API ---------------- */
    start() {
      if (this.active) return;
      this.active = true;
      this.unloading = false;
      this.away = false;
      document.addEventListener('visibilitychange', this._onVisibility);
      window.addEventListener('blur', this._onBlur);
      window.addEventListener('focus', this._onFocus);
      document.addEventListener('fullscreenchange', this._onFullscreen);
      window.addEventListener('pagehide', this._onPageHide);
      window.addEventListener('pageshow', this._onPageShow);
      if (this.o.blockCopyPaste) this._attachGuards();
    }

    stop() {
      this.active = false;
      clearTimeout(this.reLeaveTimer);
      this._flush(); // never lose a pending violation when stopping deliberately
      document.removeEventListener('visibilitychange', this._onVisibility);
      window.removeEventListener('blur', this._onBlur);
      window.removeEventListener('focus', this._onFocus);
      document.removeEventListener('fullscreenchange', this._onFullscreen);
      window.removeEventListener('pagehide', this._onPageHide);
      window.removeEventListener('pageshow', this._onPageShow);
      this._detachGuards();
    }

    /** true when the quiz page is visible AND has keyboard focus */
    static isPresent() {
      return document.visibilityState === 'visible' && document.hasFocus();
    }

    /**
     * THE single, centralized place where a violation is created.
     * @param {string} code   key of TYPES (or free text)
     * @param {object} opts   { immediate: bool, detail: string }
     */
    registerViolation(code, opts = {}) {
      if (!this.active || this.unloading) return null;
      // Never let two violations be pending at once
      this._flush();
      const ctx = this.o.getContext ? this.o.getContext() : {};
      const label = TYPES[code] || code;
      const rec = {
        code,
        type: label,
        events: [label],
        detail: opts.detail || '',
        timestamp: Date.now(),
        questionNo: ctx.questionNo,
        timeRemaining: ctx.timeRemaining,
        awaySeconds: null
      };
      this.lastViolationAt = rec.timestamp;
      this.pending = rec;
      if (opts.immediate) this._flush();
      else this.pendingTimer = setTimeout(() => this._flush(), this.o.commitDelayMs);
      return rec;
    }

    /* ---------------- event handling ---------------- */
    _bind() {
      this._onVisibility = () => {
        if (document.visibilityState === 'hidden') this._leave('VISIBILITY');
        else this._maybeBack();
      };
      this._onBlur = () => this._leave('BLUR');
      this._onFocus = () => this._maybeBack();
      this._onFullscreen = () => {
        if (!this.o.requireFullscreen) return;
        if (document.fullscreenElement) {
          this.o.onFullscreenRestored && this.o.onFullscreenRestored();
        } else {
          if (this.unloading || !this.active) return;
          this.o.onFullscreenLost && this.o.onFullscreenLost();
          this._leave('FULLSCREEN');
        }
      };
      // pagehide fires only when the page is really being unloaded (refresh,
      // close, navigation) — NOT when another tab is selected.
      this._onPageHide = () => {
        this.unloading = true;
        clearTimeout(this.pendingTimer);
        this.pending = null; // a refresh is not a violation
      };
      this._onPageShow = (e) => { if (e.persisted) this.unloading = false; };

      // ---- guards against obvious copy / dev-tool shortcuts (not violations) ----
      this._onKey = (e) => {
        if (!this.active) return;
        const k = (e.key || '').toLowerCase();
        const ctrl = e.ctrlKey || e.metaKey;
        let what = null;
        if (k === 'f12') what = 'Developer tools shortcut (F12)';
        else if (ctrl && e.shiftKey && ['i', 'j', 'c', 'k'].includes(k)) what = 'Developer tools shortcut';
        else if (ctrl && k === 'u') what = 'View-source shortcut';
        else if (ctrl && ['c', 'x', 'v', 'a', 's', 'p', 'f'].includes(k)) what = `Shortcut Ctrl+${k.toUpperCase()}`;
        if (what) {
          e.preventDefault();
          e.stopPropagation();
          this.o.onBlockedAction && this.o.onBlockedAction(what);
        }
      };
      this._onKeyUp = (e) => {
        if (this.active && e.key === 'PrintScreen') this.o.onBlockedAction && this.o.onBlockedAction('Print Screen key pressed');
      };
      this._prevent = (e) => {
        if (!this.active) return;
        e.preventDefault();
        const map = { contextmenu: 'Right-click menu', copy: 'Copy', cut: 'Cut', paste: 'Paste', dragstart: 'Drag text' };
        if (map[e.type]) this.o.onBlockedAction && this.o.onBlockedAction(map[e.type]);
      };
    }

    _leave(source) {
      if (!this.active || this.unloading) return;
      // (1) Already away: this event belongs to the same action (e.g. blur → visibilitychange)
      if (this.away) { this._merge(source); return; }

      const now = Date.now();
      const inCooldown = this.lastViolationAt && now - this.lastViolationAt < this.o.cooldownMs;
      // Leaving full screen does not take the student away from the page.
      if (source !== 'FULLSCREEN') {
        this.away = true;
        this.awaySince = now;
      }
      if (inCooldown) {
        // (2) A late/duplicate event right after a counted violation (focus flicker,
        //     late fullscreenchange…) is merged. But if the student genuinely leaves
        //     AGAIN and stays away past the cooldown, it becomes a NEW violation —
        //     so the cooldown can never be used as a "free" window.
        this._merge(source);
        if (source !== 'FULLSCREEN') {
          clearTimeout(this.reLeaveTimer);
          this.reLeaveTimer = setTimeout(() => {
            if (this.active && this.away && !this.unloading) {
              this.registerViolation(source, { detail: 'Left the quiz screen again shortly after the previous violation' });
            }
          }, this.o.cooldownMs);
        }
        return;
      }
      // (3) A new action → exactly one violation
      this.registerViolation(source);
    }

    _maybeBack() {
      if (!this.away) return;
      // focus can arrive before visibility (or vice-versa) — require both
      if (!MalpracticeMonitor.isPresent()) return;
      this.away = false;
      clearTimeout(this.reLeaveTimer);
      const secs = Math.max(0, Math.round((Date.now() - this.awaySince) / 1000));
      const target = this.pending || this.lastCommitted;
      if (target && target.timestamp >= this.awaySince - this.o.cooldownMs) {
        target.awaySeconds = (target.awaySeconds || 0) + secs;
        if (target === this.lastCommitted && this.o.onViolationUpdate) this.o.onViolationUpdate(target);
      }
      this._flush(); // commit immediately on return so the warning shows at once
    }

    _merge(source) {
      const label = TYPES[source] || source;
      const target = this.pending || this.lastCommitted;
      if (!target || target.events.includes(label)) return;
      target.events.push(label);
      if (target === this.lastCommitted && this.o.onViolationUpdate) this.o.onViolationUpdate(target);
    }

    _flush() {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
      const rec = this.pending;
      if (!rec) return;
      this.pending = null;
      this.lastCommitted = rec;
      this.o.onViolation && this.o.onViolation(rec);
    }

    _attachGuards() {
      document.addEventListener('keydown', this._onKey, true);
      document.addEventListener('keyup', this._onKeyUp, true);
      ['contextmenu', 'copy', 'cut', 'paste', 'dragstart'].forEach((t) => document.addEventListener(t, this._prevent, true));
      document.body.classList.add('no-select');
    }
    _detachGuards() {
      document.removeEventListener('keydown', this._onKey, true);
      document.removeEventListener('keyup', this._onKeyUp, true);
      ['contextmenu', 'copy', 'cut', 'paste', 'dragstart'].forEach((t) => document.removeEventListener(t, this._prevent, true));
      document.body.classList.remove('no-select');
    }
  }

  CO1.MalpracticeMonitor = MalpracticeMonitor;

  /** Human-readable one-line summary of a violation list (used in Excel / CSV). */
  CO1.describeViolations = function (list, maxViolations) {
    if (!list || !list.length) return 'None';
    return list.map((v) => {
      const parts = [
        `V${v.no}`,
        CO1.util.fmtTime(v.timestamp),
        v.events && v.events.length > 1 ? v.events.join(' + ') : v.type,
        `Q${v.questionNo}`
      ];
      if (v.no > maxViolations) parts.push('Status: MALPRACTICE');
      else parts.push(`Time left ${v.timeRemaining}`);
      if (v.awaySeconds) parts.push(`away ${v.awaySeconds}s`);
      if (v.detail) parts.push(v.detail);
      return parts.join(' | ');
    }).join(' ; ');
  };
})();
