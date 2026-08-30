import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Drizzle description of the tables owned by the **catalog** module.
 *
 * These declarations are the typed *query* surface only. The authoritative schema is the
 * SQL in `apps/api/drizzle/` — see ADR-009. `test/integration/schema-drift.spec.ts`
 * asserts the two never diverge.
 *
 * Column names are snake_case (database convention); the TypeScript keys are camelCase.
 */
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey(),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    brand: text('brand'),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('products_sku_key').on(table.sku),
    index('products_status_idx').on(table.status),
  ],
);

export const productIdentifiers = pgTable(
  'product_identifiers',
  {
    id: uuid('id').primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    value: text('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('product_identifiers_type_value_key').on(table.type, table.value),
    index('product_identifiers_product_idx').on(table.productId),
  ],
);

export type ProductRow = typeof products.$inferSelect;
export type ProductInsert = typeof products.$inferInsert;
export type ProductIdentifierRow = typeof productIdentifiers.$inferSelect;
