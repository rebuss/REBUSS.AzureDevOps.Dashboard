/**
 * dom-utils.js
 * ─────────────
 * Shared DOM helper functions reusable across all views/panels.
 */

/** Show an element by removing the 'hidden' class. */
export function show(el) {
  el.classList.remove('hidden');
}

/** Hide an element by adding the 'hidden' class. */
export function hide(el) {
  el.classList.add('hidden');
}

/**
 * HTML-escape a string (prevents XSS when interpolating into innerHTML).
 * Uses a static lookup – no DOM element creation per call.
 * @param {string} str
 * @returns {string}
 */
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

/**
 * Extract short branch name from a full ref path.
 * e.g. "refs/heads/feature/foo" → "feature/foo"
 * @param {string} ref
 * @returns {string}
 */
export function shortRef(ref) {
  return (ref || '').replace(/^refs\/heads\//, '');
}
