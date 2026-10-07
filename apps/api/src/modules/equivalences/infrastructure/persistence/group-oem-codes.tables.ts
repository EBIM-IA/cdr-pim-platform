import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { importBatches } from '../../../imports/infrastructure/persistence/imports.tables';
import { equivalenceGroups } from './equivalences.tables';

export const groupOemCodes = pgTable(
  'group_oem_codes',
  {
    id: uuid('id').primaryKey(),
    groupId: uuid('equivalence_group_id')
      .notNull()
      .references(() => equivalenceGroups.id, { onDelete: 'cascade' }),
    oemCode: text('oem_code').notNull(),
    brands: text('brands').array().notNull(),
    active: boolean('active').notNull().default(true),
    approvalStatus: text('approval_status').notNull().default('pending'),
    source: text('source').notNull().default('manual'),
    importBatchId: uuid('import_batch_id').references(() => importBatches.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('group_oem_codes_natural_key').on(table.groupId, sql`lower(${table.oemCode})`),
    index('group_oem_codes_group_idx').on(table.groupId, table.active, table.approvalStatus),
  ],
);

export type GroupOemCodeRow = typeof groupOemCodes.$inferSelect;
