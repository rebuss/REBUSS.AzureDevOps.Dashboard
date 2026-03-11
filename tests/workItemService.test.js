import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the logger
vi.mock('../core/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock the Azure DevOps client
vi.mock('../services/azureDevopsClient.js', () => ({
  fetchWorkItemIdsForPr: vi.fn(),
  fetchWorkItemsBatch: vi.fn(),
}));

import { mapWorkItemToModel, getWorkItemsForPr, clearWorkItemCache } from '../services/workItemService.js';
import { fetchWorkItemIdsForPr, fetchWorkItemsBatch } from '../services/azureDevopsClient.js';

/* ── mapWorkItemToModel ── */

describe('mapWorkItemToModel', () => {
  it('maps a full work item to PrWorkItem', () => {
    const wi = {
      id: 12345,
      fields: {
        'System.Id': 12345,
        'System.Title': 'Fix login bug',
        'System.State': 'In Progress',
      },
    };

    const result = mapWorkItemToModel(wi, 'myorg', 'MyProject');
    expect(result).toEqual({
      id: 12345,
      title: 'Fix login bug',
      state: 'In Progress',
      url: 'https://dev.azure.com/myorg/MyProject/_workitems/edit/12345',
    });
  });

  it('falls back to wi.id when System.Id is missing', () => {
    const wi = {
      id: 999,
      fields: {
        'System.Title': 'Some task',
        'System.State': 'Done',
      },
    };

    const result = mapWorkItemToModel(wi, 'org', 'proj');
    expect(result.id).toBe(999);
  });

  it('provides defaults for missing fields', () => {
    const wi = { id: 1, fields: {} };
    const result = mapWorkItemToModel(wi, 'org', 'proj');
    expect(result.title).toBe('(Untitled)');
    expect(result.state).toBe('Unknown');
  });

  it('encodes special characters in organization/project for URL', () => {
    const wi = {
      id: 1,
      fields: { 'System.Id': 1, 'System.Title': 'T', 'System.State': 'New' },
    };
    const result = mapWorkItemToModel(wi, 'my org', 'My Project');
    expect(result.url).toBe('https://dev.azure.com/my%20org/My%20Project/_workitems/edit/1');
  });
});

/* ── getWorkItemsForPr ── */

describe('getWorkItemsForPr', () => {
  const baseOpts = {
    organization: 'myorg',
    project: 'MyProject',
    repositoryId: 'repo-guid',
    pullRequestId: 42,
    pat: 'fake-pat',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearWorkItemCache();
  });

  it('returns empty array when PR has no linked work items', async () => {
    fetchWorkItemIdsForPr.mockResolvedValue([]);

    const result = await getWorkItemsForPr(baseOpts);
    expect(result).toEqual([]);
    expect(fetchWorkItemsBatch).not.toHaveBeenCalled();
  });

  it('fetches and maps work items', async () => {
    fetchWorkItemIdsForPr.mockResolvedValue([100, 200]);
    fetchWorkItemsBatch.mockResolvedValue([
      { id: 100, fields: { 'System.Id': 100, 'System.Title': 'Task A', 'System.State': 'Active' } },
      { id: 200, fields: { 'System.Id': 200, 'System.Title': 'Task B', 'System.State': 'Closed' } },
    ]);

    const result = await getWorkItemsForPr(baseOpts);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(100);
    expect(result[0].title).toBe('Task A');
    expect(result[1].id).toBe(200);
    expect(result[1].state).toBe('Closed');
  });

  it('preserves original ID order', async () => {
    fetchWorkItemIdsForPr.mockResolvedValue([300, 100]);
    fetchWorkItemsBatch.mockResolvedValue([
      { id: 100, fields: { 'System.Id': 100, 'System.Title': 'First fetched', 'System.State': 'New' } },
      { id: 300, fields: { 'System.Id': 300, 'System.Title': 'Second fetched', 'System.State': 'New' } },
    ]);

    const result = await getWorkItemsForPr(baseOpts);
    expect(result[0].id).toBe(300);
    expect(result[1].id).toBe(100);
  });

  it('uses cache on second call and skips batch fetch for cached items', async () => {
    fetchWorkItemIdsForPr.mockResolvedValue([100]);
    fetchWorkItemsBatch.mockResolvedValue([
      { id: 100, fields: { 'System.Id': 100, 'System.Title': 'Cached', 'System.State': 'Done' } },
    ]);

    await getWorkItemsForPr(baseOpts);
    expect(fetchWorkItemsBatch).toHaveBeenCalledTimes(1);

    // Second call – same work item ID should be cached
    fetchWorkItemIdsForPr.mockResolvedValue([100]);
    const result = await getWorkItemsForPr(baseOpts);
    // fetchWorkItemsBatch should NOT be called again (still 1 total)
    expect(fetchWorkItemsBatch).toHaveBeenCalledTimes(1);
    expect(result[0].title).toBe('Cached');
  });

  it('fetches only uncached items when mix of cached and new', async () => {
    // First call – cache item 100
    fetchWorkItemIdsForPr.mockResolvedValue([100]);
    fetchWorkItemsBatch.mockResolvedValue([
      { id: 100, fields: { 'System.Id': 100, 'System.Title': 'Old', 'System.State': 'Done' } },
    ]);
    await getWorkItemsForPr(baseOpts);

    // Second call – 100 is cached, 200 is new
    fetchWorkItemIdsForPr.mockResolvedValue([100, 200]);
    fetchWorkItemsBatch.mockResolvedValue([
      { id: 200, fields: { 'System.Id': 200, 'System.Title': 'New', 'System.State': 'Active' } },
    ]);
    const result = await getWorkItemsForPr(baseOpts);

    // Batch was called with only [200]
    expect(fetchWorkItemsBatch).toHaveBeenLastCalledWith('myorg', 'MyProject', [200], 'fake-pat');
    expect(result).toHaveLength(2);
  });

  it('clearWorkItemCache resets the cache', async () => {
    fetchWorkItemIdsForPr.mockResolvedValue([100]);
    fetchWorkItemsBatch.mockResolvedValue([
      { id: 100, fields: { 'System.Id': 100, 'System.Title': 'T', 'System.State': 'New' } },
    ]);
    await getWorkItemsForPr(baseOpts);

    clearWorkItemCache();

    // After clearing, batch fetch should be called again
    fetchWorkItemIdsForPr.mockResolvedValue([100]);
    fetchWorkItemsBatch.mockResolvedValue([
      { id: 100, fields: { 'System.Id': 100, 'System.Title': 'T', 'System.State': 'New' } },
    ]);
    await getWorkItemsForPr(baseOpts);
    expect(fetchWorkItemsBatch).toHaveBeenCalledTimes(2);
  });
});
