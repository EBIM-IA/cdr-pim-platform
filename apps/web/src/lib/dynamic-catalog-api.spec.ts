import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchCatalogGrid, patchProductAttribute } from '@/lib/dynamic-catalog-api';

afterEach(() => vi.unstubAllGlobals());

describe('dynamic catalog browser client', () => {
  it('keeps repeated filters when requesting the data sheet', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 1, pageSize: 25, total: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchCatalogGrid({
      categoryId: '11111111-1111-4111-8111-111111111111',
      page: 1,
      pageSize: 25,
      filter: ['material:contains:acero', 'diametro:eq:20'],
    });

    const [rawUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(rawUrl, 'http://localhost');
    expect(url.searchParams.getAll('filter')).toEqual([
      'material:contains:acero',
      'diametro:eq:20',
    ]);
  });

  it('preserves a 409 so the UI can recover from an edit conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'El atributo fue modificado.' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const request = patchProductAttribute('11111111-1111-4111-8111-111111111111', 'material', {
      value: 'Acero',
      expectedVersion: 2,
    });

    await expect(request).rejects.toMatchObject({
      name: 'DynamicCatalogApiError',
      status: 409,
      message: 'El atributo fue modificado.',
    });
  });
});
