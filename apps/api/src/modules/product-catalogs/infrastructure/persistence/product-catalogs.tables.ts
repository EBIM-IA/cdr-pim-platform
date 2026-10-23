import { sql } from 'drizzle-orm';
import {
  bigserial,
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { CatalogActor, CatalogShareTerm } from '../../domain/entities/product-catalog';
export const productCatalogs = pgTable(
  'product_catalogs',
  {
    id: uuid('id').primaryKey(),
    sequenceNumber: bigserial('sequence_number', { mode: 'number' }).notNull(),
    code: text('code')
      .notNull()
      .generatedAlwaysAs(
        sql`'CAT-' || lpad(sequence_number::text, GREATEST(4, length(sequence_number::text)), '0')`,
      ),
    title: text('title').notNull(),
    description: text('description').notNull(),
    validFrom: date('valid_from').notNull(),
    validUntil: date('valid_until'),
    fileName: text('file_name').notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    objectKey: text('object_key').notNull(),
    createdBy: jsonb('created_by').$type<CatalogActor>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedBy: jsonb('updated_by').$type<CatalogActor>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: jsonb('deleted_by').$type<CatalogActor>(),
  },
  (t) => [
    uniqueIndex('product_catalogs_object_key_key').on(t.objectKey),
    index('product_catalogs_updated_idx').on(t.updatedAt, t.id),
  ],
);
export const productCatalogShares = pgTable(
  'product_catalog_shares',
  {
    id: uuid('id').primaryKey(),
    catalogId: uuid('catalog_id')
      .notNull()
      .references(() => productCatalogs.id),
    tokenDigest: text('token_digest').notNull(),
    term: text('term').$type<CatalogShareTerm>().notNull(),
    note: text('note').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdBy: jsonb('created_by').$type<CatalogActor>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: jsonb('revoked_by').$type<CatalogActor>(),
    views: integer('views').notNull().default(0),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('product_catalog_shares_digest_key').on(t.tokenDigest),
    index('product_catalog_shares_catalog_idx').on(t.catalogId),
  ],
);
