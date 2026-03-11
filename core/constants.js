/**
 * constants.js
 * ─────────────
 * Single source of truth for magic strings and numbers used across the extension.
 */

/** Azure DevOps API version used in all requests. */
export const API_VERSION = '7.1-preview.1';

/** API version for the WIQL endpoint (requires preview.2). */
export const API_VERSION_WIQL = '7.1-preview.2';

/** Maximum number of PRs fetched per request. */
export const MAX_PRS = 200;

/** Maximum number of work items per batch API call. */
export const WORK_ITEM_BATCH_SIZE = 200;

/** Filter tab identifiers. */
export const FILTER = Object.freeze({
  ALL: 'all',
  NEEDS_REVIEW: 'needs-review',
  APPROVED: 'approved',
  MY_PR: 'my-pr',
  DONE: 'done',
});

/** chrome.storage.local key names. */
export const STORAGE_KEY = Object.freeze({
  ORGANIZATION: 'organization',
  PROJECT: 'project',
  TEAM: 'team',
  PAT: 'pat',
  AUTO_REFRESH: 'autoRefresh',
  REFRESH_INTERVAL: 'refreshInterval',
  TREAT_TEAM_VOTE: 'treatTeamVoteAsApproval',
  DONE_PR_IDS: 'donePrIds',
  SPRINT_TEAM: 'sprintTeam',
});

/** chrome.runtime message types. */
export const MSG = Object.freeze({
  AUTO_REFRESH: 'AUTO_REFRESH',
});

/** chrome.alarms name. */
export const ALARM_NAME = 'rebuss-auto-refresh';
