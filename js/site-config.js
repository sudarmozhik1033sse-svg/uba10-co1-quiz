/* =============================================================================
 * site-config.js — ONE place for settings that must be the same for every
 * student's computer/phone (edit with Notepad, save, upload again).
 * ========================================================================== */
window.CO1_SITE = {
  // Online results (several faculty / many classes): paste the Google Apps Script
  // Web App URL here (it ends with /exec). See backend/google-apps-script.gs.
  // Leave empty ('') to keep results only in the browser (single-computer lab mode).
  RESULTS_ENDPOINT: 'https://script.google.com/macros/s/AKfycbzkudT40YNMSCrXyekU5va1JIBoizkQv4sBCDcH_s1bNmh9_dsVJzlHn3OpUghCbYrB/exec',

  // Shown on every page, on the result and in the Excel file
  SESSION_LABEL: 'MS2 · SEP – DEC 2026',

  // Optional: list the faculty names so students CHOOSE from a list (no spelling
  // mistakes → each faculty can filter exactly their own students). Example:
  // FACULTY_LIST: ['Dr. K. Sudar Mozhi', 'Dr. A. B. C', 'Dr. X. Y. Z'],
  FACULTY_LIST: []
};
