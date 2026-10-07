import { newUuid } from '@cdr/shared';
import { and, eq, inArray, max } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
import {
  auditChangeItems,
  auditEntries,
} from '../../../audit/infrastructure/persistence/audit.tables';

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Asset metadata and its audit projection commit in the same PostgreSQL transaction. */
export async function recordAssetAuditWithin(
  transaction: DatabaseTransaction,
  entry: AuditEntry,
): Promise<void> {
  const fields = Object.keys(entry.changes);
  const previous =
    fields.length === 0
      ? []
      : await transaction
          .select({
            fieldName: auditChangeItems.fieldName,
            validFrom: max(auditEntries.occurredAt),
          })
          .from(auditChangeItems)
          .innerJoin(auditEntries, eq(auditEntries.id, auditChangeItems.auditEntryId))
          .where(
            and(
              eq(auditEntries.resourceType, entry.resourceType),
              eq(auditEntries.resourceId, entry.resourceId),
              inArray(auditChangeItems.fieldName, fields),
            ),
          )
          .groupBy(auditChangeItems.fieldName);
  const previousByField = new Map(previous.map((row) => [row.fieldName, row.validFrom ?? null]));

  await transaction.insert(auditEntries).values({
    id: entry.id,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    action: entry.action,
    actorId: entry.actorId,
    source: entry.source,
    correlationId: entry.correlationId,
    occurredAt: entry.occurredAt,
    changes: entry.changes,
  });
  if (fields.length === 0) return;
  await transaction.insert(auditChangeItems).values(
    fields.map((fieldName) => {
      const change = entry.changes[fieldName] ?? {};
      return {
        id: newUuid(),
        auditEntryId: entry.id,
        fieldName,
        beforeValue: Object.hasOwn(change, 'before') ? change.before : null,
        afterValue: Object.hasOwn(change, 'after') ? change.after : null,
        previousValueValidFrom: previousByField.get(fieldName) ?? null,
      };
    }),
  );
}
