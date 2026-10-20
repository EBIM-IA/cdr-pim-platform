import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractAssetCandidates, generateCommercialProposal } from './ai-api';

const productId = '10000000-0000-4000-8000-000000000001';
const assetId = '50000000-0000-4000-8000-000000000001';

const proposalResponse = {
  productId,
  sku: '6202-2RS',
  channel: 'b2c',
  model: 'gpt-6-luna',
  proposal: 'Propuesta para revisión humana.',
  usage: { inputTokens: 40, outputTokens: 10 },
  persisted: false,
  requiresHumanReview: true,
};

const extractionResponse = {
  assetId,
  productId,
  sku: '6202-2RS',
  filename: 'ficha.pdf',
  model: 'gpt-6-luna',
  candidates: [{ key: 'diametro', value: '25 mm', confidence: 0.91 }],
  persisted: false,
  requiresHumanReview: true,
};

afterEach(() => vi.unstubAllGlobals());

describe('AI same-origin client', () => {
  it('generates commercial copy through the BFF and validates the response', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(proposalResponse));
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;

    await expect(generateCommercialProposal(productId, {}, signal)).resolves.toEqual(
      proposalResponse,
    );
    expect(fetcher).toHaveBeenCalledWith(
      `/api/operations/ai/products/${productId}/commercial-proposal`,
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        signal,
        body: JSON.stringify({ channel: 'b2c', maxOutputTokens: 320 }),
      }),
    );
  });

  it('extracts candidates from an existing asset without uploading bytes from the browser', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(extractionResponse));
    vi.stubGlobal('fetch', fetcher);

    await expect(
      extractAssetCandidates(assetId, { expectedAttributes: ['diametro'] }),
    ).resolves.toEqual(extractionResponse);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/operations/ai/assets/${assetId}/extraction-candidates`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expectedAttributes: ['diametro'] }),
      }),
    );
  });

  it('rejects invalid identifiers and inputs before making a network request', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);

    await expect(generateCommercialProposal('not-a-uuid')).rejects.toMatchObject({ status: 400 });
    await expect(
      extractAssetCandidates(assetId, {
        expectedAttributes: ['bad key / prompt'],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a successful but malformed BFF response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...proposalResponse, persisted: true })),
    );

    await expect(generateCommercialProposal(productId)).rejects.toMatchObject({ status: 502 });
  });

  it('preserves the safe BFF error message and status', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: 'Se alcanzó el límite de solicitudes.' }, { status: 429 }),
        ),
    );

    await expect(generateCommercialProposal(productId)).rejects.toMatchObject({
      message: 'Se alcanzó el límite de solicitudes.',
      status: 429,
    });
  });
});
