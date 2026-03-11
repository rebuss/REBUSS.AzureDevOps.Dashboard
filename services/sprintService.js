/**
 * sprintService.js
 * ────────────────
 * Fetches current sprint info and the current user's Active work items.
 *
 * @typedef {{ id: number, title: string, url: string }} MyActiveTask
 * @typedef {{ name: string, path: string, url: string }} SprintInfo
 * @typedef {{ sprint: SprintInfo|null, activeTasks: MyActiveTask[] }} FooterData
 */

import { logger } from '../core/logger.js';
import { fetchCurrentSprint, runWiqlQuery, fetchWorkItemsBatch } from './azureDevopsClient.js';

/**
 * Map a raw work item object to MyActiveTask.
 * @param {object} wi
 * @param {string} organization
 * @param {string} project
 * @returns {MyActiveTask}
 */
export function mapToActiveTask(wi, organization, project) {
  const fields = wi.fields || {};
  const id = fields['System.Id'] ?? wi.id;
  return {
    id,
    title: fields['System.Title'] || '(Untitled)',
    url:
      `https://dev.azure.com/${encodeURIComponent(organization)}` +
      `/${encodeURIComponent(project)}/_workitems/edit/${id}`,
  };
}

/**
 * Build the WIQL query for active tasks assigned to a specific user.
 * @param {string} userDisplayName
 * @returns {string}
 */
export function buildActiveTasksWiql(userDisplayName) {
  return (
    `SELECT [System.Id], [System.Title], [System.State] ` +
    `FROM WorkItems ` +
    `WHERE [System.AssignedTo] = '${userDisplayName.replace(/'/g, "''")}' ` +
    `AND [System.State] = 'Active' ` +
    `ORDER BY [System.Id] ASC`
  );
}

/**
 * Fetch footer data: current sprint + user's active tasks.
 *
 * @param {object} opts
 * @param {string} opts.organization
 * @param {string} opts.project
 * @param {string} opts.sprintTeam  – team name for sprint lookup
 * @param {string} opts.userDisplayName – display name of the current user
 * @param {string} opts.pat
 * @returns {Promise<FooterData>}
 */
export async function getFooterData({ organization, project, sprintTeam, userDisplayName, pat }) {
  // Run sprint and active-tasks queries in parallel
  const [sprint, activeTasks] = await Promise.all([
    fetchSprintSafe(organization, project, sprintTeam, pat),
    fetchActiveTasksSafe(organization, project, userDisplayName, pat),
  ]);

  return { sprint, activeTasks };
}

/**
 * @returns {Promise<SprintInfo|null>}
 */
async function fetchSprintSafe(organization, project, sprintTeam, pat) {
  if (!sprintTeam) return null;
  try {
    return await fetchCurrentSprint(organization, project, sprintTeam, pat);
  } catch (err) {
    logger.error('Failed to fetch current sprint:', err);
    return null;
  }
}

/**
 * @returns {Promise<MyActiveTask[]>}
 */
async function fetchActiveTasksSafe(organization, project, userDisplayName, pat) {
  try {
    const wiql = buildActiveTasksWiql(userDisplayName);
    const ids = await runWiqlQuery(organization, project, wiql, pat);
    if (ids.length === 0) return [];

    const rawItems = await fetchWorkItemsBatch(organization, project, ids, pat);
    return rawItems.map((wi) => mapToActiveTask(wi, organization, project));
  } catch (err) {
    logger.error('Failed to fetch active tasks:', err);
    return [];
  }
}
