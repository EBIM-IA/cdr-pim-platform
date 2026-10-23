import {
  aiCommercialProposalRequestSchema,
  aiCommercialProposalResponseSchema,
} from '@cdr/contracts';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const { getAccessToken } = vi.hoisted(() => ({ getAccessToken: vi.fn() }));

vi.mock('@/lib/env', () => ({
  env: { API_BASE_URL: 'http://api.internal', PUBLIC_APP_ORIGIN: 'http://localhost:3100' },
}));
vi.mock('@/lib/server-auth', () => ({ getAccessToken }));

import { proxyPrivateApi, proxyPrivateMultipart } from './private-api-route';

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

  it('accepts the configured public origin behind the internal bind address and keeps the token server-side', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(proposalResponse));
    vi.stubGlobal('fetch', fetcher);
    const request = new NextRequest(
      `http://0.0.0.0:3000/api/operations/ai/products/${productId}/commercial-proposal`,
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

  it('accepts a multipart upload from the configured public origin behind the internal bind address', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetcher);
    const body = new FormData();
    body.set('file', new File(['%PDF-1.7'], 'catalogo.pdf', { type: 'application/pdf' }));
    const request = new NextRequest('http://0.0.0.0:3000/api/product-catalogs', {
      method: 'POST',
      headers: { origin: 'http://localhost:3100' },
      body,
    });

    const response = await proxyPrivateMultipart({
      request,
      path: '/product-catalogs',
      outputSchema: z.object({ ok: z.literal(true) }),
      maxBytes: 1024,
    });

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://api.internal/api/v1/product-catalogs');
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer private-token');
    expect(new Headers(init.headers).get('content-type')).toContain('multipart/form-data;');
    expect(response.headers.get('cache-control')).toContain('private, no-store');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it.each([
    ['internal bind origin', 'http://0.0.0.0:3000'],
    ['another origin', 'https://attacker.example'],
    ['missing origin', null],
  ])(
    'rejects %s for JSON and multipart before accessing the session or forwarding',
    async (_label, origin) => {
      const fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (origin) headers.origin = origin;
      const jsonRequest = new NextRequest('http://0.0.0.0:3000/api/product-catalogs', {
        method: 'POST',
        headers,
        body: '{}',
      });
      const jsonResponse = await proxyPrivateApi({
        request: jsonRequest,
        method: 'POST',
        path: '/product-catalogs',
        outputSchema: z.object({ ok: z.literal(true) }),
      });
      const multipartRequest = new NextRequest('http://0.0.0.0:3000/api/product-catalogs', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'multipart/form-data; boundary=test' },
        body: '--test--',
      });
      const multipartResponse = await proxyPrivateMultipart({
        request: multipartRequest,
        path: '/product-catalogs',
        outputSchema: z.object({ ok: z.literal(true) }),
        maxBytes: 1024,
      });

      expect(jsonResponse.status).toBe(403);
      expect(multipartResponse.status).toBe(403);
      expect(jsonResponse.headers.get('cache-control')).toContain('no-store');
      expect(multipartResponse.headers.get('cache-control')).toContain('no-store');
      expect(getAccessToken).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});
