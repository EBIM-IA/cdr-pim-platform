import { integer, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';
export const ecommerceDescriptions = pgTable(
  'ecommerce_descriptions',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    variantKey: text('variant_key').notNull(),
    version: integer('version').notNull(),
    data: jsonb('data').notNull(),
  },
  (table) => [primaryKey({ columns: [table.productId, table.variantKey] })],
);
