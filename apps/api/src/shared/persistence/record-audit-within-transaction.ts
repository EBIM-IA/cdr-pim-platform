import { newUuid } from '@cdr/shared';
import { and, eq, inArray, max } from 'drizzle-orm';

import type { Database } from '../../database/drizzle.client';
import type { AuditEntry } from '../../modules/audit/domain/entities/audit-entry';
import {
  auditChangeItems,
  auditEntries,
} from '../../modules/audit/infrastructure/persistence/audit.tables';

export type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Platform UoW primitive: the caller's business write and immutable audit share one tx. */
export async function recordAuditWithinTransaction(
  transaction: DatabaseTransaction,
  entry: AuditEntry,
): Promise<void> {
  const fieldNames = Object.keys(entry.changes);
  const previousRows =
    fieldNames.length === 0
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
              inArray(auditChangeItems.fieldName, fieldNames),
            ),
          )
          .groupBy(auditChangeItems.fieldName);
  const previousByField = new Map(
    previousRows.map((row) => [row.fieldName, row.validFrom ?? null]),
  );
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
  if (fieldNames.length === 0) return;
  await transaction.insert(auditChangeItems).values(
    fieldNames.map((fieldName) => {
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
