import type { Uuid } from '@cdr/shared';

import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
import type { ProductAsset, ProductAssetSnapshot } from '../entities/product-asset';

export interface ImportedEcommercePhoto {
  readonly productId: Uuid;
  readonly pimSku: string;
  readonly ecommerceSku: string;
  readonly assetId: Uuid;
  readonly filename: string;
  readonly importedAt: Date;
  readonly active: boolean;
}

export interface EcommercePhotoRepositoryPort {
  findActivePhotoByChecksum(productId: Uuid, checksum: string): Promise<Uuid | null>;
  /** Locks the gallery, checks for duplicates, and appends the photo with its audit entry. */
  appendEcommercePhoto(input: {
    readonly photo: Omit<ProductAssetSnapshot, 'position' | 'kind' | 'deletedAt' | 'deletedBy'>;
    readonly ecommerceSku: string;
    readonly assertObjectAvailable: () => Promise<void>;
    readonly audit: (photo: ProductAsset) => AuditEntry;
  }): Promise<{ assetId: Uuid; inserted: boolean }>;
  listRecentEcommercePhotos(): Promise<ImportedEcommercePhoto[]>;
}

export const ECOMMERCE_PHOTO_REPOSITORY = Symbol('EcommercePhotoRepositoryPort');
