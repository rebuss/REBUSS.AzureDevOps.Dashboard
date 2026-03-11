/**
 * background.js  –  Manifest V3 Service Worker
 * ─────────────────────────────────────────────
 * Responsibilities:
 *   1. Open the side panel when the extension action icon is clicked.
 *   2. Set up an alarm for auto-refresh (optional, driven by config).
 *   3. Relay messages between options/panel and storage as needed.
 */

import { logger } from './core/logger.js';
import { ALARM_NAME, MSG, STORAGE_KEY } from './core/constants.js';

/* ── Open the side panel on toolbar-icon click ── */

chrome.action.onClicked.addListener(async (tab) => {
  // sidePanel.open requires a windowId (Edge 114+).
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (err) {
    logger.warn('Could not open side panel:', err);
  }
});

/* ── Ensure side panel is enabled globally ── */

chrome.sidePanel.setOptions({ enabled: true }).catch((err) => logger.warn('sidePanel.setOptions error:', err));

/* ── Auto-refresh alarm ── */

/**
 * (Re-)configure the auto-refresh alarm based on stored settings.
 */
async function configureAlarm() {
  const cfg = await chrome.storage.local.get([STORAGE_KEY.AUTO_REFRESH, STORAGE_KEY.REFRESH_INTERVAL]);
  const enabled = cfg[STORAGE_KEY.AUTO_REFRESH] ?? true;
  const minutes = cfg[STORAGE_KEY.REFRESH_INTERVAL] ?? 5;

  // Clear any existing alarm first
  await chrome.alarms.clear(ALARM_NAME);

  if (enabled && minutes > 0) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: Math.max(1, minutes) });
    logger.info(`Auto-refresh alarm set every ${minutes} min`);
  }
}

// Reconfigure when config changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[STORAGE_KEY.AUTO_REFRESH] || changes[STORAGE_KEY.REFRESH_INTERVAL])) {
    configureAlarm();
  }
});

// On install / update / browser restart
chrome.runtime.onInstalled.addListener(() => configureAlarm());
chrome.runtime.onStartup.addListener(() => configureAlarm());

// When the alarm fires, notify the panel so it can refresh
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    // Send a message to any open panel – the panel listens for this.
    chrome.runtime.sendMessage({ type: MSG.AUTO_REFRESH }).catch(() => {
      // Panel may not be open – that's fine, ignore.
    });
  }
});
