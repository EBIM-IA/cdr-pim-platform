import {
  aiCommercialProposalRequestSchema,
  aiCommercialProposalResponseSchema,
} from '@cdr/contracts';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAccessToken } = vi.hoisted(() => ({ getAccessToken: vi.fn() }));

vi.mock('@/lib/env', () => ({ env: { API_BASE_URL: 'http://api.internal' } }));
vi.mock('@/lib/server-auth', () => ({ getAccessToken }));

import { proxyPrivateApi } from './private-api-route';

const productId = '10000000-0000-4000-8000-000000000001';
const proposalResponse = {
  productId,
  sku: '6202-2RS',
  channel: 'b2c',
  model: 'gpt-6-luna',
  proposal: 'Propuesta para revisión.',
  usage: { inputTokens: 20, outputTokens: 5 },
  persisted: false,
  requiresHumanReview: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  getAccessToken.mockResolvedValue('private-token');
});

afterEach(() => vi.unstubAllGlobals());

describe('private API proxy security', () => {
  it('rejects a cross-origin AI mutation before reading the session or contacting upstream', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const request = new NextRequest(
      `http://localhost:3100/api/operations/ai/products/${productId}/commercial-proposal`,
      {
        method: 'POST',
        headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
        body: '{}',
      },
    );

    const response = await proxyPrivateApi({
      request,
      method: 'POST',
      path: `/ai/products/${productId}/commercial-proposal`,
      inputSchema: aiCommercialProposalRequestSchema,
      outputSchema: aiCommercialProposalResponseSchema,
      timeoutMs: 50,
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toContain('private');
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps the token server-side, validates the response and applies the supplied timeout', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(proposalResponse));
    vi.stubGlobal('fetch', fetcher);
    const request = new NextRequest(
      `http://localhost:3100/api/operations/ai/products/${productId}/commercial-proposal`,
      {
        method: 'POST',
        headers: { origin: 'http://localhost:3100', 'content-type': 'application/json' },
        body: '{}',
      },
    );

    const response = await proxyPrivateApi({
      request,
      method: 'POST',
      path: `/ai/products/${productId}/commercial-proposal`,
      inputSchema: aiCommercialProposalRequestSchema,
      outputSchema: aiCommercialProposalResponseSchema,
      timeoutMs: 50,
    });

    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(proposalResponse);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `http://api.internal/api/v1/ai/products/${productId}/commercial-proposal`,
    );
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer private-token');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(init.signal?.aborted).toBe(true);
  });
});
