/**
 * workItemService.js
 * ──────────────────
 * Fetches and maps Azure DevOps work items linked to pull requests.
 * Includes an in-memory cache keyed by work item ID to avoid redundant API calls.
 *
 * @typedef {{ id: number, title: string, state: string, url: string }} PrWorkItem
 */

import { logger } from '../core/logger.js';
import { fetchWorkItemIdsForPr, fetchWorkItemsBatch } from './azureDevopsClient.js';

/** @type {Map<number, PrWorkItem>} */
const _cache = new Map();

/**
 * Map a raw Azure DevOps work item API response object to PrWorkItem.
 * @param {object} wi - Raw work item from the API
 * @param {string} organization
 * @param {string} project
 * @returns {PrWorkItem}
 */
export function mapWorkItemToModel(wi, organization, project) {
  const fields = wi.fields || {};
  const id = fields['System.Id'] ?? wi.id;
  return {
    id,
    title: fields['System.Title'] || '(Untitled)',
    state: fields['System.State'] || 'Unknown',
    url:
      `https://dev.azure.com/${encodeURIComponent(organization)}` +
      `/${encodeURIComponent(project)}/_workitems/edit/${id}`,
  };
}

/**
 * Fetch work items linked to a pull request, using batch API + cache.
 *
 * @param {object} opts
 * @param {string} opts.organization
 * @param {string} opts.project
 * @param {string} opts.repositoryId
 * @param {number} opts.pullRequestId
 * @param {string} opts.pat
 * @returns {Promise<PrWorkItem[]>}
 */
export async function getWorkItemsForPr({ organization, project, repositoryId, pullRequestId, pat }) {
  // 1. Get linked work item IDs
  const ids = await fetchWorkItemIdsForPr(organization, project, repositoryId, pullRequestId, pat);
  if (ids.length === 0) return [];

  // 2. Separate cached vs uncached
  const cached = [];
  const uncachedIds = [];
  for (const id of ids) {
    if (_cache.has(id)) {
      cached.push(_cache.get(id));
    } else {
      uncachedIds.push(id);
    }
  }

  // 3. Fetch uncached in batch
  if (uncachedIds.length > 0) {
    const rawItems = await fetchWorkItemsBatch(organization, project, uncachedIds, pat);
    for (const wi of rawItems) {
      const mapped = mapWorkItemToModel(wi, organization, project);
      _cache.set(mapped.id, mapped);
      cached.push(mapped);
    }
  }

  // 4. Return in original ID order
  return ids.map((id) => _cache.get(id)).filter(Boolean);
}

/**
 * Clear the in-memory work item cache (e.g. on full refresh).
 */
export function clearWorkItemCache() {
  _cache.clear();
}
