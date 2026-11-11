import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { QualityReviewDto } from '@cdr/contracts';
import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';
export const qualityReviewItems = pgTable(
  'quality_review_items',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    version: integer('version').notNull(),
    data: jsonb('data').$type<QualityReviewDto>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('quality_review_items_queue_idx').on(table.kind, table.status, table.createdAt),
    index('quality_review_items_product_idx').on(table.productId),
  ],
);
