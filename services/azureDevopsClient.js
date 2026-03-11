/**
 * azureDevopsClient.js
 * ────────────────────
 * Thin wrapper around Azure DevOps REST API (v7.1-preview).
 *
 * AUTHENTICATION
 *   Uses Basic Auth with an empty username and the PAT as password.
 *   Header:  Authorization: Basic base64(":" + pat)
 *
 * TEAM FILTERING
 *   Pull requests are filtered to show only those where the specified team
 *   is set as a required or optional reviewer.
 *
 * HOW TO EXTEND
 *   • To filter by repository: add `searchCriteria.repositoryId` to the
 *     pull-requests query string.
 *   • To filter by author: add `searchCriteria.creatorId`.
 *   • See https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/get-pull-requests
 */

import { logger } from '../core/logger.js';
import { API_VERSION, API_VERSION_WIQL, MAX_PRS, WORK_ITEM_BATCH_SIZE } from '../core/constants.js';

/**
 * Build the Basic-Auth header value for a PAT.
 * @param {string} pat
 * @returns {string}
 */
function authHeader(pat) {
  return 'Basic ' + btoa(':' + pat);
}

/**
 * Get team ID by team name.
 * Lists all teams in the project and finds the one matching the given name.
 *
 * @param {string} organization
 * @param {string} project
 * @param {string} teamName
 * @param {string} pat
 * @returns {Promise<string>}  The team's ID (GUID)
 */
export async function getTeamId(organization, project, teamName, pat) {
  const url = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects/${encodeURIComponent(project)}/teams?api-version=${API_VERSION}`;
  const resp = await fetch(url, {
    headers: { Authorization: authHeader(pat) },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch teams (${resp.status} ${resp.statusText})`);
  }

  const data = await resp.json();
  const teams = data.value || [];

  // Try to find team by exact name match (case-insensitive)
  const team = teams.find((t) => t.name.toLowerCase() === teamName.toLowerCase());

  if (!team) {
    throw new Error(
      `Team "${teamName}" not found in project "${project}". Available teams: ${teams.map((t) => t.name).join(', ')}`,
    );
  }

  return team.id;
}

/**
 * Resolve the current user's identity (the person who owns the PAT).
 * We hit the "me" profile endpoint:
 *   GET https://vssps.dev.azure.com/{org}/_apis/profile/profiles/me?api-version=7.1-preview.1
 *
 * Falls back to the connectionData endpoint if profile doesn't give us what we need.
 *
 * @param {string} organization
 * @param {string} pat
 * @returns {Promise<{id:string, displayName:string, uniqueName:string}>}
 */
export async function getMyIdentity(organization, pat) {
  // Primary: connection data gives us authenticatedUser reliably
  const url = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/connectionData`;
  const resp = await fetch(url, {
    headers: { Authorization: authHeader(pat) },
  });

  if (!resp.ok) {
    throw new Error(`Failed to resolve identity (${resp.status} ${resp.statusText})`);
  }

  const data = await resp.json();
  const user = data.authenticatedUser;
  return {
    id: user.id, // GUID
    displayName: user.providerDisplayName || user.customDisplayName || '',
    uniqueName: user.properties?.Account?.$value || '',
  };
}

/**
 * Fetch all active pull requests for a project where the specified team is a reviewer.
 * Filters PRs to show only those where the team is set as required or optional reviewer.
 *
 * Endpoint:
 *   GET https://dev.azure.com/{org}/{project}/_apis/git/pullrequests
 *       ?searchCriteria.status=active
 *       &$top=200
 *       &api-version=7.1-preview.1
 *
 * @param {{organization:string, project:string, team:string, pat:string}} config
 * @returns {Promise<{prs:Array, teamId:string}>}  filtered PRs and the resolved team ID
 */
export async function fetchActivePullRequests(config) {
  const { organization, project, team, pat } = config;

  // First, resolve the team name to its ID
  const teamId = await getTeamId(organization, project, team, pat);
  logger.info(`Resolved team "${team}" to ID: ${teamId}`);

  const baseUrl =
    `https://dev.azure.com/${encodeURIComponent(organization)}` +
    `/${encodeURIComponent(project)}` +
    `/_apis/git/pullrequests`;

  // Fetch active PRs (change to 'all' temporarily for debugging if needed)
  const params = new URLSearchParams({
    'searchCriteria.status': 'active',
    $top: String(MAX_PRS),
    'api-version': API_VERSION,
  });

  const resp = await fetch(`${baseUrl}?${params}`, {
    headers: { Authorization: authHeader(pat) },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Azure DevOps API error ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  const allPrs = data.value || [];

  // Filter PRs where the team is a reviewer (required or optional)
  const filteredPrs = allPrs.filter((pr) => {
    const reviewers = pr.reviewers || [];
    return reviewers.some((reviewer) => {
      // Check if this reviewer is the team we're looking for
      // Teams in reviewers list have an 'id' field that matches the team ID
      return reviewer.id && reviewer.id.toLowerCase() === teamId.toLowerCase();
    });
  });

  logger.info(`Found ${filteredPrs.length} PRs (out of ${allPrs.length} total) where team "${team}" is a reviewer`);

  return { prs: filteredPrs, teamId };
}

/**
 * Pobiera PR-y stworzone przez aktualnego użytkownika (active + draft).
 *
 * Endpoint:
 *   GET https://dev.azure.com/{org}/{project}/_apis/git/pullrequests
 *       ?searchCriteria.creatorId={userId}
 *       &searchCriteria.status=active
 *       &$top=200
 *
 * @param {string} organization
 * @param {string} project
 * @param {string} creatorId – GUID of the current user
 * @param {string} pat
 * @returns {Promise<Array>}  PRs created by the user (active, including drafts)
 */
export async function fetchMyPullRequests(organization, project, creatorId, pat) {
  const baseUrl =
    `https://dev.azure.com/${encodeURIComponent(organization)}` +
    `/${encodeURIComponent(project)}` +
    `/_apis/git/pullrequests`;

  const params = new URLSearchParams({
    'searchCriteria.creatorId': creatorId,
    'searchCriteria.status': 'active',
    $top: String(MAX_PRS),
    'api-version': API_VERSION,
  });

  const resp = await fetch(`${baseUrl}?${params}`, {
    headers: { Authorization: authHeader(pat) },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Azure DevOps API error (my PRs) ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  return data.value || [];
}

/**
 * Fetch work item IDs linked to a specific pull request.
 *
 * Endpoint:
 *   GET https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}/workitems
 *
 * @param {string} organization
 * @param {string} project
 * @param {string} repositoryId
 * @param {number} pullRequestId
 * @param {string} pat
 * @returns {Promise<number[]>}  Array of work item IDs
 */
export async function fetchWorkItemIdsForPr(organization, project, repositoryId, pullRequestId, pat) {
  const url =
    `https://dev.azure.com/${encodeURIComponent(organization)}` +
    `/${encodeURIComponent(project)}` +
    `/_apis/git/repositories/${encodeURIComponent(repositoryId)}` +
    `/pullRequests/${pullRequestId}/workitems` +
    `?api-version=${API_VERSION}`;

  const resp = await fetch(url, {
    headers: { Authorization: authHeader(pat) },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch work items for PR ${pullRequestId} (${resp.status} ${resp.statusText})`);
  }

  const data = await resp.json();
  const refs = data.value || [];

  // Each ref has a "url" like https://dev.azure.com/…/_apis/wit/workItems/{id}
  return refs.map((ref) => {
    const match = ref.url?.match(/workItems\/(\d+)/i);
    return match ? Number(match[1]) : null;
  }).filter((id) => id != null);
}

/**
 * Fetch work item details in batch (up to 200 per call).
 *
 * Endpoint:
 *   POST https://dev.azure.com/{org}/{project}/_apis/wit/workitemsbatch
 *
 * @param {string} organization
 * @param {string} project
 * @param {number[]} ids
 * @param {string} pat
 * @returns {Promise<Array>}  Array of work item objects from the API
 */
export async function fetchWorkItemsBatch(organization, project, ids, pat) {
  if (ids.length === 0) return [];

  const results = [];
  // Process in batches
  for (let i = 0; i < ids.length; i += WORK_ITEM_BATCH_SIZE) {
    const batch = ids.slice(i, i + WORK_ITEM_BATCH_SIZE);
    const url =
      `https://dev.azure.com/${encodeURIComponent(organization)}` +
      `/${encodeURIComponent(project)}` +
      `/_apis/wit/workitemsbatch?api-version=${API_VERSION}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader(pat),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ids: batch,
        fields: ['System.Id', 'System.Title', 'System.State'],
      }),
    });

    if (!resp.ok) {
      throw new Error(`Failed to fetch work item details (${resp.status} ${resp.statusText})`);
    }

    const data = await resp.json();
    results.push(...(data.value || []));
  }

  return results;
}

/**
 * Fetch the current iteration (sprint) for a team.
 *
 * Endpoint:
 *   GET https://dev.azure.com/{org}/{project}/{team}/_apis/work/teamsettings/iterations?$timeframe=current
 *
 * @param {string} organization
 * @param {string} project
 * @param {string} teamName
 * @param {string} pat
 * @returns {Promise<{name:string, path:string, url:string}|null>}  Current sprint or null
 */
export async function fetchCurrentSprint(organization, project, teamName, pat) {
  const url =
    `https://dev.azure.com/${encodeURIComponent(organization)}` +
    `/${encodeURIComponent(project)}/${encodeURIComponent(teamName)}` +
    `/_apis/work/teamsettings/iterations?$timeframe=current&api-version=${API_VERSION}`;

  const resp = await fetch(url, {
    headers: { Authorization: authHeader(pat) },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch current sprint (${resp.status} ${resp.statusText})`);
  }

  const data = await resp.json();
  const iterations = data.value || [];
  if (iterations.length === 0) return null;

  const iter = iterations[0];
  const sprintUrl =
    `https://dev.azure.com/${encodeURIComponent(organization)}` +
    `/${encodeURIComponent(project)}/_sprints/taskboard/${encodeURIComponent(teamName)}` +
    `/${encodeURIComponent(iter.name)}`;

  return {
    name: iter.name,
    path: iter.path,
    url: sprintUrl,
  };
}

/**
 * Execute a WIQL (Work Item Query Language) query and return matching work item IDs.
 *
 * Endpoint:
 *   POST https://dev.azure.com/{org}/{project}/_apis/wit/wiql
 *
 * @param {string} organization
 * @param {string} project
 * @param {string} wiql
 * @param {string} pat
 * @returns {Promise<number[]>}  Array of work item IDs
 */
export async function runWiqlQuery(organization, project, wiql, pat) {
  const url =
    `https://dev.azure.com/${encodeURIComponent(organization)}` +
    `/${encodeURIComponent(project)}` +
    `/_apis/wit/wiql?api-version=${API_VERSION_WIQL}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(pat),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: wiql }),
  });

  if (!resp.ok) {
    throw new Error(`WIQL query failed (${resp.status} ${resp.statusText})`);
  }

  const data = await resp.json();
  return (data.workItems || []).map((wi) => wi.id);
}
