import type { WorkspaceDto, WorkspaceQuery } from '@cdr/contracts';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchWorkspace: vi.fn() }));
vi.mock('@/lib/workspace-api', () => api);
import { useWorkspaceData } from './use-workspace-data';

const workspace: WorkspaceDto = {
  slug: 'integrations',
  operationalStatus: 'partial',
  generatedAt: '2026-11-16T00:00:00.000Z',
  metrics: [],
  columns: [],
  rows: [],
  totalRows: 0,
  notices: [],
  actions: [],
};
afterEach(cleanup);

describe('useWorkspaceData request context', () => {
  it('forwards every query parameter and reloads only when its values change', async () => {
    api.fetchWorkspace.mockReset().mockResolvedValue(workspace);
    const { result, rerender } = renderHook(
      ({ query }: { query: WorkspaceQuery }) => useWorkspaceData('integrations', query),
      { initialProps: { query: { axBatchId: 'AX REAL 2', page: 2, pageSize: 100 } } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.fetchWorkspace).toHaveBeenCalledWith('integrations', expect.any(AbortSignal), {
      axBatchId: 'AX REAL 2',
      page: 2,
      pageSize: 100,
    });
    rerender({ query: { pageSize: 100, page: 2, axBatchId: 'AX REAL 2' } });
    expect(api.fetchWorkspace).toHaveBeenCalledTimes(1);
    rerender({ query: { pageSize: 100, page: 3, axBatchId: 'AX REAL 2' } });
    await waitFor(() => expect(api.fetchWorkspace).toHaveBeenCalledTimes(2));
    expect(api.fetchWorkspace).toHaveBeenLastCalledWith(
      'integrations',
      expect.any(AbortSignal),
      expect.objectContaining({ page: 3 }),
    );
  });

  it('does not let a late aborted response replace the newly selected batch', async () => {
    let completeOld: ((value: WorkspaceDto) => void) | undefined;
    const newer = { ...workspace, totalRows: 7 };
    api.fetchWorkspace
      .mockReset()
      .mockImplementationOnce(
        () =>
          new Promise<WorkspaceDto>((resolve) => {
            completeOld = resolve;
          }),
      )
      .mockResolvedValue(newer);
    const { result, rerender } = renderHook(
      ({ query }: { query: WorkspaceQuery }) => useWorkspaceData('integrations', query),
      { initialProps: { query: { axBatchId: 'OLD' } } },
    );
    rerender({ query: { axBatchId: 'NEW' } });
    await waitFor(() => expect(result.current.workspace).toEqual(newer));
    await act(async () => completeOld?.(workspace));
    expect(result.current.workspace).toEqual(newer);
  });
});
