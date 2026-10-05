import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { equivalenceGroups } from '../../../equivalences/infrastructure/persistence/equivalences.tables';

export const groupApplications = pgTable(
  'group_applications',
  {
    id: uuid('id').primaryKey(),
    groupId: uuid('equivalence_group_id')
      .notNull()
      .references(() => equivalenceGroups.id, { onDelete: 'cascade' }),
    vehicleType: text('vehicle_type'),
    make: text('make'),
    model: text('model'),
    yearFrom: integer('year_from'),
    yearTo: integer('year_to'),
    engine: text('engine'),
    notes: text('notes'),
    active: boolean('active').notNull().default(true),
    source: text('source').notNull().default('manual'),
    importBatchId: uuid('import_batch_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('group_applications_group_idx').on(table.groupId, table.active)],
);

export type GroupApplicationRow = typeof groupApplications.$inferSelect;
