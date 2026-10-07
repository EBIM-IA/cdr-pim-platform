import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  listProductAssets,
  processProductAssetZip,
  uploadProductAsset,
} from './product-assets-api';

const asset = {
  id: '11111111-1111-4111-8111-111111111111',
  productId: '22222222-2222-4222-8222-222222222222',
  sku: '6205-2RS1',
  kind: 'document',
  type: 'FT',
  filename: '6205-2RS1__FT.pdf',
  mimeType: 'application/pdf',
  size: 100,
  checksum: 'checksum',
  position: null,
  source: 'manual',
  uploadedBy: 'user-1',
  uploadedAt: '2026-10-07T10:00:00.000Z',
  replacesAssetId: null,
};

afterEach(() => vi.unstubAllGlobals());

describe('product assets BFF client', () => {
  it('lists persisted assets by product', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([asset]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(listProductAssets({ productId: asset.productId })).resolves.toEqual([asset]);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/operations/assets?productId=${asset.productId}`,
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('uploads a file as multipart without forcing a content-type boundary', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(asset), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await uploadProductAsset({
      productId: asset.productId,
      type: 'FT',
      file: new File(['%PDF-1.7'], 'ficha.pdf', { type: 'application/pdf' }),
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toEqual({ accept: 'application/json' });
  });

  it('sends validate and commit modes for a ZIP', async () => {
    const result = {
      mode: 'validate',
      archiveName: 'documentos.zip',
      total: 0,
      valid: 0,
      errors: 0,
      affectedSkus: 0,
      items: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await processProductAssetZip(
      new File(['zip'], 'documentos.zip', { type: 'application/zip' }),
      'validate',
    );
    const form = (fetchMock.mock.calls[0]?.[1] as RequestInit).body as FormData;
    expect(form.get('mode')).toBe('validate');
  });
});
