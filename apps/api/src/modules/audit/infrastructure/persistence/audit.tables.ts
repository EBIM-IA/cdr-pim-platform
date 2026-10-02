import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import type { AuditEntry } from '../../domain/entities/audit-entry';

export const auditEntries = pgTable(
  'audit_entries',
  {
    id: uuid('id').primaryKey(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    action: text('action').notNull(),
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
    index('audit_entries_correlation_idx').on(table.correlationId),
    index('audit_entries_occurred_at_idx').on(table.occurredAt.desc()),
  ],
);

export type AuditEntryRow = typeof auditEntries.$inferSelect;
