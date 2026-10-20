import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').primaryKey(),
    target: text('target').notNull(),
    format: text('format').notNull(),
    status: text('status').notNull().default('previewed'),
    idempotencyKey: text('idempotency_key').notNull(),
    payloadHash: text('payload_hash').notNull(),
    categoryCode: text('category_code'),
    createdBy: text('created_by').notNull(),
    totalRows: integer('total_rows').notNull(),
    validRows: integer('valid_rows').notNull(),
    invalidRows: integer('invalid_rows').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
  },
  (table) => [index('import_batches_created_at_idx').on(table.createdAt)],
);

export const importRows = pgTable(
  'import_rows',
  {
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatches.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    valid: boolean('valid').notNull(),
    data: jsonb('data').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    errors: jsonb('errors').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('import_rows_batch_valid_idx').on(table.batchId, table.valid)],
);

export type ImportBatchRow = typeof importBatches.$inferSelect;
export type ImportRowRow = typeof importRows.$inferSelect;
