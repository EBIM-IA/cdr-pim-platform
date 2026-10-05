import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const axInboundBatches = pgTable(
  'ax_inbound_batches',
  {
    id: uuid('id').primaryKey(),
    externalBatchId: text('external_batch_id').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    sourceSystem: text('source_system'),
    requestHash: text('request_hash').notNull(),
    status: text('status').notNull().default('received'),
    recordCount: integer('record_count').notNull(),
    correlationId: text('correlation_id').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('ax_inbound_batches_external_id_key').on(table.externalBatchId),
    index('ax_inbound_batches_received_at_idx').on(table.receivedAt),
  ],
);

export const axInboundRecords = pgTable(
  'ax_inbound_records',
  {
    id: uuid('id').primaryKey(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => axInboundBatches.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    itemCode: text('item_code').notNull(),
    supplierCode: text('supplier_code').notNull(),
    sourceModifiedAt: timestamp('source_modified_at', { withTimezone: true }),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ax_inbound_records_batch_row_key').on(table.batchId, table.rowNumber),
    index('ax_inbound_records_item_code_idx').on(table.itemCode),
  ],
);

export type AxInboundBatchRow = typeof axInboundBatches.$inferSelect;
