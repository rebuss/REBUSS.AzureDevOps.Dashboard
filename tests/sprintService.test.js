import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../core/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock azureDevopsClient
vi.mock('../services/azureDevopsClient.js', () => ({
  fetchCurrentSprint: vi.fn(),
  runWiqlQuery: vi.fn(),
  fetchWorkItemsBatch: vi.fn(),
}));

import { mapToActiveTask, buildActiveTasksWiql, getFooterData } from '../services/sprintService.js';
import { fetchCurrentSprint, runWiqlQuery, fetchWorkItemsBatch } from '../services/azureDevopsClient.js';

/* ── mapToActiveTask ── */

describe('mapToActiveTask', () => {
  it('maps a work item to MyActiveTask', () => {
    const wi = {
      id: 555,
      fields: {
        'System.Id': 555,
        'System.Title': 'Implement login',
        'System.State': 'Active',
      },
    };
    const result = mapToActiveTask(wi, 'myorg', 'MyProject');
    expect(result).toEqual({
      id: 555,
      title: 'Implement login',
      url: 'https://dev.azure.com/myorg/MyProject/_workitems/edit/555',
    });
  });

  it('falls back to wi.id when System.Id is missing', () => {
    const wi = { id: 42, fields: { 'System.Title': 'X' } };
    const result = mapToActiveTask(wi, 'org', 'proj');
    expect(result.id).toBe(42);
  });

  it('uses (Untitled) when title is missing', () => {
    const wi = { id: 1, fields: {} };
    const result = mapToActiveTask(wi, 'org', 'proj');
    expect(result.title).toBe('(Untitled)');
  });
});

/* ── buildActiveTasksWiql ── */

describe('buildActiveTasksWiql', () => {
  it('builds a WIQL query with the user display name', () => {
    const wiql = buildActiveTasksWiql('John Doe');
    expect(wiql).toContain("[System.AssignedTo] = 'John Doe'");
    expect(wiql).toContain("[System.State] = 'Active'");
  });

  it('escapes single quotes in display name', () => {
    const wiql = buildActiveTasksWiql("O'Brien");
    expect(wiql).toContain("[System.AssignedTo] = 'O''Brien'");
  });
});

/* ── getFooterData ── */

describe('getFooterData', () => {
  const baseOpts = {
    organization: 'myorg',
    project: 'MyProject',
    sprintTeam: 'TeamAlpha',
    userDisplayName: 'John Doe',
    pat: 'fake-pat',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns sprint and active tasks when both are available', async () => {
    fetchCurrentSprint.mockResolvedValue({
      name: 'Sprint 5',
      path: '\\MyProject\\Sprint 5',
      url: 'https://dev.azure.com/myorg/MyProject/_sprints/taskboard/TeamAlpha/Sprint%205',
    });
    runWiqlQuery.mockResolvedValue([100, 200]);
    fetchWorkItemsBatch.mockResolvedValue([
      { id: 100, fields: { 'System.Id': 100, 'System.Title': 'Task A', 'System.State': 'Active' } },
      { id: 200, fields: { 'System.Id': 200, 'System.Title': 'Task B', 'System.State': 'Active' } },
    ]);

    const result = await getFooterData(baseOpts);
    expect(result.sprint).toEqual({
      name: 'Sprint 5',
      path: '\\MyProject\\Sprint 5',
      url: 'https://dev.azure.com/myorg/MyProject/_sprints/taskboard/TeamAlpha/Sprint%205',
    });
    expect(result.activeTasks).toHaveLength(2);
    expect(result.activeTasks[0].id).toBe(100);
  });

  it('returns null sprint when sprintTeam is empty', async () => {
    runWiqlQuery.mockResolvedValue([]);

    const result = await getFooterData({ ...baseOpts, sprintTeam: '' });
    expect(result.sprint).toBeNull();
    expect(fetchCurrentSprint).not.toHaveBeenCalled();
  });

  it('returns empty activeTasks when user has none', async () => {
    fetchCurrentSprint.mockResolvedValue({ name: 'S1', path: '', url: '' });
    runWiqlQuery.mockResolvedValue([]);

    const result = await getFooterData(baseOpts);
    expect(result.activeTasks).toEqual([]);
    expect(fetchWorkItemsBatch).not.toHaveBeenCalled();
  });

  it('handles sprint fetch failure gracefully', async () => {
    fetchCurrentSprint.mockRejectedValue(new Error('network error'));
    runWiqlQuery.mockResolvedValue([]);

    const result = await getFooterData(baseOpts);
    expect(result.sprint).toBeNull();
    expect(result.activeTasks).toEqual([]);
  });

  it('handles active tasks fetch failure gracefully', async () => {
    fetchCurrentSprint.mockResolvedValue({ name: 'S1', path: '', url: '' });
    runWiqlQuery.mockRejectedValue(new Error('wiql error'));

    const result = await getFooterData(baseOpts);
    expect(result.sprint).not.toBeNull();
    expect(result.activeTasks).toEqual([]);
  });
});
