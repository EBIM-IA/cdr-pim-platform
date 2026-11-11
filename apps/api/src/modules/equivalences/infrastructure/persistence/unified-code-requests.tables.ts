import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';
export const unifiedCodeRequests = pgTable(
  'unified_code_requests',
  {
    id: uuid('id').primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    sku: text('sku').notNull(),
    currentCode: text('current_code'),
    action: text('action').notNull(),
    proposedCode: text('proposed_code'),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('pending_dispatch'),
    requestedBy: text('requested_by').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('unified_code_requests_sku_created_idx').on(table.sku, table.createdAt)],
);
