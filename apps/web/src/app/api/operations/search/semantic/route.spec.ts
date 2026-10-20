import { semanticSearchResponseSchema } from '@cdr/contracts';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { proxyPrivateApi } = vi.hoisted(() => ({ proxyPrivateApi: vi.fn() }));

vi.mock('@/lib/private-api-route', () => ({ proxyPrivateApi }));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  proxyPrivateApi.mockResolvedValue(NextResponse.json({ ok: true }));
});

describe('semantic search BFF route', () => {
  it('rejects an invalid query before contacting the authenticated upstream proxy', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3100/api/operations/search/semantic?q=x&limit=20'),
    );

    expect(response.status).toBe(400);
    expect(proxyPrivateApi).not.toHaveBeenCalled();
  });

  it('delegates a validated query to the typed private API proxy', async () => {
    const request = new NextRequest(
      'http://localhost:3100/api/operations/search/semantic?q=ret%C3%A9n+viton&limit=8',
    );

    await GET(request);

    expect(proxyPrivateApi).toHaveBeenCalledWith({
      request,
      method: 'GET',
      path: '/search/semantic?q=ret%C3%A9n%20viton&limit=8',
      outputSchema: semanticSearchResponseSchema,
    });
  });
});
