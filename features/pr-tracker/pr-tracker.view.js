/**
 * pr-tracker.view.js
 * ───────────────────
 * PR Tracker feature view.
 * Displays active pull requests with filtering, sorting, and "done" tracking.
 */

import { BaseView } from '../../shared/base-view.js';
import { show, hide, escapeHtml, shortRef } from '../../shared/dom-utils.js';
import { logger } from '../../core/logger.js';
import { FILTER } from '../../core/constants.js';

import { loadConfig, isConfigComplete, loadDonePrIds, saveDonePrIds } from '../../services/configService.js';

import { getMyIdentity, fetchActivePullRequests, fetchMyPullRequests } from '../../services/azureDevopsClient.js';

import { classifyApproval, voteLabel, VOTE } from '../../services/prClassifier.js';
import { getWorkItemsForPr, clearWorkItemCache } from '../../services/workItemService.js';
import { getFooterData } from '../../services/sprintService.js';

export class PrTrackerView extends BaseView {
  constructor(id) {
    super(id);
    this._listEl = null;
    this._loadingEl = null;
    this._emptyEl = null;
    this._statusBar = null;
    this._filterBtns = null;
    this._listenerCleanups = [];

    /* ── Instance state ── */
    this._currentFilter = FILTER.NEEDS_REVIEW;
    this._prData = [];
    this._donePrIds = new Set();
    this._myUserId = null;
    this._myDisplayName = null;
    this._footerEl = null;
  }

  /* ── BaseView overrides ── */

  render() {
    this.container.innerHTML = `
      <div id="pt-status-bar" class="status-bar hidden"></div>

      <nav class="filter-bar">
        <button class="filter-btn" data-filter="${FILTER.ALL}">All</button>
        <button class="filter-btn active" data-filter="${FILTER.NEEDS_REVIEW}">Needs My Review</button>
        <button class="filter-btn" data-filter="${FILTER.APPROVED}">Approved</button>
        <!-- Zakładka "My PR" – wyświetla PR-y stworzone przez aktualnego użytkownika -->
        <button class="filter-btn" data-filter="${FILTER.MY_PR}">My PR</button>
        <button class="filter-btn" data-filter="${FILTER.DONE}">Done</button>
      </nav>

      <div class="pt-list"></div>

      <div class="pt-loading hidden">
        <div class="spinner"></div>
        <span>Loading pull requests\u2026</span>
      </div>

      <div class="pt-empty hidden">
        <p>No pull requests to show.</p>
        <p class="hint">Configure your Azure DevOps settings first.</p>
        <button class="btn-open-options">Open Settings</button>
      </div>

      <footer class="pt-footer hidden"></footer>
    `;

    this._statusBar = this.container.querySelector('.status-bar');
    this._listEl = this.container.querySelector('.pt-list');
    this._loadingEl = this.container.querySelector('.pt-loading');
    this._emptyEl = this.container.querySelector('.pt-empty');
    this._filterBtns = this.container.querySelectorAll('.filter-btn');
    this._footerEl = this.container.querySelector('.pt-footer');

    this._bindEvents();
    this._loadData();
  }

  async refresh() {
    this._myUserId = null;
    this._myDisplayName = null;
    clearWorkItemCache();
    await this._loadData();
  }

  dispose() {
    this._listenerCleanups.forEach((fn) => fn());
    this._listenerCleanups = [];
  }

  /* ── Status bar helpers ── */

  _showStatus(msg, type = 'info') {
    this._statusBar.textContent = msg;
    this._statusBar.className = `status-bar ${type}`;
    show(this._statusBar);
  }

  _clearStatus() {
    hide(this._statusBar);
  }

  /* ── Rendering ── */

  _renderCard(pr) {
    const card = document.createElement('div');
    card.className = 'pr-card';
    card.dataset.prId = pr.pullRequestId;

    if (this._donePrIds.has(pr.pullRequestId)) card.classList.add('done-card');
    if (pr._approval.isMuted) card.classList.add('pr-card-muted');

    if (pr._approval.isReviewer) {
      card.classList.add(pr._approval.hasApproved ? 'approved-card' : 'needs-review');
    } else {
      card.classList.add('not-reviewer');
    }

    const prUrl =
      `https://dev.azure.com/${pr._org}/${encodeURIComponent(pr.repository.project.name)}` +
      `/_git/${encodeURIComponent(pr.repository.name)}/pullrequest/${pr.pullRequestId}`;

    let badgeHtml;
    if (pr._approval.isReviewer) {
      if (pr._approval.hasApproved) {
        badgeHtml = `<span class="badge badge-approved">${voteLabel(pr._approval.vote)}</span>`;
      } else if (pr._approval.vote === VOTE.NO_VOTE) {
        badgeHtml = `<span class="badge badge-needs">Needs my review</span>`;
      } else if (pr._approval.vote === VOTE.WAITING_FOR_AUTHOR) {
        const mutedIndicator = pr._approval.isMuted ? ' (no new changes)' : '';
        badgeHtml = `<span class="badge badge-waiting">${voteLabel(pr._approval.vote)}${mutedIndicator}</span>`;
      } else if (pr._approval.vote === VOTE.REJECTED) {
        badgeHtml = `<span class="badge badge-rejected">${voteLabel(pr._approval.vote)}</span>`;
      } else {
        badgeHtml = `<span class="badge badge-no-vote">${voteLabel(pr._approval.vote)}</span>`;
      }
    } else {
      badgeHtml = `<span class="badge badge-not-reviewer">Not a reviewer</span>`;
    }

    const isDone = this._donePrIds.has(pr.pullRequestId);

    card.innerHTML = `
      <div class="pr-title">
        <a href="${prUrl}" target="_blank" rel="noopener" title="Open in Azure DevOps">
          ${escapeHtml(pr.title)}
        </a>
      </div>
      <div class="pr-meta">
        <span title="Repository">${escapeHtml(pr.repository.name)}</span>
        <span title="Author">by ${escapeHtml(pr.createdBy?.displayName || 'Unknown')}</span>
        <span title="Project">${escapeHtml(pr.repository.project?.name || '')}</span>
      </div>
      <div class="pr-branches">
        <code>${escapeHtml(shortRef(pr.sourceRefName))}</code>
        &rarr;
        <code>${escapeHtml(shortRef(pr.targetRefName))}</code>
      </div>
      <div class="pr-badges">
        ${badgeHtml}
        <label class="done-toggle" title="Mark as locally done">
          <input type="checkbox" class="done-cb" data-pr-id="${pr.pullRequestId}" ${isDone ? 'checked' : ''} />
          Done
        </label>
      </div>
      <div class="pr-work-items" data-pr-id="${pr.pullRequestId}"></div>
    `;

    return card;
  }

  _renderList() {
    this._listEl.innerHTML = '';

    logger.debug(
      `renderList: filter=${this._currentFilter}, total=${this._prData.length}, done=${this._donePrIds.size}`,
    );

    const visible = this._prData.filter((pr) => {
      const isDone = this._donePrIds.has(pr.pullRequestId);
      const approval = pr._approval;

      switch (this._currentFilter) {
        case FILTER.NEEDS_REVIEW:
          // Exclude PRs created by the current user – those belong in "My PR" only
          return approval.isReviewer && approval.needsMyReview && !isDone && !pr._isMyPr;
        case FILTER.APPROVED:
          return approval.isReviewer && approval.hasApproved && !isDone;
        // Filtr "My PR": autor = aktualny użytkownik ORAZ (status active LUB isDraft)
        case FILTER.MY_PR:
          return pr._isMyPr && !isDone;
        case FILTER.DONE:
          return isDone;
        default:
          return !isDone;
      }
    });

    logger.debug(`renderList: ${visible.length} visible PRs after filter`);

    if (visible.length === 0 && this._prData.length > 0) {
      this._listEl.innerHTML = '<p style="text-align:center;color:#888;padding:24px;">No PRs match this filter.</p>';
      return;
    }

    visible.sort((a, b) => {
      const aDone = this._donePrIds.has(a.pullRequestId) ? 1 : 0;
      const bDone = this._donePrIds.has(b.pullRequestId) ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      const aNeeds = a._approval.isReviewer && !a._approval.hasApproved ? 0 : 1;
      const bNeeds = b._approval.isReviewer && !b._approval.hasApproved ? 0 : 1;
      return aNeeds - bNeeds;
    });

    for (const pr of visible) {
      this._listEl.appendChild(this._renderCard(pr));
    }

    this._loadWorkItemsForVisiblePrs(visible);
  }

  /**
   * Fetch and render work items for all visible PRs (non-blocking).
   * @param {Array} prs
   */
  async _loadWorkItemsForVisiblePrs(prs) {
    const config = await loadConfig();
    const promises = prs.map(async (pr) => {
      const container = this._listEl.querySelector(
        `.pr-work-items[data-pr-id="${pr.pullRequestId}"]`,
      );
      if (!container) return;

      try {
        const workItems = await getWorkItemsForPr({
          organization: config.organization,
          project: config.project,
          repositoryId: pr.repository.id,
          pullRequestId: pr.pullRequestId,
          pat: config.pat,
        });
        this._renderWorkItems(container, workItems);
      } catch (err) {
        logger.error(`Failed to load work items for PR ${pr.pullRequestId}:`, err);
        container.innerHTML = '<span class="wi-error">Failed to load work items</span>';
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Render work items inside a container element.
   * @param {HTMLElement} container
   * @param {import('../../services/workItemService.js').PrWorkItem[]} workItems
   */
  _renderWorkItems(container, workItems) {
    if (workItems.length === 0) return;

    container.innerHTML = workItems
      .map(
        (wi) =>
          `<span class="wi-item">` +
          `<a href="${escapeHtml(wi.url)}" target="_blank" rel="noopener" title="${escapeHtml(wi.title)}">#${wi.id}</a>` +
          ` <span class="wi-state">(${escapeHtml(wi.state)})</span>` +
          `</span>`,
      )
      .join('');
  }

  /* ── Footer ── */

  /**
   * Load sprint and active-tasks data and render the footer.
   * @param {object} config
   */
  async _loadFooter(config) {
    if (!config.sprintTeam) {
      hide(this._footerEl);
      return;
    }

    try {
      const data = await getFooterData({
        organization: config.organization,
        project: config.project,
        sprintTeam: config.sprintTeam,
        userDisplayName: this._myDisplayName,
        pat: config.pat,
      });
      this._renderFooter(data);
    } catch (err) {
      logger.error('Footer load failed:', err);
      this._footerEl.innerHTML = '<span class="footer-error">Failed to load footer data</span>';
      show(this._footerEl);
    }
  }

  /**
   * Render footer content (sprint link + active tasks).
   * @param {import('../../services/sprintService.js').FooterData} data
   */
  _renderFooter({ sprint, activeTasks }) {
    let html = '';

    if (sprint) {
      html += `<div class="footer-sprint">Sprint: <a href="${escapeHtml(sprint.url)}" target="_blank" rel="noopener">${escapeHtml(sprint.name)}</a></div>`;
    }

    if (activeTasks.length === 0) {
      html += `<div class="footer-warning">\u26a0\ufe0f Nie masz obecnie \u017cadnych zada\u0144 w statusie Active.</div>`;
    } else {
      const items = activeTasks
        .map(
          (t) =>
            `<a href="${escapeHtml(t.url)}" target="_blank" rel="noopener" title="${escapeHtml(t.title)}">#${t.id}</a>`,
        )
        .join(' ');
      html += `<div class="footer-tasks">Active: ${items}</div>`;
    }

    this._footerEl.innerHTML = html;
    show(this._footerEl);
  }

  /* ── Data loading ── */

  async _loadData() {
    this._clearStatus();
    show(this._loadingEl);
    hide(this._emptyEl);
    this._listEl.innerHTML = '';

    try {
      const config = await loadConfig();

      if (!isConfigComplete(config)) {
        hide(this._loadingEl);
        show(this._emptyEl);
        return;
      }

      if (!this._myUserId) {
        const me = await getMyIdentity(config.organization, config.pat);
        this._myUserId = me.id;
        this._myDisplayName = me.displayName;
        logger.info('Authenticated as:', me.displayName, me.id);
      }

      const { prs, teamId } = await fetchActivePullRequests(config);
      logger.debug('Fetched PRs count:', prs.length);

      // Pobierz PR-y stworzone przez aktualnego użytkownika (active + draft)
      let myPrs = [];
      try {
        myPrs = await fetchMyPullRequests(config.organization, config.project, this._myUserId, config.pat);
        logger.debug('Fetched my PRs count:', myPrs.length);
      } catch (err) {
        logger.error('Failed to fetch my PRs:', err);
      }

      // Scal PR-y: team-filtered + moje (deduplikacja po pullRequestId)
      const seenIds = new Set(prs.map((pr) => pr.pullRequestId));
      const mergedPrs = [...prs];
      for (const pr of myPrs) {
        if (!seenIds.has(pr.pullRequestId)) {
          mergedPrs.push(pr);
          seenIds.add(pr.pullRequestId);
        }
      }
      // Zbiór ID moich PR-ów (autor = aktualny użytkownik, status active LUB draft)
      const myPrIds = new Set(myPrs.map((pr) => pr.pullRequestId));

      this._donePrIds = await loadDonePrIds();
      this._prData = mergedPrs.map((pr) => ({
        ...pr,
        _org: config.organization,
        _approval: classifyApproval(pr, this._myUserId, teamId, config.treatTeamVoteAsApproval),
        _isMyPr: myPrIds.has(pr.pullRequestId),
      }));

      hide(this._loadingEl);

      if (this._prData.length === 0) {
        show(this._emptyEl);
        this._emptyEl.querySelector('p').textContent = 'No active pull requests found.';
        this._emptyEl.querySelector('.hint').textContent = '';
      } else {
        hide(this._emptyEl);
        this._showStatus(`${this._prData.length} active PR(s) loaded`, 'success');
        setTimeout(() => this._clearStatus(), 3000);
        this._renderList();
      }

      // Load footer (non-blocking)
      this._loadFooter(config);
    } catch (err) {
      hide(this._loadingEl);
      logger.error(err);
      this._showStatus(err.message, 'error');
    }
  }

  /* ── Events ── */

  _bindEvents() {
    // Filter tabs
    this._filterBtns.forEach((btn) => {
      const handler = () => {
        this._filterBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this._currentFilter = btn.dataset.filter;
        logger.debug('Filter changed to:', this._currentFilter);
        this._renderList();
      };
      btn.addEventListener('click', handler);
      this._listenerCleanups.push(() => btn.removeEventListener('click', handler));
    });

    // Done checkboxes (event delegation)
    const doneHandler = async (e) => {
      if (!e.target.classList.contains('done-cb')) return;
      const prId = Number(e.target.dataset.prId);
      if (e.target.checked) {
        this._donePrIds.add(prId);
      } else {
        this._donePrIds.delete(prId);
      }
      await saveDonePrIds(this._donePrIds);
      this._renderList();
    };
    this._listEl.addEventListener('change', doneHandler);
    this._listenerCleanups.push(() => this._listEl.removeEventListener('change', doneHandler));

    // Open settings button in empty state
    const optBtn = this.container.querySelector('.btn-open-options');
    if (optBtn) {
      const optHandler = () => chrome.runtime.openOptionsPage();
      optBtn.addEventListener('click', optHandler);
      this._listenerCleanups.push(() => optBtn.removeEventListener('click', optHandler));
    }

    // Config changes
    const storageHandler = (changes, area) => {
      if (
        area === 'local' &&
        (changes.organization || changes.project || changes.pat || changes.team || changes.treatTeamVoteAsApproval)
      ) {
        logger.info('Config changed, reloading…');
        this._myUserId = null;
        this._loadData();
      }
    };
    chrome.storage.onChanged.addListener(storageHandler);
    this._listenerCleanups.push(() => chrome.storage.onChanged.removeListener(storageHandler));
  }
}
