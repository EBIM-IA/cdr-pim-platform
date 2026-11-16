import { describe, expect, it, vi } from 'vitest';
import { assertUuid } from '@cdr/shared';
import type { Response } from 'express';
import { ProductAsset } from '../domain/entities/product-asset';
import { ProductAssetsController } from './product-assets.controller';

const productId = assertUuid('10000000-0000-4000-8000-000000000001');
const assetId = assertUuid('10000000-0000-4000-8000-000000000002');
const asset = ProductAsset.create({
  id: assetId,
  productId,
  sku: 'DOC-1',
  type: 'FT',
  filename: 'ficha.pdf',
  objectKey: 'private/ficha.pdf',
  bucket: 'private',
  mimeType: 'application/pdf',
  size: 4,
  checksum: 'test',
  position: null,
  source: 'manual',
  uploadedBy: 'admin',
  uploadedAt: new Date(),
});

function setup() {
  const list = { execute: vi.fn().mockResolvedValue([asset]) };
  const batch = { execute: vi.fn().mockResolvedValue([{ productId, assets: [asset] }]) };
  const download = {
    execute: vi.fn().mockResolvedValue({ asset, content: new Uint8Array([1, 2, 3, 4]) }),
  };
  const visibility = {
    get: vi.fn().mockResolvedValue({ productId, visible: false, version: 1 }),
    getMany: vi.fn().mockResolvedValue([{ productId, visible: false, version: 1 }]),
  };
  const controller = new ProductAssetsController(
    ...([list, batch, {}, download, {}, {}, {}, visibility] as unknown as ConstructorParameters<
      typeof ProductAssetsController
    >),
  );
  return { controller, visibility };
}

describe('Hidden technical sheet files', () => {
  it('removes hidden FT documents from single and batch consultation lists', async () => {
    const { controller } = setup();
    const actor = { id: 'sales', email: 'sales@example.test', roles: ['VENTAS'] as const };
    expect(await controller.list({ productId }, actor)).toEqual([]);
    expect(await controller.batchList({ productIds: [productId] }, actor)).toEqual([
      { productId, assets: [] },
    ]);
  });
  it('rejects direct download URLs for consultation profiles while keeping administrator access', async () => {
    const { controller } = setup();
    const response = { setHeader: vi.fn() } as unknown as Response;
    await expect(
      controller.download(
        assetId,
        undefined,
        { id: 'sales', email: 'sales@example.test', roles: ['VENTAS'] },
        response,
      ),
    ).rejects.toThrow('not found');
    expect(response.setHeader).not.toHaveBeenCalled();
    await expect(
      controller.download(
        assetId,
        undefined,
        { id: 'admin', email: 'admin@example.test', roles: ['ADMINISTRADOR'] },
        response,
      ),
    ).resolves.toBeDefined();
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
  });
});
