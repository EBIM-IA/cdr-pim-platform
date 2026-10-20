import { productAssetBatchSchema } from '@cdr/contracts';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { proxyPrivateApi } = vi.hoisted(() => ({ proxyPrivateApi: vi.fn() }));

vi.mock('@/lib/private-api-route', () => ({ proxyPrivateApi }));

import { GET } from './route';

const first = '45d49ee2-45df-4c62-8cd4-e072e079cb4b';
const second = '8b6e5999-8c77-4c22-86d8-503977bd76bb';

beforeEach(() => {
  vi.clearAllMocks();
  proxyPrivateApi.mockResolvedValue(NextResponse.json([]));
});

describe('product asset batch BFF route', () => {
  it('rejects an invalid product set before contacting the authenticated proxy', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3100/api/operations/assets/batch?productIds=invalid'),
    );

    expect(response.status).toBe(400);
    expect(proxyPrivateApi).not.toHaveBeenCalled();
  });

  it('deduplicates and delegates a bounded product set', async () => {
    const request = new NextRequest(
      `http://localhost:3100/api/operations/assets/batch?productIds=${first},${second},${first}`,
    );

    await GET(request);

    expect(proxyPrivateApi).toHaveBeenCalledWith({
      request,
      method: 'GET',
      path: `/assets/batch?productIds=${first}%2C${second}`,
      outputSchema: productAssetBatchSchema,
    });
  });
});
