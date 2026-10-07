import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';

export const productAssets = pgTable(
  'product_assets',
  {
    id: uuid('id').primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    typeCode: text('type_code').notNull(),
    originalFilename: text('original_filename').notNull(),
    objectKey: text('object_key').notNull(),
    bucket: text('bucket').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    checksumSha256: text('checksum_sha256').notNull(),
    storageVersionId: text('storage_version_id'),
    position: integer('position'),
    source: text('source').notNull(),
    uploadedBy: text('uploaded_by').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    replacesAssetId: uuid('replaces_asset_id'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: text('deleted_by'),
  },
  (table) => [
    uniqueIndex('product_assets_object_key_key').on(table.objectKey),
    index('product_assets_product_active_idx')
      .on(table.productId, table.uploadedAt)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex('product_assets_singleton_active_key')
      .on(table.productId, table.typeCode)
      .where(sql`${table.deletedAt} IS NULL AND ${table.typeCode} <> 'FOTO'`),
    uniqueIndex('product_assets_photo_position_active_key')
      .on(table.productId, table.position)
      .where(sql`${table.deletedAt} IS NULL AND ${table.typeCode} = 'FOTO'`),
  ],
);

export type ProductAssetRow = typeof productAssets.$inferSelect;
