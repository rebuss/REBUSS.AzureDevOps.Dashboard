/**
 * panel.js  –  Side-panel bootstrapper
 * ─────────────────────────────────────
 * Wires up the tab router, registers feature views,
 * and connects global UI controls (refresh, settings, auto-refresh).
 */

import { TabRouter } from '../shared/tab-router.js';
import { PrTrackerView } from '../features/pr-tracker/pr-tracker.view.js';
import { logger } from '../core/logger.js';
import { MSG } from '../core/constants.js';

/* ── DOM ── */
const tabBarEl = document.getElementById('tab-bar');
const contentEl = document.getElementById('tab-content');
const btnRefresh = document.getElementById('btn-refresh');
const btnSettings = document.getElementById('btn-settings');

/* ── Router ── */
const router = new TabRouter(tabBarEl, contentEl);
router.register('pr-tracker', 'PR Tracker', PrTrackerView);
// Future tabs: router.register('pipelines', 'Pipelines', PipelinesView);

router.renderTabBar();
router.switchTo('pr-tracker');

/* ── Global controls ── */
btnRefresh.addEventListener('click', () => router.refreshActive());
btnSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());

/* ── Auto-refresh from background ── */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === MSG.AUTO_REFRESH) {
    logger.info('Auto-refresh triggered');
    router.refreshActive();
  }
});
