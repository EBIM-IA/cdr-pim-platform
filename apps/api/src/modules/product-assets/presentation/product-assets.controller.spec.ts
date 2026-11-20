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

describe('Individual technical sheet files', () => {
  it.each(['COMPRAS', 'VENTAS', 'ADMINISTRADOR'] as const)(
    'includes historical hidden FT files in individual and batch asset lists for %s',
    async (role) => {
      const { controller, visibility } = setup();
      const actor = { id: 'reader', email: 'reader@example.test', roles: [role] };
      expect(await controller.list({ productId }, actor)).toMatchObject([
        { id: assetId, type: 'FT' },
      ]);
      expect(await controller.batchList({ productIds: [productId] }, actor)).toMatchObject([
        { productId, assets: [{ id: assetId, type: 'FT' }] },
      ]);
      expect(visibility.get).not.toHaveBeenCalled();
      expect(visibility.getMany).not.toHaveBeenCalled();
    },
  );
  it.each(['COMPRAS', 'VENTAS', 'ADMINISTRADOR'] as const)(
    'allows an authenticated individual FT download for %s even without bulk permission',
    async (role) => {
      const { controller, visibility } = setup();
      const response = { setHeader: vi.fn() } as unknown as Response;
      await expect(
        controller.download(
          assetId,
          undefined,
          {
            id: 'reader',
            email: 'reader@example.test',
            roles: [role],
            capabilities: ['catalog:read'],
          },
          response,
        ),
      ).resolves.toBeDefined();
      expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
      expect(visibility.get).not.toHaveBeenCalled();
    },
  );
});
