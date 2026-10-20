import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import type { AuditEntry } from '../../domain/entities/audit-entry';

export const auditEntries = pgTable(
  'audit_entries',
  {
    id: uuid('id').primaryKey(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    action: text('action').$type<AuditEntry['action']>().notNull(),
    actorId: text('actor_id'),
    source: text('source').notNull(),
    correlationId: text('correlation_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    changes: jsonb('changes').$type<AuditEntry['changes']>().notNull(),
  },
  (table) => [
    index('audit_entries_resource_idx').on(
      table.resourceType,
      table.resourceId,
      table.occurredAt.desc(),
    ),
    index('audit_entries_actor_idx').on(table.actorId, table.occurredAt.desc()),
    index('audit_entries_source_idx').on(table.source, table.occurredAt.desc()),
    index('audit_entries_correlation_idx').on(table.correlationId),
    index('audit_entries_occurred_at_idx').on(table.occurredAt.desc()),
  ],
);

export type AuditEntryRow = typeof auditEntries.$inferSelect;

/** Read-optimised, immutable projection: one row for each changed field. */
export const auditChangeItems = pgTable(
  'audit_change_items',
  {
    id: uuid('id').primaryKey(),
    auditEntryId: uuid('audit_entry_id')
      .notNull()
      .references(() => auditEntries.id),
    fieldName: text('field_name').notNull(),
    beforeValue: jsonb('before_value').$type<unknown>(),
    afterValue: jsonb('after_value').$type<unknown>(),
    previousValueValidFrom: timestamp('previous_value_valid_from', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('audit_change_items_entry_field_uidx').on(table.auditEntryId, table.fieldName),
    index('audit_change_items_field_idx').on(table.fieldName, table.auditEntryId),
  ],
);

export type AuditChangeItemRow = typeof auditChangeItems.$inferSelect;
