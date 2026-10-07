import type { ProductAssetType } from '@cdr/contracts';
import type { Uuid } from '@cdr/shared';

import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
import type { ProductAsset } from '../entities/product-asset';

export interface AssetSlot {
  readonly productId: Uuid;
  readonly type: ProductAssetType;
  readonly position: number | null;
}

export interface ProductAssetRepositoryPort {
  listByProductId(productId: Uuid): Promise<ProductAsset[]>;
  findById(id: Uuid): Promise<ProductAsset | null>;
  findActiveSlot(slot: AssetSlot): Promise<ProductAsset | null>;
  nextPhotoPosition(productId: Uuid): Promise<number>;
  /** Atomically retires the current slot (if any) and stores its replacement. */
  saveReplacing(
    asset: ProductAsset,
    actorId: string,
    now: Date,
    audit: (saved: ProductAsset, replaced: ProductAsset | null) => AuditEntry,
  ): Promise<{ saved: ProductAsset; replaced: ProductAsset | null }>;
  softDelete(
    id: Uuid,
    actorId: string,
    now: Date,
    audit: (deleted: ProductAsset) => AuditEntry,
  ): Promise<ProductAsset | null>;
}

export const PRODUCT_ASSET_REPOSITORY = Symbol('ProductAssetRepositoryPort');

export interface ArchiveEntry {
  readonly path: string;
  readonly content: Uint8Array;
}

export interface ArchiveReaderPort {
  read(content: Uint8Array): ArchiveEntry[];
}

export const ARCHIVE_READER = Symbol('ArchiveReaderPort');

export interface StoredAssetBinary {
  readonly key: string;
  readonly bucket: string;
  readonly mimeType: string;
  readonly size: number;
  readonly checksum: string;
  readonly versionId?: string;
}

export interface AssetBinaryStoragePort {
  put(input: {
    readonly key: string;
    readonly content: Uint8Array;
    readonly mimeType: string;
    readonly metadata: Readonly<Record<string, string>>;
  }): Promise<StoredAssetBinary>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

export const ASSET_BINARY_STORAGE = Symbol('AssetBinaryStoragePort');
