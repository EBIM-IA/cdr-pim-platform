import { integer, pgTable, text, timestamp, uniqueIndex, uuid, vector } from 'drizzle-orm/pg-core';

import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';

/** Embedding dimensionality baked into the `vector(N)` column by migration 0002. */
export const EMBEDDING_DIMENSIONS = 1536 as const;

export const productEmbeddings = pgTable(
  'product_embeddings',
  {
    id: uuid('id').primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    model: text('model').notNull(),
    dimensions: integer('dimensions').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    sourceHash: text('source_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('product_embeddings_product_model_key').on(table.productId, table.model),
    // The HNSW index is declared in SQL (migration 0002) because its operator class and
    // build parameters are not expressible here without losing the explicit tuning.
  ],
);

export type ProductEmbeddingRow = typeof productEmbeddings.$inferSelect;
