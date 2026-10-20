import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, lte, max, sql, type SQL } from 'drizzle-orm';
import { newUuid } from '@cdr/shared';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import type { AuditEntry } from '../../domain/entities/audit-entry';
import type {
  AuditChangeFilter,
  AuditChangePage,
  AuditReadPort,
} from '../../domain/ports/audit-read.port';
import type { AuditPort } from '../../domain/ports/audit.port';
import { auditChangeItems, auditEntries } from './audit.tables';

/** Persists the compliance trail in the database-owned append-only table. */
@Injectable()
export class PostgresAuditAdapter implements AuditPort, AuditReadPort {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async record(entry: AuditEntry): Promise<void> {
    const fieldNames = Object.keys(entry.changes);
    await this.database.transaction(async (transaction) => {
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

      if (fieldNames.length > 0) {
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
    });
  }

  async listChanges(filter: AuditChangeFilter): Promise<AuditChangePage> {
    const currentSku = sql<string | null>`COALESCE(
      (
        SELECT product.sku
        FROM products product
        WHERE product.id::text = ${auditEntries.resourceId}
        LIMIT 1
      ),
      (
        SELECT sku_item.after_value #>> '{}'
        FROM audit_change_items sku_item
        INNER JOIN audit_entries sku_entry ON sku_entry.id = sku_item.audit_entry_id
        WHERE sku_entry.resource_type = 'product'
          AND sku_entry.resource_id = ${auditEntries.resourceId}
          AND sku_item.field_name = 'sku'
          AND sku_item.after_value IS NOT NULL
        ORDER BY sku_entry.occurred_at DESC, sku_entry.id DESC
        LIMIT 1
      )
    )`;
    const predicates: SQL[] = [];
    if (filter.sku) {
      predicates.push(sql`lower(${currentSku}) = lower(${filter.sku})`);
    }
    if (filter.resourceType) {
      predicates.push(eq(auditEntries.resourceType, filter.resourceType));
    }
    if (filter.resourceId) predicates.push(eq(auditEntries.resourceId, filter.resourceId));
    if (filter.field) predicates.push(eq(auditChangeItems.fieldName, filter.field));
    if (filter.source) predicates.push(eq(auditEntries.source, filter.source));
    if (filter.actorId) predicates.push(eq(auditEntries.actorId, filter.actorId));
    if (filter.from) predicates.push(gte(auditEntries.occurredAt, filter.from));
    if (filter.to) predicates.push(lte(auditEntries.occurredAt, filter.to));
    const where = predicates.length > 0 ? and(...predicates) : undefined;

    const [items, totals] = await Promise.all([
      this.database
        .select({
          id: auditChangeItems.id,
          auditEntryId: auditEntries.id,
          resourceType: auditEntries.resourceType,
          resourceId: auditEntries.resourceId,
          sku: currentSku,
          action: auditEntries.action,
          field: auditChangeItems.fieldName,
          before: auditChangeItems.beforeValue,
          after: auditChangeItems.afterValue,
          previousValueValidFrom: auditChangeItems.previousValueValidFrom,
          actorId: auditEntries.actorId,
          source: auditEntries.source,
          correlationId: auditEntries.correlationId,
          occurredAt: auditEntries.occurredAt,
        })
        .from(auditChangeItems)
        .innerJoin(auditEntries, eq(auditEntries.id, auditChangeItems.auditEntryId))
        .where(where)
        .orderBy(desc(auditEntries.occurredAt), desc(auditEntries.id), auditChangeItems.fieldName)
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.database
        .select({ total: count() })
        .from(auditChangeItems)
        .innerJoin(auditEntries, eq(auditEntries.id, auditChangeItems.auditEntryId))
        .where(where),
    ]);

    return { items, total: totals[0]?.total ?? 0 };
  }
}
