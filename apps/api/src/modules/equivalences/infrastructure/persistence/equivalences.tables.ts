import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';

/**
 * Tables owned by the **equivalences** module.
 *
 * The foreign key to `products` is a physical database constraint and therefore lives
 * here, in infrastructure. It is NOT a licence for the equivalences *application* layer to
 * call into the catalog module's use cases — cross-module access happens through published
 * ports only (see `docs/architecture/MODULE_ARCHITECTURE.md`).
 */
export const equivalenceGroups = pgTable(
  'equivalence_groups',
  {
    id: uuid('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('interchange'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('equivalence_groups_code_key').on(table.code)],
);

export const equivalenceGroupMembers = pgTable(
  'equivalence_group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => equivalenceGroups.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.productId] }),
    index('equivalence_group_members_product_idx').on(table.productId),
  ],
);

export type EquivalenceGroupRow = typeof equivalenceGroups.$inferSelect;
export type EquivalenceGroupMemberRow = typeof equivalenceGroupMembers.$inferSelect;
