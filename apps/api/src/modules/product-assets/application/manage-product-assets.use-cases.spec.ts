import { describe, expect, it, vi } from 'vitest';
import { FixedClock, assertUuid } from '@cdr/shared';

import { Product } from '../../catalog/domain/entities/product';
import type { ProductRepositoryPort } from '../../catalog/domain/ports/product-repository.port';
import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import type {
  ArchiveReaderPort,
  AssetBinaryStoragePort,
  ProductAssetRepositoryPort,
} from '../domain/ports/product-asset-repository.port';
import {
  ProcessProductAssetArchiveUseCase,
  UploadProductAssetUseCase,
} from './manage-product-assets.use-cases';

const now = new Date('2026-10-07T10:00:00.000Z');
const product = Product.create({
  id: assertUuid('10000000-0000-4000-8000-000000000009'),
  sku: '6205-2RS1',
  name: 'Rodamiento 6205',
  now,
});
const actor: AuthenticatedActor = { id: 'buyer-1', email: 'buyer@example.test', roles: [] };

describe('UploadProductAssetUseCase', () => {
  it('deletes the newly stored object when the metadata+audit transaction fails', async () => {
    const deleted: string[] = [];
    const storage = storageFake(deleted);
    const repository = repositoryFake();
    repository.saveReplacing = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const useCase = new UploadProductAssetUseCase(
      productRepositoryFake(),
      repository,
      storage,
      new FixedClock(now),
    );

    await expect(
      useCase.execute(
        {
          selector: { productId: product.id },
          type: 'FT',
          filename: '6205-2RS1__FT.pdf',
          declaredMimeType: 'application/pdf',
          content: new TextEncoder().encode('%PDF-1.7\ncontent'),
        },
        actor,
      ),
    ).rejects.toThrow('database unavailable');

    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toMatch(/^stored\/products\/.+\/documents\/.+\.pdf$/);
  });

  it('supplies the metadata transaction with a field-level audit event', async () => {
    const repository = repositoryFake();
    repository.saveReplacing = vi.fn(async (asset, _actorId, _time, audit) => {
      const event = audit(asset, null);
      expect(event.resourceType).toBe('product_asset');
      expect(event.action).toBe('created');
      expect(event.changes.filename?.after).toBe('6205-2RS1__FT.pdf');
      return { saved: asset, replaced: null };
    });
    const useCase = new UploadProductAssetUseCase(
      productRepositoryFake(),
      repository,
      storageFake([]),
      new FixedClock(now),
    );

    await expect(
      useCase.execute(
        {
          selector: { sku: product.sku },
          type: 'FT',
          filename: '6205-2RS1__FT.pdf',
          declaredMimeType: 'application/pdf',
          content: new TextEncoder().encode('%PDF-1.7\ncontent'),
        },
        actor,
      ),
    ).resolves.toBeInstanceOf(Object);
  });

  it('rejects an archive filename containing a path before reading ZIP bytes', async () => {
    const archiveReader: ArchiveReaderPort = { read: vi.fn(() => []) };
    const repository = repositoryFake();
    const uploader = new UploadProductAssetUseCase(
      productRepositoryFake(),
      repository,
      storageFake([]),
      new FixedClock(now),
    );
    const useCase = new ProcessProductAssetArchiveUseCase(
      archiveReader,
      productRepositoryFake(),
      repository,
      uploader,
    );

    await expect(
      useCase.execute({
        archiveName: '../documentos.zip',
        content: new Uint8Array([1]),
        mode: 'validate',
        actor,
      }),
    ).rejects.toThrow(/\.zip file/);
    expect(archiveReader.read).not.toHaveBeenCalled();
  });

  it('bounds manifiesto.csv before parsing its rows', async () => {
    const archiveReader: ArchiveReaderPort = {
      read: () => [
        {
          path: 'manifiesto.csv',
          content: new Uint8Array(1024 * 1024 + 1),
        },
      ],
    };
    const repository = repositoryFake();
    const uploader = new UploadProductAssetUseCase(
      productRepositoryFake(),
      repository,
      storageFake([]),
      new FixedClock(now),
    );
    const useCase = new ProcessProductAssetArchiveUseCase(
      archiveReader,
      productRepositoryFake(),
      repository,
      uploader,
    );

    await expect(
      useCase.execute({
        archiveName: 'documentos.zip',
        content: new Uint8Array([1]),
        mode: 'validate',
        actor,
      }),
    ).rejects.toThrow(/1 MB safety limit/);
  });
});

function productRepositoryFake(): ProductRepositoryPort {
  return {
    findById: async (id) => (id === product.id ? product : null),
    findBySku: async (sku) => (sku.toUpperCase() === product.sku ? product : null),
    save: async () => undefined,
    list: async () => ({ items: [product], total: 1 }),
  };
}

function repositoryFake(): ProductAssetRepositoryPort {
  return {
    listByProductId: async () => [],
    findById: async () => null,
    findActiveSlot: async () => null,
    nextPhotoPosition: async () => 1,
    saveReplacing: async (asset, _actorId, _time, audit) => {
      audit(asset, null);
      return { saved: asset, replaced: null };
    },
    softDelete: async () => null,
  };
}

function storageFake(deleted: string[]): AssetBinaryStoragePort {
  return {
    put: async (input) => ({
      key: `stored/${input.key}`,
      bucket: 'memory',
      mimeType: input.mimeType,
      size: input.content.byteLength,
      checksum: 'checksum',
    }),
    get: async () => new Uint8Array(),
    delete: async (key) => {
      deleted.push(key);
    },
  };
}
