import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, type Uuid } from '@cdr/shared';
import { and, eq } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { recordAuditWithinTransaction } from '../../../../shared/persistence/record-audit-within-transaction';
import { AuditAction, createAuditEntry } from '../../../audit/domain/entities/audit-entry';
import type { AuditWriteContext } from '../../../audit/domain/ports/audit.port';
import {
  GroupApplication,
  type GroupApplicationSnapshot,
} from '../../domain/entities/group-application';
import type {
  ApplicationAuditWriteContext,
  ApplicationCriteria,
  GroupApplicationMutationResult,
  GroupApplicationRepositoryPort,
} from '../../domain/ports/group-application-repository.port';
import {
  equivalenceGroupMembers,
  equivalenceGroups,
} from '../../../equivalences/infrastructure/persistence/equivalences.tables';
import { groupApplications, type GroupApplicationRow } from './applications.tables';

@Injectable()
export class DrizzleGroupApplicationRepository implements GroupApplicationRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findGroupByCode(code: string): Promise<{ id: Uuid; code: string } | null> {
    const [row] = await this.db
      .select({ id: equivalenceGroups.id, code: equivalenceGroups.code })
      .from(equivalenceGroups)
      .where(eq(equivalenceGroups.code, code.trim().toUpperCase()))
      .limit(1);
    return row ? { id: row.id as Uuid, code: row.code } : null;
  }

  async findById(id: Uuid): Promise<GroupApplication | null> {
    const [result] = await this.db
      .select({ application: groupApplications, unifiedCode: equivalenceGroups.code })
      .from(groupApplications)
      .innerJoin(equivalenceGroups, eq(groupApplications.groupId, equivalenceGroups.id))
      .where(eq(groupApplications.id, id))
      .limit(1);
    return result ? this.toDomain(result.application, result.unifiedCode) : null;
  }

  async list(criteria: ApplicationCriteria): Promise<GroupApplication[]> {
    const conditions = [];
    if (!criteria.includeInactive) conditions.push(eq(groupApplications.active, true));
    if (criteria.unifiedCode) {
      conditions.push(eq(equivalenceGroups.code, criteria.unifiedCode.trim().toUpperCase()));
    }

    if (criteria.productId) {
      const rows = await this.db
        .selectDistinct({ application: groupApplications, unifiedCode: equivalenceGroups.code })
        .from(groupApplications)
        .innerJoin(equivalenceGroups, eq(groupApplications.groupId, equivalenceGroups.id))
        .innerJoin(
          equivalenceGroupMembers,
          eq(equivalenceGroupMembers.groupId, equivalenceGroups.id),
        )
        .where(and(...conditions, eq(equivalenceGroupMembers.productId, criteria.productId)));
      return rows.map((row) => this.toDomain(row.application, row.unifiedCode));
    }

    const rows = await this.db
      .select({ application: groupApplications, unifiedCode: equivalenceGroups.code })
      .from(groupApplications)
      .innerJoin(equivalenceGroups, eq(groupApplications.groupId, equivalenceGroups.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    return rows.map((row) => this.toDomain(row.application, row.unifiedCode));
  }

  async insertWithAudit(
    application: GroupApplication,
    audit: ApplicationAuditWriteContext,
  ): Promise<void> {
    const snapshot = application.toSnapshot();
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(groupApplications).values(toInsertRow(snapshot));
        await recordAuditWithinTransaction(
          tx,
          createAuditEntry({
            resourceType: 'group_application',
            resourceId: snapshot.id,
            action: audit.action,
            actorId: audit.actorId,
            source: 'api',
            correlationId: audit.correlationId,
            occurredAt: audit.occurredAt,
            changes: applicationChanges(undefined, snapshot),
          }),
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Application already exists for this unifying code');
      }
      throw error;
    }
  }

  async updateWithAudit(
    application: GroupApplication,
    expectedUpdatedAt: Date,
    audit: ApplicationAuditWriteContext,
  ): Promise<GroupApplicationMutationResult> {
    const snapshot = application.toSnapshot();
    try {
      return await this.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(groupApplications)
          .where(eq(groupApplications.id, snapshot.id))
          .for('update')
          .limit(1);
        if (!current) return { kind: 'not_found' } as const;
        if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
          return { kind: 'version_conflict', actualUpdatedAt: current.updatedAt } as const;
        }

        const [updated] = await tx
          .update(groupApplications)
          .set(toMutableRow(snapshot))
          .where(eq(groupApplications.id, snapshot.id))
          .returning();
        if (!updated) return { kind: 'not_found' } as const;
        await recordAuditWithinTransaction(
          tx,
          createAuditEntry({
            resourceType: 'group_application',
            resourceId: snapshot.id,
            action: audit.action,
            actorId: audit.actorId,
            source: 'api',
            correlationId: audit.correlationId,
            occurredAt: audit.occurredAt,
            changes: applicationChanges(
              this.toDomain(current, snapshot.unifiedCode).toSnapshot(),
              snapshot,
            ),
          }),
        );
        return {
          kind: 'updated',
          value: this.toDomain(updated, snapshot.unifiedCode),
        } as const;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Application already exists for this unifying code');
      }
      throw error;
    }
  }

  async saveImported(application: GroupApplication, audit: AuditWriteContext): Promise<void> {
    const snapshot = application.toSnapshot();
    try {
      await this.db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(groupApplications)
          .where(eq(groupApplications.id, snapshot.id))
          .for('update')
          .limit(1);
        await tx
          .insert(groupApplications)
          .values({
            id: snapshot.id,
            groupId: snapshot.groupId,
            vehicleType: snapshot.vehicleType,
            make: snapshot.make,
            model: snapshot.model,
            yearFrom: snapshot.yearFrom,
            yearTo: snapshot.yearTo,
            engine: snapshot.engine,
            notes: snapshot.notes,
            active: snapshot.active,
            source: 'import',
            importBatchId: snapshot.importBatchId,
            createdAt: snapshot.createdAt,
            updatedAt: snapshot.updatedAt,
          })
          .onConflictDoUpdate({
            target: groupApplications.id,
            set: {
              vehicleType: snapshot.vehicleType,
              make: snapshot.make,
              model: snapshot.model,
              yearFrom: snapshot.yearFrom,
              yearTo: snapshot.yearTo,
              engine: snapshot.engine,
              notes: snapshot.notes,
              active: snapshot.active,
              source: 'import',
              importBatchId: snapshot.importBatchId,
              updatedAt: snapshot.updatedAt,
            },
          });
        await recordAuditWithinTransaction(
          tx,
          createAuditEntry({
            resourceType: 'group_application',
            resourceId: snapshot.id,
            action: before ? AuditAction.Updated : AuditAction.Imported,
            actorId: audit.actorId,
            source: 'import',
            correlationId: audit.correlationId,
            occurredAt: audit.occurredAt,
            changes: importedChanges(before, snapshot),
          }),
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Application already exists for this unifying code');
      }
      throw error;
    }
  }

  private toDomain(row: GroupApplicationRow, unifiedCode: string): GroupApplication {
    const snapshot: GroupApplicationSnapshot = {
      id: row.id as Uuid,
      groupId: row.groupId as Uuid,
      unifiedCode,
      vehicleType: row.vehicleType as GroupApplicationSnapshot['vehicleType'],
      make: row.make,
      model: row.model,
      yearFrom: row.yearFrom,
      yearTo: row.yearTo,
      engine: row.engine,
      notes: row.notes,
      active: row.active,
      source: row.source as GroupApplicationSnapshot['source'],
      importBatchId: row.importBatchId as Uuid | null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    return GroupApplication.rehydrate(snapshot);
  }
}

function toInsertRow(snapshot: GroupApplicationSnapshot): typeof groupApplications.$inferInsert {
  return {
    id: snapshot.id,
    groupId: snapshot.groupId,
    ...toMutableRow(snapshot),
    source: snapshot.source,
    importBatchId: snapshot.importBatchId,
    createdAt: snapshot.createdAt,
  };
}

function toMutableRow(snapshot: GroupApplicationSnapshot) {
  return {
    vehicleType: snapshot.vehicleType,
    make: snapshot.make,
    model: snapshot.model,
    yearFrom: snapshot.yearFrom,
    yearTo: snapshot.yearTo,
    engine: snapshot.engine,
    notes: snapshot.notes,
    active: snapshot.active,
    updatedAt: snapshot.updatedAt,
  };
}

function applicationChanges(
  before: GroupApplicationSnapshot | undefined,
  after: GroupApplicationSnapshot,
): Record<string, { before?: unknown; after?: unknown }> {
  const fields = [
    'groupId',
    'unifiedCode',
    'vehicleType',
    'make',
    'model',
    'yearFrom',
    'yearTo',
    'engine',
    'notes',
    'active',
  ] as const;
  return Object.fromEntries(
    fields
      .filter((field) => before === undefined || before[field] !== after[field])
      .map((field) => [field, { before: before?.[field], after: after[field] }]),
  );
}

function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error; current != null;) {
    if (
      typeof current === 'object' &&
      'code' in current &&
      (current as { code?: unknown }).code === '23505'
    ) {
      return true;
    }
    current = typeof current === 'object' && 'cause' in current ? current.cause : null;
  }
  return false;
}

function importedChanges(
  before: GroupApplicationRow | undefined,
  after: GroupApplicationSnapshot,
): Record<string, { before: unknown; after: unknown }> {
  const previous: Record<string, unknown> = before ?? {};
  const current = after as unknown as Record<string, unknown>;
  const ignored = new Set(['id', 'groupId', 'unifiedCode', 'createdAt', 'updatedAt']);
  return Object.fromEntries(
    Object.keys(current)
      .filter((field) => !ignored.has(field) && previous[field] !== current[field])
      .map((field) => [field, { before: previous[field], after: current[field] }]),
  );
}
