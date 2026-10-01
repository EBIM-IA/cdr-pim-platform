import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClient, ApiClientError } from './api-client';

const client = new ApiClient({ baseUrl: 'http://api.test', correlationId: 'corr-1' });

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({ status, json: async () => body } as Response);
}

afterEach(() => vi.unstubAllGlobals());

describe('ApiClient', () => {
  it('sends the correlation id so a request can be traced end to end', async () => {
    const fetchMock = mockFetch(200, {
      status: 'ok',
      service: 'cdr-pim-api',
      version: '0.1.0',
      uptimeSeconds: 12,
    });
    vi.stubGlobal('fetch', fetchMock);

    await client.health();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/health/live');
    expect((init.headers as Record<string, string>)['x-correlation-id']).toBe('corr-1');
  });

  it('turns the API error envelope into a typed error', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(404, {
        error: {
          code: 'NOT_FOUND',
          message: 'Product not found',
          correlationId: 'corr-9',
          timestamp: '2026-08-30T12:00:00.000Z',
          path: '/api/v1/products/x',
        },
      }),
    );

    await expect(client.getProduct('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 404,
      code: 'NOT_FOUND',
      correlationId: 'corr-9',
    });
  });

  it('rejects a 200 whose body does not match the shared contract', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { status: 'ok' }));

    await expect(client.health()).rejects.toBeInstanceOf(ApiClientError);
    await expect(client.health()).rejects.toThrow(/does not match the shared contract/);
  });

  it('treats a 503 readiness response as data, not as a failure', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(503, { status: 'down', checks: [{ name: 'database', status: 'down' }] }),
    );

    await expect(client.readiness()).resolves.toMatchObject({ status: 'down' });
  });

  it('serializes supported catalog filters', async () => {
    const fetchMock = mockFetch(200, {
      items: [],
      page: 2,
      pageSize: 25,
      total: 0,
    });
    vi.stubGlobal('fetch', fetchMock);

    await client.listProducts(2, 25, {
      q: 'rodamiento',
      brand: 'FAG',
      status: 'in_review',
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://api.test/api/v1/products?page=2&pageSize=25&q=rodamiento&brand=FAG&status=in_review',
    );
  });
});
