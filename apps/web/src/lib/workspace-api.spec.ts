import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchWorkspace, WorkspaceApiError } from './workspace-api';

function workspaceBody(slug = 'categories') {
  return {
    slug,
    operationalStatus: 'partial',
    generatedAt: '2026-10-01T18:00:00.000Z',
    metrics: [{ key: 'total', label: 'Total', value: 2, format: 'integer' }],
    columns: [{ key: 'name', label: 'Nombre', type: 'text' }],
    rows: [{ id: 'row-1', values: { name: 'Rodamientos' } }],
    totalRows: 1,
    notices: [],
    actions: [],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('workspace BFF client', () => {
  it('requests the authenticated BFF and validates its contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(workspaceBody()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWorkspace('categories')).resolves.toMatchObject({
      slug: 'categories',
      totalRows: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/workspaces/categories',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('rejects a valid workspace belonging to a different route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(workspaceBody('reports')), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(fetchWorkspace('categories')).rejects.toBeInstanceOf(WorkspaceApiError);
  });

  it('surfaces the BFF error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Workspace no disponible.' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(fetchWorkspace('categories')).rejects.toMatchObject({
      message: 'Workspace no disponible.',
      status: 503,
    });
  });
});
