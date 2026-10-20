import { afterEach, describe, expect, it, vi } from 'vitest';

import { semanticSearch } from './search-api';

afterEach(() => vi.unstubAllGlobals());

describe('semantic search BFF client', () => {
  it('uses the authenticated same-origin route and validates the shared response', async () => {
    const response = {
      query: 'retén viton',
      model: 'fake-embedding-v1',
      dimensions: 1536,
      hits: [
        {
          productId: '11111111-1111-4111-8111-111111111111',
          sku: 'RET-25-32-4',
          name: 'Retenedor métrico de viton',
          score: 0.91,
        },
      ],
    };
    const fetcher = vi.fn().mockResolvedValue(Response.json(response));
    vi.stubGlobal('fetch', fetcher);

    await expect(semanticSearch('retén viton', 8)).resolves.toEqual(response);
    expect(fetcher).toHaveBeenCalledWith(
      '/api/operations/search/semantic?q=ret%C3%A9n+viton&limit=8',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('rejects malformed upstream data instead of rendering invented hits', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ query: '6205', model: 'fake', dimensions: 1536, hits: [{ score: 2 }] }),
        ),
    );

    await expect(semanticSearch('6205')).rejects.toMatchObject({ status: 502 });
  });
});
