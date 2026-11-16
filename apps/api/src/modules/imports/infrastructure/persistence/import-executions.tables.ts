import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { importBatches } from './imports.tables';
export const importExecutions = pgTable(
  'import_executions',
  {
    batchId: uuid('batch_id')
      .primaryKey()
      .references(() => importBatches.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('queued'),
    actor: jsonb('actor').notNull(),
    processedRows: integer('processed_rows').notNull().default(0),
    totalRows: integer('total_rows').notNull(),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    leaseToken: uuid('lease_token'),
    error: text('error'),
  },
  (table) => [
    index('import_executions_pending_idx').on(table.status, table.leaseUntil, table.queuedAt),
  ],
);
