/**
 * prClassifier.js
 * ────────────────
 * Pure domain logic for classifying pull requests from the perspective
 * of the current user. No HTTP calls – this module is fully testable
 * without network access.
 */

import { logger } from '../core/logger.js';

/**
 * Azure DevOps reviewer vote values.
 * @enum {number}
 */
export const VOTE = Object.freeze({
  APPROVED: 10,
  APPROVED_WITH_SUGGESTIONS: 5,
  NO_VOTE: 0,
  WAITING_FOR_AUTHOR: -5,
  REJECTED: -10,
});

/**
 * Classify a single PR from the perspective of the current user.
 *
 * @param {object} pr         – PR object from the API
 * @param {string} myUserId   – GUID of the current user
 * @param {string} teamId     – GUID of the team (optional)
 * @param {boolean} treatTeamVoteAsApproval – when true, team vote counts as personal approval
 * @param {boolean} hasNewPushSinceVote – true if author pushed after the last WFA vote (computed externally)
 * @returns {{ isReviewer:boolean, hasApproved:boolean, needsMyReview:boolean, vote:number, isWaitingForAuthor:boolean, isDraft:boolean, isMuted:boolean }}
 */
export function classifyApproval(pr, myUserId, teamId = null, treatTeamVoteAsApproval = false, hasNewPushSinceVote = false) {
  const lowerMyId = myUserId.toLowerCase();
  const lowerTeamId = teamId?.toLowerCase();

  logger.debug(
    `Classifying PR ${pr.pullRequestId}: userId=${lowerMyId}, teamId=${lowerTeamId}, reviewers=${pr.reviewers?.length}`,
  );

  // First, try to find myself as an individual reviewer
  let reviewer = (pr.reviewers || []).find((r) => r.id?.toLowerCase() === lowerMyId);

  let isTeamMember = false;

  // If I'm not an individual reviewer, check if my team is a reviewer
  if (!reviewer && lowerTeamId) {
    const teamReviewer = (pr.reviewers || []).find((r) => r.id?.toLowerCase() === lowerTeamId);

    if (teamReviewer) {
      logger.debug(
        `PR ${pr.pullRequestId}: not individual reviewer, team IS reviewer (team vote: ${teamReviewer.vote})`,
      );
      reviewer = teamReviewer;
      isTeamMember = true;
    }
  }

  if (!reviewer) {
    logger.debug(`PR ${pr.pullRequestId}: not a reviewer`);
    return {
      isReviewer: false,
      hasApproved: false,
      needsMyReview: false,
      vote: 0,
      isWaitingForAuthor: false,
      isDraft: !!pr.isDraft,
      isMuted: false,
    };
  }

  logger.debug(`PR ${pr.pullRequestId}: reviewer via ${isTeamMember ? 'team' : 'individual'}, vote=${reviewer.vote}`);

  // Team reviewer handling is configurable:
  // - false: team vote does NOT count as my personal approval (effective vote = 0)
  // - true:  team vote is used as effective vote
  const vote = isTeamMember && !treatTeamVoteAsApproval ? 0 : (reviewer.vote ?? 0);

  if (isTeamMember) {
    logger.debug(
      `PR ${pr.pullRequestId}: team vote mode, treatAsApproval=${treatTeamVoteAsApproval}, effectiveVote=${vote}`,
    );
  }

  const hasApproved = vote >= VOTE.APPROVED_WITH_SUGGESTIONS;
  const isWaitingForAuthor = vote === VOTE.WAITING_FOR_AUTHOR;
  const isDraft = !!pr.isDraft;

  // Draft PRs are not actionable – treat them like "waiting for author".
  // The author is still working on the PR, so no review is needed yet.
  const needsMyReview = isDraft ? false : vote < VOTE.APPROVED_WITH_SUGGESTIONS;

  // Mute non-actionable PRs: drafts are always muted;
  // waiting-for-author PRs are muted only when there are no new changes.
  let isMuted = false;
  if (isDraft) {
    isMuted = true;
  } else if (isWaitingForAuthor) {
    isMuted = !hasNewPushSinceVote;
  }

  const result = {
    isReviewer: true,
    hasApproved,
    needsMyReview,
    vote,
    isWaitingForAuthor,
    isDraft,
    isMuted,
  };

  logger.debug(`PR ${pr.pullRequestId} classified:`, result);
  return result;
}

/**
 * Build a human-readable label from the numeric vote.
 * @param {number} vote
 * @returns {string}
 */
export function voteLabel(vote) {
  switch (vote) {
    case VOTE.APPROVED:
      return 'Approved';
    case VOTE.APPROVED_WITH_SUGGESTIONS:
      return 'Approved with suggestions';
    case VOTE.NO_VOTE:
      return 'No vote';
    case VOTE.WAITING_FOR_AUTHOR:
      return 'Waiting for author';
    case VOTE.REJECTED:
      return 'Rejected';
    default:
      return `Vote ${vote}`;
  }
}
