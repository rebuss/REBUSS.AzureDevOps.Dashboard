/**
 * base-view.js
 * ─────────────
 * Abstract base class for all feature views.
 *
 * Every feature (tab) extends BaseView and implements:
 *   - render()   → build / rebuild DOM inside this.container
 *   - refresh()  → re-fetch data + render  (called by auto-refresh / manual refresh)
 *   - dispose()  → optional cleanup (remove listeners, timers, etc.)
 *
 * Lifecycle managed by TabRouter:
 *   mount(parentEl) → unmount()  → mount(parentEl) → …
 */

export class BaseView {
  /**
   * @param {string} id – unique view identifier (matches the tab id)
   */
  constructor(id) {
    /** @type {string} */
    this.id = id;
    /** @type {HTMLElement|null} */
    this.container = null;
    /** @type {boolean} */
    this.mounted = false;
  }

  /**
   * Create the container element and attach it to the parent.
   * Calls render() once mounted.
   * @param {HTMLElement} parentEl
   */
  mount(parentEl) {
    if (this.mounted) return;
    this.container = document.createElement('div');
    this.container.id = `view-${this.id}`;
    this.container.className = 'view-container';
    parentEl.appendChild(this.container);
    this.mounted = true;
    this.render();
  }

  /**
   * Remove the container from DOM and clean up.
   */
  unmount() {
    if (!this.mounted) return;
    this.dispose();
    this.container?.remove();
    this.container = null;
    this.mounted = false;
  }

  /** Build / rebuild DOM inside this.container. Override in subclass. */
  render() {
    throw new Error(`${this.constructor.name} must implement render()`);
  }

  /** Re-fetch data and re-render. Override in subclass. */
  async refresh() {
    this.render();
  }

  /** Optional cleanup hook. Override if you register global listeners. */
  dispose() {}
}
