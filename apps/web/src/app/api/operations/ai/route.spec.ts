import {
  aiCommercialProposalRequestSchema,
  aiCommercialProposalResponseSchema,
  aiExtractionCandidatesRequestSchema,
  aiExtractionCandidatesResponseSchema,
} from '@cdr/contracts';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_UPSTREAM_TIMEOUT_MS } from '@/lib/http-security';

const { proxyPrivateApi } = vi.hoisted(() => ({ proxyPrivateApi: vi.fn() }));

vi.mock('@/lib/private-api-route', () => ({ proxyPrivateApi }));

import { POST as extractCandidates } from './assets/[assetId]/extraction-candidates/route';
import { POST as generateProposal } from './products/[productId]/commercial-proposal/route';

const productId = '10000000-0000-4000-8000-000000000001';
const assetId = '50000000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  proxyPrivateApi.mockResolvedValue(NextResponse.json({ ok: true }));
});

describe('AI BFF routes', () => {
  it('rejects invalid path identifiers before contacting the private proxy', async () => {
    const request = new NextRequest(
      'http://localhost:3100/api/operations/ai/products/no/commercial-proposal',
      { method: 'POST', body: '{}' },
    );

    const response = await generateProposal(request, {
      params: Promise.resolve({ productId: 'no' }),
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toContain('private');
    expect(proxyPrivateApi).not.toHaveBeenCalled();
  });

  it('proxies commercial proposals through the validated, finite-timeout boundary', async () => {
    const request = new NextRequest(
      `http://localhost:3100/api/operations/ai/products/${productId}/commercial-proposal`,
      { method: 'POST', headers: { origin: 'http://localhost:3100' }, body: '{}' },
    );

    await generateProposal(request, { params: Promise.resolve({ productId }) });

    expect(proxyPrivateApi).toHaveBeenCalledWith({
      request,
      method: 'POST',
      path: `/ai/products/${productId}/commercial-proposal`,
      inputSchema: aiCommercialProposalRequestSchema,
      outputSchema: aiCommercialProposalResponseSchema,
      timeoutMs: AI_UPSTREAM_TIMEOUT_MS,
    });
  });

  it('proxies extraction by asset id without accepting browser file bytes', async () => {
    const request = new NextRequest(
      `http://localhost:3100/api/operations/ai/assets/${assetId}/extraction-candidates`,
      { method: 'POST', headers: { origin: 'http://localhost:3100' }, body: '{}' },
    );

    await extractCandidates(request, { params: Promise.resolve({ assetId }) });

    expect(proxyPrivateApi).toHaveBeenCalledWith({
      request,
      method: 'POST',
      path: `/ai/assets/${assetId}/extraction-candidates`,
      inputSchema: aiExtractionCandidatesRequestSchema,
      outputSchema: aiExtractionCandidatesResponseSchema,
      timeoutMs: AI_UPSTREAM_TIMEOUT_MS,
    });
  });

  it('returns the proxy error response unchanged', async () => {
    proxyPrivateApi.mockResolvedValueOnce(
      NextResponse.json({ message: 'Origen de solicitud no permitido.' }, { status: 403 }),
    );
    const request = new NextRequest(
      `http://localhost:3100/api/operations/ai/assets/${assetId}/extraction-candidates`,
      { method: 'POST', headers: { origin: 'https://attacker.example' }, body: '{}' },
    );

    const response = await extractCandidates(request, {
      params: Promise.resolve({ assetId }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Origen de solicitud no permitido.',
    });
  });
});
