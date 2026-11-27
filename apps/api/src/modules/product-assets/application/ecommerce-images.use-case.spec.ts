import { createHash } from 'node:crypto';
import { assertUuid, FixedClock } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import { Product } from '../../catalog/domain/entities/product';
import type { ProductRepositoryPort } from '../../catalog/domain/ports/product-repository.port';
import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import { ProductAsset } from '../domain/entities/product-asset';
import {
  EcommerceImageSourceError,
  type EcommerceImage,
  type EcommerceImageSourcePort,
} from '../domain/ports/ecommerce-image-source.port';
import type { EcommercePhotoRepositoryPort } from '../domain/ports/ecommerce-photo-repository.port';
import type { AssetBinaryStoragePort } from '../domain/ports/product-asset-repository.port';
import { EcommerceImagesUseCase } from './ecommerce-images.use-case';

const now = new Date('2026-11-27T12:00:00Z');
const product = Product.create({ sku: '00577', name: 'Rodamiento', now });
const second = Product.create({ sku: 'CDR-0000003991', name: 'Otra referencia', now });
const missing = assertUuid('10000000-0000-4000-8000-000000000001');
const actor: AuthenticatedActor = { id: 'admin', email: 'admin@example.test', roles: [] };
const content = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9);
const hash = createHash('sha256').update(content);
const checksumSha256 = hash.copy().digest('hex');
const checksumBase64 = hash.digest('base64');
const image: EcommerceImage = {
  assetId: 'narviz_asset_01',
  filename: 'foto.jpg',
  checksumSha256,
  sizeBytes: content.byteLength,
  mimeType: 'image/jpeg',
  position: 2,
  cover: true,
  downloadPath: '/pim-bridge/v1/images/narviz_asset_01/download',
};
const request = {
  target: { productId: product.id, ecommerceSku: '00577a' },
  mode: 'own' as const,
  assets: [{ assetId: image.assetId, checksumSha256 }],
};

function setup() {
  const products: ProductRepositoryPort = {
    findById: async (id) => [product, second].find((value) => value.id === id) ?? null,
    findBySku: vi.fn(),
    save: vi.fn(),
    list: vi.fn(),
  };
  const source = {
    lookup: vi.fn<EcommerceImageSourcePort['lookup']>(async (sku) => ({ sku, images: [image] })),
    lookupBatch: vi.fn<EcommerceImageSourcePort['lookupBatch']>(),
    download: vi.fn<EcommerceImageSourcePort['download']>(async () => content),
    health: vi.fn<EcommerceImageSourcePort['health']>(),
  };
  const photos = {
    findActivePhotoByChecksum: vi
      .fn<EcommercePhotoRepositoryPort['findActivePhotoByChecksum']>()
      .mockResolvedValue(null),
    appendEcommercePhoto: vi.fn<EcommercePhotoRepositoryPort['appendEcommercePhoto']>(
      async ({ photo, assertObjectAvailable }) => {
        await assertObjectAvailable();
        return { inserted: true, assetId: photo.id };
      },
    ),
    listRecentEcommercePhotos: vi
      .fn<EcommercePhotoRepositoryPort['listRecentEcommercePhotos']>()
      .mockResolvedValue([]),
  };
  const storage = {
    put: vi.fn<AssetBinaryStoragePort['put']>().mockImplementation(async ({ key }) => ({
      key,
      bucket: 'gallery',
      checksum: checksumBase64,
      size: content.byteLength,
      mimeType: image.mimeType,
    })),
    exists: vi.fn<AssetBinaryStoragePort['exists']>().mockResolvedValue(true),
    get: vi.fn<AssetBinaryStoragePort['get']>(),
    delete: vi.fn<AssetBinaryStoragePort['delete']>(),
  };
  const clock = new FixedClock(now);
  return {
    useCase: new EcommerceImagesUseCase(source, products, photos, storage, clock),
    source,
    photos,
    storage,
    disabled: new EcommerceImagesUseCase(null, products, photos, storage, clock),
  };
}

describe('ecommerce image workflows', () => {
  it('reports configuration, distinguishes an empty gallery from a missing SKU, and preserves batch positions', async () => {
    const { useCase, source, disabled } = setup();
    expect(disabled.status()).toEqual({ configured: false });
    expect(useCase.status()).toEqual({ configured: true });
    expect(source.health).not.toHaveBeenCalled();
    source.lookupBatch.mockResolvedValue([
      { index: 0, sku: '00577a', data: { sku: '00577a', images: [] } },
      {
        index: 1,
        sku: second.sku,
        status: 404,
        error: { code: 'PRODUCT_NOT_FOUND', message: 'ignored', correlationId: 'provider-123' },
      },
    ]);
    const result = await useCase.lookup({
      mode: 'resolved',
      targets: [request.target, { productId: missing }, { productId: second.id }],
    });
    expect(source.lookupBatch).toHaveBeenCalledWith(['00577a', second.sku], 'resolved');
    expect(result.items).toMatchObject([
      {
        productId: product.id,
        pimSku: '00577',
        ecommerceSku: '00577a',
        status: 'found',
        images: [],
      },
      { productId: missing, status: 'error', error: { code: 'PIM_SKU_NOT_FOUND' } },
      {
        productId: second.id,
        status: 'error',
        error: { code: 'ECOMMERCE_NOT_FOUND', correlationId: 'provider-123' },
      },
    ]);
  });

  it('returns the cover first without exposing upstream download paths', async () => {
    const { useCase, source } = setup();
    source.lookup.mockResolvedValue({
      sku: '00577',
      images: [
        { ...image, position: 1, cover: false, assetId: 'first', mimeType: 'image/gif' },
        image,
      ],
    });
    const { items } = await useCase.lookup({
      targets: [{ productId: product.id }],
      mode: 'resolved',
    });
    expect(source.lookup).toHaveBeenCalledWith('00577', 'resolved');
    expect(items).toMatchObject([
      {
        images: [
          { assetId: image.assetId, canImport: true },
          { assetId: 'first', canImport: false },
        ],
      },
    ]);
    expect(JSON.stringify(items)).not.toContain('downloadPath');
  });

  it('stores a verified photo privately and records source, actor and original gallery order', async () => {
    const { useCase, source, photos, storage } = setup();
    const { items } = await useCase.importPhoto(request, actor);
    expect(items[0]).toMatchObject({ status: 'imported', filename: image.filename });
    expect(source.lookup).toHaveBeenCalledWith('00577a', 'own');
    expect(source.download).toHaveBeenCalledWith(image);
    expect(photos.findActivePhotoByChecksum).toHaveBeenCalledWith(product.id, checksumBase64);
    expect(storage.put).toHaveBeenCalledWith(
      expect.objectContaining({
        content,
        mimeType: 'image/jpeg',
        key: expect.stringMatching(/\/images\/.*\.jpg$/),
      }),
    );
    const [{ audit, photo, ecommerceSku }] = photos.appendEcommercePhoto.mock.calls[0]!;
    expect(ecommerceSku).toBe('00577a');
    expect(photo).toMatchObject({ source: 'narviz', uploadedBy: actor.id, uploadedAt: now });
    expect(audit(ProductAsset.create({ ...photo, position: 3 }))).toMatchObject({
      source: 'api:narviz',
      changes: {
        ecommerceAssetId: { after: image.assetId },
        ecommerceCover: { after: true },
        ecommercePosition: { after: 2 },
        position: { after: 3 },
      },
    });
  });

  it('refuses stale selections and avoids downloading or duplicating an existing active photo', async () => {
    const { useCase, photos, source, storage } = setup();
    await expect(
      useCase.importPhoto(
        { ...request, assets: [{ assetId: image.assetId, checksumSha256: 'a'.repeat(64) }] },
        actor,
      ),
    ).resolves.toMatchObject({
      items: [{ status: 'error', error: { code: 'ECOMMERCE_PHOTO_CHANGED' } }],
    });
    photos.findActivePhotoByChecksum.mockResolvedValue(missing);
    await expect(useCase.importPhoto(request, actor)).resolves.toMatchObject({
      items: [{ status: 'existing', productAssetId: missing }],
    });
    expect(source.download).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('returns provider correlation and does not persist a photo if its download fails verification', async () => {
    const { useCase, source, storage } = setup();
    source.download.mockRejectedValue(
      new EcommerceImageSourceError({ status: 412, correlationId: 'provider-123' }),
    );
    await expect(useCase.importPhoto(request, actor)).resolves.toMatchObject({
      items: [
        {
          status: 'error',
          error: { code: 'ECOMMERCE_PHOTO_CHANGED', correlationId: 'provider-123' },
        },
      ],
    });
    source.download.mockRejectedValue(
      new EcommerceImageSourceError({ upstreamCode: 'INVALID_DOWNLOAD' }),
    );
    await expect(useCase.importPhoto(request, actor)).resolves.toMatchObject({
      items: [{ status: 'error', error: { code: 'ECOMMERCE_DOWNLOAD_INVALID' } }],
    });
    expect(storage.put).not.toHaveBeenCalled();
  });
});
