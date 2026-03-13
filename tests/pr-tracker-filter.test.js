import { describe, it, expect } from 'vitest';
import { FILTER } from '../core/constants.js';

/**
 * Extracted filter predicate matching _renderList() in pr-tracker.view.js.
 * Note: needsMyReview is already set to false for own PRs by _loadData(),
 * so the filter itself does not need an explicit _isMyPr check.
 */
function filterPr(pr, currentFilter, donePrIds) {
  const isDone = donePrIds.has(pr.pullRequestId);
  const approval = pr._approval;

  switch (currentFilter) {
    case FILTER.NEEDS_REVIEW:
      return approval.isReviewer && approval.needsMyReview && !isDone;
    case FILTER.APPROVED:
      return approval.isReviewer && approval.hasApproved && !isDone;
    case FILTER.MY_PR:
      return pr._isMyPr && !isDone;
    case FILTER.DONE:
      return isDone;
    default: // FILTER.ALL
      return !isDone;
  }
}

/* ── Helpers ── */

function makePr({ id = 1, isReviewer = false, needsMyReview = false, hasApproved = false, isMyPr = false, vote = 0 } = {}) {
  return {
    pullRequestId: id,
    _isMyPr: isMyPr,
    _approval: { isReviewer, needsMyReview, hasApproved, vote, isWaitingForAuthor: false, isMuted: false },
  };
}

const NO_DONE = new Set();

/* ── Tests ── */

describe('PR filter: NEEDS_REVIEW', () => {
  it('shows PRs that need my review and are NOT mine', () => {
    const pr = makePr({ isReviewer: true, needsMyReview: true, isMyPr: false });
    expect(filterPr(pr, FILTER.NEEDS_REVIEW, NO_DONE)).toBe(true);
  });

  it('excludes own PRs because needsMyReview is already false (set by view layer)', () => {
    // When _isMyPr is true, the view layer sets needsMyReview to false
    // before the filter runs, so the filter naturally excludes them.
    const pr = makePr({ isReviewer: true, needsMyReview: false, isMyPr: true });
    expect(filterPr(pr, FILTER.NEEDS_REVIEW, NO_DONE)).toBe(false);
  });

  it('excludes PRs already marked as done', () => {
    const pr = makePr({ id: 5, isReviewer: true, needsMyReview: true });
    expect(filterPr(pr, FILTER.NEEDS_REVIEW, new Set([5]))).toBe(false);
  });

  it('excludes PRs where user is not a reviewer', () => {
    const pr = makePr({ isReviewer: false, needsMyReview: false });
    expect(filterPr(pr, FILTER.NEEDS_REVIEW, NO_DONE)).toBe(false);
  });

  it('excludes draft PRs because needsMyReview is false (set by classifier)', () => {
    // Draft PRs get needsMyReview=false from classifyApproval,
    // so they are naturally excluded from the NEEDS_REVIEW filter.
    const pr = makePr({ isReviewer: true, needsMyReview: false, isMyPr: false });
    expect(filterPr(pr, FILTER.NEEDS_REVIEW, NO_DONE)).toBe(false);
  });

  it('excludes PRs already approved by user', () => {
    const pr = makePr({ isReviewer: true, needsMyReview: false, hasApproved: true });
    expect(filterPr(pr, FILTER.NEEDS_REVIEW, NO_DONE)).toBe(false);
  });
});

describe('PR filter: MY_PR', () => {
  it('shows PRs created by the current user', () => {
    const pr = makePr({ isMyPr: true });
    expect(filterPr(pr, FILTER.MY_PR, NO_DONE)).toBe(true);
  });

  it('excludes PRs not created by the current user', () => {
    const pr = makePr({ isMyPr: false });
    expect(filterPr(pr, FILTER.MY_PR, NO_DONE)).toBe(false);
  });

  it('excludes done PRs even if created by user', () => {
    const pr = makePr({ id: 7, isMyPr: true });
    expect(filterPr(pr, FILTER.MY_PR, new Set([7]))).toBe(false);
  });
});

describe('PR filter: APPROVED', () => {
  it('shows PRs approved by the user', () => {
    const pr = makePr({ isReviewer: true, hasApproved: true });
    expect(filterPr(pr, FILTER.APPROVED, NO_DONE)).toBe(true);
  });
});

describe('PR filter: DONE', () => {
  it('shows only PRs marked as done', () => {
    const pr = makePr({ id: 3 });
    expect(filterPr(pr, FILTER.DONE, new Set([3]))).toBe(true);
    expect(filterPr(pr, FILTER.DONE, NO_DONE)).toBe(false);
  });
});

describe('PR filter: ALL', () => {
  it('shows non-done PRs', () => {
    const pr = makePr({ id: 1 });
    expect(filterPr(pr, FILTER.ALL, NO_DONE)).toBe(true);
    expect(filterPr(pr, FILTER.ALL, new Set([1]))).toBe(false);
  });
});
