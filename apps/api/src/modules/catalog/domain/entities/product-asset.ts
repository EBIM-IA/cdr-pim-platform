import type { Uuid } from '@cdr/shared';

/**
 * Binary assets attached to a product.
 *
 * The bytes live in S3; PostgreSQL holds only what is written here — bucket, key, mime
 * type, size, checksum and version. Storing images or datasheets as `bytea` would bloat
 * every backup and every replica for no benefit (see `DATA_ARCHITECTURE.md`).
 *
 * NOT PERSISTED YET — no `product_images` / `product_documents` tables exist. The metadata
 * shape is fixed here so the S3 key convention can be agreed before anything is uploaded.
 */
export interface StoredAssetRef {
  readonly bucket: string;
  readonly key: string;
  readonly mimeType: string;
  readonly size: number;
  /** Base64 SHA-256 of the content, for integrity and de-duplication. */
  readonly checksum: string;
  readonly versionId?: string;
}

export interface Image {
  readonly id: Uuid;
  readonly productId: Uuid;
  readonly asset: StoredAssetRef;
  readonly altText: string | null;
  /** Position 0 is the primary image shown by every sales channel. */
  readonly position: number;
  readonly uploadedAt: Date;
}

export const DocumentKind = {
  Datasheet: 'datasheet',
  Manual: 'manual',
  Certificate: 'certificate',
  Drawing: 'drawing',
  Other: 'other',
} as const;

export type DocumentKind = (typeof DocumentKind)[keyof typeof DocumentKind];

export interface Document {
  readonly id: Uuid;
  readonly productId: Uuid;
  readonly kind: DocumentKind;
  readonly title: string;
  readonly asset: StoredAssetRef;
  /** Set once a DOCUMENT_EXTRACTION job has mined the file for attributes. */
  readonly extractedAt: Date | null;
  readonly uploadedAt: Date;
}

/**
 * Canonical S3 key layout. Centralised so keys stay predictable and a lifecycle policy can
 * target a whole prefix.
 *
 *   products/{productId}/images/{assetId}.{ext}
 *   products/{productId}/documents/{assetId}.{ext}
 */
export function buildAssetKey(input: {
  productId: Uuid;
  assetId: Uuid;
  folder: 'images' | 'documents';
  extension: string;
}): string {
  const extension = input.extension.replace(/^\./, '').toLowerCase();
  return `products/${input.productId}/${input.folder}/${input.assetId}.${extension}`;
}
