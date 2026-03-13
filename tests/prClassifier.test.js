import { describe, it, expect, vi } from 'vitest';

// Mock the logger so prClassifier doesn't call the real one
vi.mock('../core/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { classifyApproval, voteLabel, VOTE } from '../services/prClassifier.js';

/* ── Helpers ── */

const MY_ID = 'aaaa-bbbb-cccc';
const TEAM_ID = 'team-1111-2222';

/** Build a minimal PR object with given reviewers. */
function makePr(reviewers = [], overrides = {}) {
  return {
    pullRequestId: 42,
    creationDate: new Date().toISOString(),
    reviewers,
    ...overrides,
  };
}

function reviewer(id, vote = 0) {
  return { id, vote };
}

/* ── classifyApproval ── */

describe('classifyApproval', () => {
  describe('when user is NOT a reviewer', () => {
    it('returns isReviewer=false', () => {
      const pr = makePr([reviewer('other-user', 10)]);
      const result = classifyApproval(pr, MY_ID);
      expect(result.isReviewer).toBe(false);
      expect(result.hasApproved).toBe(false);
      expect(result.needsMyReview).toBe(false);
    });
  });

  describe('when user is an individual reviewer', () => {
    it('detects NO_VOTE', () => {
      const pr = makePr([reviewer(MY_ID, VOTE.NO_VOTE)]);
      const result = classifyApproval(pr, MY_ID);
      expect(result.isReviewer).toBe(true);
      expect(result.vote).toBe(VOTE.NO_VOTE);
      expect(result.needsMyReview).toBe(true);
      expect(result.hasApproved).toBe(false);
    });

    it('detects APPROVED', () => {
      const pr = makePr([reviewer(MY_ID, VOTE.APPROVED)]);
      const result = classifyApproval(pr, MY_ID);
      expect(result.hasApproved).toBe(true);
      expect(result.needsMyReview).toBe(false);
      expect(result.vote).toBe(VOTE.APPROVED);
    });

    it('detects APPROVED_WITH_SUGGESTIONS', () => {
      const pr = makePr([reviewer(MY_ID, VOTE.APPROVED_WITH_SUGGESTIONS)]);
      const result = classifyApproval(pr, MY_ID);
      expect(result.hasApproved).toBe(true);
      expect(result.vote).toBe(VOTE.APPROVED_WITH_SUGGESTIONS);
    });

    it('detects WAITING_FOR_AUTHOR', () => {
      const pr = makePr([reviewer(MY_ID, VOTE.WAITING_FOR_AUTHOR)]);
      const result = classifyApproval(pr, MY_ID);
      expect(result.isWaitingForAuthor).toBe(true);
      expect(result.needsMyReview).toBe(true);
      expect(result.hasApproved).toBe(false);
    });

    it('detects REJECTED', () => {
      const pr = makePr([reviewer(MY_ID, VOTE.REJECTED)]);
      const result = classifyApproval(pr, MY_ID);
      expect(result.vote).toBe(VOTE.REJECTED);
      expect(result.needsMyReview).toBe(true);
      expect(result.hasApproved).toBe(false);
    });
  });

  describe('team reviewer fallback', () => {
    it('uses team reviewer when user is not individual reviewer', () => {
      const pr = makePr([reviewer(TEAM_ID, VOTE.APPROVED)]);
      const result = classifyApproval(pr, MY_ID, TEAM_ID, false);
      // treatTeamVoteAsApproval=false → effective vote = 0
      expect(result.isReviewer).toBe(true);
      expect(result.vote).toBe(0);
      expect(result.hasApproved).toBe(false);
      expect(result.needsMyReview).toBe(true);
    });

    it('respects treatTeamVoteAsApproval=true', () => {
      const pr = makePr([reviewer(TEAM_ID, VOTE.APPROVED)]);
      const result = classifyApproval(pr, MY_ID, TEAM_ID, true);
      expect(result.vote).toBe(VOTE.APPROVED);
      expect(result.hasApproved).toBe(true);
    });

    it('prefers individual reviewer over team', () => {
      const pr = makePr([reviewer(MY_ID, VOTE.REJECTED), reviewer(TEAM_ID, VOTE.APPROVED)]);
      const result = classifyApproval(pr, MY_ID, TEAM_ID, true);
      // Individual takes precedence
      expect(result.vote).toBe(VOTE.REJECTED);
    });
  });

  describe('case-insensitive ID matching', () => {
    it('matches user IDs regardless of casing', () => {
      const pr = makePr([reviewer(MY_ID.toUpperCase(), VOTE.APPROVED)]);
      const result = classifyApproval(pr, MY_ID.toLowerCase());
      expect(result.isReviewer).toBe(true);
      expect(result.hasApproved).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles PR with no reviewers array', () => {
      const pr = { pullRequestId: 1, creationDate: new Date().toISOString() };
      const result = classifyApproval(pr, MY_ID);
      expect(result.isReviewer).toBe(false);
    });

    it('handles reviewer with null vote', () => {
      const pr = makePr([{ id: MY_ID, vote: null }]);
      const result = classifyApproval(pr, MY_ID);
      expect(result.isReviewer).toBe(true);
      expect(result.vote).toBe(0);
    });
  });

  describe('draft PRs', () => {
    it('sets isDraft=true for draft PRs', () => {
      const pr = makePr([reviewer(MY_ID, VOTE.NO_VOTE)], { isDraft: true });
      const result = classifyApproval(pr, MY_ID);
      expect(result.isDraft).toBe(true);
    });

    it('sets isDraft=false for non-draft PRs', () => {
      const pr = makePr([reviewer(MY_ID, VOTE.NO_VOTE)]);
      const result = classifyApproval(pr, MY_ID);
      expect(result.isDraft).toBe(false);
    });

    it('sets needsMyReview=false for draft PRs even with no vote', () => {
      const pr = makePr([reviewer(MY_ID, VOTE.NO_VOTE)], { isDraft: true });
      const result = classifyApproval(pr, MY_ID);
      expect(result.needsMyReview).toBe(false);
    });

    it('sets isMuted=true for draft PRs', () => {
      const pr = makePr([reviewer(MY_ID, VOTE.NO_VOTE)], { isDraft: true });
      const result = classifyApproval(pr, MY_ID);
      expect(result.isMuted).toBe(true);
    });

    it('preserves vote value for draft PRs', () => {
      const pr = makePr([reviewer(MY_ID, VOTE.APPROVED)], { isDraft: true });
      const result = classifyApproval(pr, MY_ID);
      expect(result.vote).toBe(VOTE.APPROVED);
      expect(result.isDraft).toBe(true);
      expect(result.isMuted).toBe(true);
    });

    it('reports isDraft even when not a reviewer', () => {
      const pr = makePr([reviewer('other-user', 10)], { isDraft: true });
      const result = classifyApproval(pr, MY_ID);
      expect(result.isReviewer).toBe(false);
      expect(result.isDraft).toBe(true);
    });
  });
});

/* ── voteLabel ── */

describe('voteLabel', () => {
  it.each([
    [VOTE.APPROVED, 'Approved'],
    [VOTE.APPROVED_WITH_SUGGESTIONS, 'Approved with suggestions'],
    [VOTE.NO_VOTE, 'No vote'],
    [VOTE.WAITING_FOR_AUTHOR, 'Waiting for author'],
    [VOTE.REJECTED, 'Rejected'],
  ])('maps vote %i to "%s"', (vote, expected) => {
    expect(voteLabel(vote)).toBe(expected);
  });

  it('returns fallback for unknown vote values', () => {
    expect(voteLabel(99)).toBe('Vote 99');
  });
});

/* ── VOTE enum ── */

describe('VOTE enum', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(VOTE)).toBe(true);
  });

  it('has expected values', () => {
    expect(VOTE.APPROVED).toBe(10);
    expect(VOTE.NO_VOTE).toBe(0);
    expect(VOTE.REJECTED).toBe(-10);
  });
});
