import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { equivalenceGroups } from './equivalences.tables';

export const externalHomologs = pgTable(
  'external_homologs',
  {
    id: uuid('id').primaryKey(),
    groupId: uuid('equivalence_group_id')
      .notNull()
      .references(() => equivalenceGroups.id, { onDelete: 'cascade' }),
    externalCode: text('external_code').notNull(),
    externalBrand: text('external_brand').notNull(),
    active: boolean('active').notNull().default(true),
    approvalStatus: text('approval_status').notNull().default('pending'),
    source: text('source').notNull().default('manual'),
    importBatchId: uuid('import_batch_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('external_homologs_group_idx').on(table.groupId, table.active, table.approvalStatus),
  ],
);

export type ExternalHomologRow = typeof externalHomologs.$inferSelect;
