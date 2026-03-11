/**
 * tab-router.js
 * ──────────────
 * Lightweight tab registry + router for the side panel.
 *
 * Usage:
 *   const router = new TabRouter(document.getElementById('tab-bar'),
 *                                document.getElementById('tab-content'));
 *   router.register('pr-tracker', 'PR Tracker', PrTrackerView);
 *   router.register('pipelines',  'Pipelines',  PipelinesView);   // future
 *   router.switchTo('pr-tracker');
 *
 * Adding a new tab = one register() call + one new View class.
 */

import { logger } from '../core/logger.js';

export class TabRouter {
  /**
   * @param {HTMLElement} tabBarEl    – container for tab buttons
   * @param {HTMLElement} contentEl   – container where views are mounted
   */
  constructor(tabBarEl, contentEl) {
    /** @type {Map<string, {label:string, ViewClass:typeof import('./base-view.js').BaseView, instance:import('./base-view.js').BaseView|null}>} */
    this.tabs = new Map();
    this.tabBarEl = tabBarEl;
    this.contentEl = contentEl;
    /** @type {string|null} */
    this.activeTabId = null;
  }

  /**
   * Register a new tab.
   * @param {string} id          – unique tab identifier
   * @param {string} label       – text shown on the tab button
   * @param {typeof import('./base-view.js').BaseView} ViewClass – the view class (not instance)
   */
  register(id, label, ViewClass) {
    this.tabs.set(id, { label, ViewClass, instance: null });
  }

  /**
   * Render tab buttons inside tabBarEl from the registry.
   */
  renderTabBar() {
    this.tabBarEl.innerHTML = '';
    for (const [id, { label }] of this.tabs) {
      const btn = document.createElement('button');
      btn.className = 'tab-btn';
      btn.dataset.tab = id;
      btn.textContent = label;
      if (id === this.activeTabId) btn.classList.add('active');
      btn.addEventListener('click', () => this.switchTo(id));
      this.tabBarEl.appendChild(btn);
    }
  }

  /**
   * Switch to a tab by id. Unmounts the previous view, mounts the new one.
   * @param {string} id
   */
  switchTo(id) {
    const entry = this.tabs.get(id);
    if (!entry) {
      logger.warn(`TabRouter: unknown tab "${id}"`);
      return;
    }

    // Unmount current view
    if (this.activeTabId && this.activeTabId !== id) {
      const prev = this.tabs.get(this.activeTabId);
      prev?.instance?.unmount();
    }

    // Lazily create instance
    if (!entry.instance) {
      entry.instance = new entry.ViewClass(id);
    }

    // Mount new view
    this.activeTabId = id;
    entry.instance.mount(this.contentEl);

    // Update tab button active state
    this.tabBarEl.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === id);
    });

    logger.debug(`TabRouter: switched to "${id}"`);
  }

  /**
   * Refresh the currently active view (e.g. on auto-refresh or manual refresh).
   */
  async refreshActive() {
    const entry = this.activeTabId && this.tabs.get(this.activeTabId);
    if (entry?.instance?.mounted) {
      await entry.instance.refresh();
    }
  }

  /**
   * Get the currently active view instance.
   * @returns {import('./base-view.js').BaseView|null}
   */
  getActiveView() {
    const entry = this.activeTabId && this.tabs.get(this.activeTabId);
    return entry?.instance ?? null;
  }
}
