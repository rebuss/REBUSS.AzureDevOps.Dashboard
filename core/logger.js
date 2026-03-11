/**
 * logger.js
 * ─────────
 * Configurable logger for the REBUSS extension.
 * Default level: INFO (debug messages hidden).
 * Set to DEBUG during development: logger.setLevel(LOG_LEVELS.DEBUG)
 */

export const LOG_LEVELS = Object.freeze({
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
});

let currentLevel = LOG_LEVELS.INFO;

/* eslint-disable no-console */
export const logger = {
  setLevel(level) {
    currentLevel = level;
  },
  getLevel() {
    return currentLevel;
  },

  debug(...args) {
    if (currentLevel <= LOG_LEVELS.DEBUG) console.log('[REBUSS]', ...args);
  },
  info(...args) {
    if (currentLevel <= LOG_LEVELS.INFO) console.info('[REBUSS]', ...args);
  },
  warn(...args) {
    if (currentLevel <= LOG_LEVELS.WARN) console.warn('[REBUSS]', ...args);
  },
  error(...args) {
    if (currentLevel <= LOG_LEVELS.ERROR) console.error('[REBUSS]', ...args);
  },
};
