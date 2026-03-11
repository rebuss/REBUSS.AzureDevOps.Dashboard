/**
 * configService.js
 * ────────────────
 * Centralises all access to user-provided configuration (organization,
 * project, team, PAT).  Nothing is hard-coded – every value is read from
 * chrome.storage.local, which is populated via the Options page.
 *
 * SECURITY NOTE
 *   • The PAT is stored in chrome.storage.local which is sandboxed to
 *     this extension.  It is never exposed to web pages.
 *   • For additional hardening you could encrypt the PAT before storing,
 *     but that is out-of-scope for this MVP.
 *
 * STORAGE KEYS
 *   organization  – e.g. "myorg"  (just the slug, NOT the full URL) [REQUIRED]
 *   project       – e.g. "MyProject" [REQUIRED]
 *   team          – e.g. "MyTeam"  (team name) [REQUIRED]
 *   pat           – Personal Access Token [REQUIRED]
 *   autoRefresh   – boolean, whether to auto-refresh every N minutes
 *   refreshInterval – number, minutes between auto-refreshes (default 5)
 *   treatTeamVoteAsApproval – boolean, whether team vote counts as my approval
 */

import { STORAGE_KEY } from '../core/constants.js';

const CONFIG_KEYS = [
  STORAGE_KEY.ORGANIZATION,
  STORAGE_KEY.PROJECT,
  STORAGE_KEY.TEAM,
  STORAGE_KEY.PAT,
  STORAGE_KEY.AUTO_REFRESH,
  STORAGE_KEY.REFRESH_INTERVAL,
  STORAGE_KEY.TREAT_TEAM_VOTE,
  STORAGE_KEY.SPRINT_TEAM,
];

/**
 * Load all configuration values from storage.
 * @returns {Promise<{organization:string, project:string, team:string, pat:string, autoRefresh:boolean, refreshInterval:number, treatTeamVoteAsApproval:boolean}>}
 */
export async function loadConfig() {
  const result = await chrome.storage.local.get(CONFIG_KEYS);
  return {
    organization: result.organization || '',
    project: result.project || '',
    team: result.team || '',
    pat: result.pat || '',
    autoRefresh: result.autoRefresh ?? true,
    refreshInterval: result.refreshInterval ?? 5,
    treatTeamVoteAsApproval: result.treatTeamVoteAsApproval ?? false,
    sprintTeam: result.sprintTeam || '',
  };
}

/**
 * Persist all configuration values to storage.
 * @param {{organization:string, project:string, team:string, pat:string, autoRefresh:boolean, refreshInterval:number, treatTeamVoteAsApproval:boolean}} config
 * @returns {Promise<void>}
 */
export async function saveConfig(config) {
  await chrome.storage.local.set(config);
}

/**
 * Quick check: are all required fields filled in?
 * @param {object} config
 * @returns {boolean}
 */
export function isConfigComplete(config) {
  return !!(config.organization && config.project && config.team && config.pat);
  // All fields are required: organization, project, team, and PAT.
}

/* ── "Done" flags (local-only) ── */

const DONE_KEY = STORAGE_KEY.DONE_PR_IDS;

/**
 * Load the set of PR IDs that the user manually marked as "done".
 * @returns {Promise<Set<number>>}
 */
export async function loadDonePrIds() {
  const result = await chrome.storage.local.get([DONE_KEY]);
  return new Set(result[DONE_KEY] || []);
}

/**
 * Persist the set of "done" PR IDs.
 * @param {Set<number>} ids
 * @returns {Promise<void>}
 */
export async function saveDonePrIds(ids) {
  await chrome.storage.local.set({ [DONE_KEY]: [...ids] });
}
