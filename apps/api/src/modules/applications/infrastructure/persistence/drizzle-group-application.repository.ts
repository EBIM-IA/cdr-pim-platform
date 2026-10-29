import { Inject, Injectable } from '@nestjs/common';
import type { ApplicationVehicleType } from '@cdr/contracts';
import { ConflictError, type Uuid } from '@cdr/shared';
import { and, eq, inArray } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { recordAuditWithinTransaction } from '../../../../shared/persistence/record-audit-within-transaction';
import { AuditAction, createAuditEntry } from '../../../audit/domain/entities/audit-entry';
import type { AuditWriteContext } from '../../../audit/domain/ports/audit.port';
import {
  attributeDefinitions,
  productAttributeValues,
} from '../../../catalog-schema/infrastructure/persistence/catalog-schema.tables';
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

  async findGroupByCode(
    code: string,
  ): Promise<{ id: Uuid; code: string; vehicleType: ApplicationVehicleType | null } | null> {
    const [row] = await this.db
      .select({ id: equivalenceGroups.id, code: equivalenceGroups.code })
      .from(equivalenceGroups)
      .where(eq(equivalenceGroups.code, code.trim().toUpperCase()))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id as Uuid,
      code: row.code,
      vehicleType: await this.resolveGroupVehicleType(row.id as Uuid),
    };
  }

  private async resolveGroupVehicleType(groupId: Uuid): Promise<ApplicationVehicleType | null> {
    const applicationRows = await this.db
      .select({ value: groupApplications.vehicleType })
      .from(groupApplications)
      .where(and(eq(groupApplications.groupId, groupId), eq(groupApplications.active, true)));
    const fromApplications = singleVehicleType(applicationRows.map(({ value }) => value));
    if (fromApplications) return fromApplications;

    const attributeRows = await this.db
      .select({ value: productAttributeValues.valueText })
      .from(equivalenceGroupMembers)
      .innerJoin(
        productAttributeValues,
        eq(equivalenceGroupMembers.productId, productAttributeValues.productId),
      )
      .innerJoin(
        attributeDefinitions,
        eq(productAttributeValues.attributeDefinitionId, attributeDefinitions.id),
      )
      .where(
        and(
          eq(equivalenceGroupMembers.groupId, groupId),
          inArray(attributeDefinitions.key, [
            'tipo_aplicacion',
            'tipo_de_aplicacion',
            'application_type',
          ]),
        ),
      );
    return singleVehicleType(attributeRows.map(({ value }) => value));
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
        .where(and(...conditions, eq(equivalenceGroupMembers.productId, criteria.productId)))
        .orderBy(groupApplications.createdAt, groupApplications.id);
      return rows.map((row) => this.toDomain(row.application, row.unifiedCode));
    }

    const rows = await this.db
      .select({ application: groupApplications, unifiedCode: equivalenceGroups.code })
      .from(groupApplications)
      .innerJoin(equivalenceGroups, eq(groupApplications.groupId, equivalenceGroups.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(groupApplications.createdAt, groupApplications.id);
    return rows.map((row) => this.toDomain(row.application, row.unifiedCode));
  }

  async listForProducts(
    productIds: readonly Uuid[],
  ): Promise<ReadonlyMap<Uuid, readonly GroupApplication[]>> {
    const ids = [...new Set(productIds)];
    if (!ids.length) return new Map();
    const rows = await this.db
      .select({
        productId: equivalenceGroupMembers.productId,
        application: groupApplications,
        unifiedCode: equivalenceGroups.code,
      })
      .from(equivalenceGroupMembers)
      .innerJoin(equivalenceGroups, eq(equivalenceGroupMembers.groupId, equivalenceGroups.id))
      .innerJoin(groupApplications, eq(groupApplications.groupId, equivalenceGroups.id))
      .where(
        and(inArray(equivalenceGroupMembers.productId, ids), eq(groupApplications.active, true)),
      )
      .orderBy(groupApplications.createdAt, groupApplications.id);
    const result = new Map<Uuid, GroupApplication[]>();
    for (const row of rows) {
      const id = row.productId as Uuid;
      const applications = result.get(id) ?? [];
      applications.push(this.toDomain(row.application, row.unifiedCode));
      result.set(id, applications);
    }
    return result;
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
            bodyStyle: snapshot.bodyStyle,
            fuel: snapshot.fuel,
            traction: snapshot.traction,
            displacement: snapshot.displacement,
            yearFrom: snapshot.yearFrom,
            yearTo: snapshot.yearTo,
            area: snapshot.area,
            subarea: snapshot.subarea,
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
              bodyStyle: snapshot.bodyStyle,
              fuel: snapshot.fuel,
              traction: snapshot.traction,
              displacement: snapshot.displacement,
              yearFrom: snapshot.yearFrom,
              yearTo: snapshot.yearTo,
              area: snapshot.area,
              subarea: snapshot.subarea,
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
      bodyStyle: row.bodyStyle,
      fuel: row.fuel,
      traction: row.traction,
      displacement: row.displacement,
      yearFrom: row.yearFrom,
      yearTo: row.yearTo,
      area: row.area,
      subarea: row.subarea,
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
    bodyStyle: snapshot.bodyStyle,
    fuel: snapshot.fuel,
    traction: snapshot.traction,
    displacement: snapshot.displacement,
    yearFrom: snapshot.yearFrom,
    yearTo: snapshot.yearTo,
    area: snapshot.area,
    subarea: snapshot.subarea,
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
    'bodyStyle',
    'fuel',
    'traction',
    'displacement',
    'yearFrom',
    'yearTo',
    'area',
    'subarea',
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

function singleVehicleType(values: readonly (string | null)[]): ApplicationVehicleType | null {
  const types = new Set(
    values
      .map((value) => value?.trim().toUpperCase())
      .filter(
        (value): value is ApplicationVehicleType =>
          value === 'AUTOMOTRIZ' || value === 'INDUSTRIAL',
      ),
  );
  return types.size === 1 ? ([...types][0] ?? null) : null;
}
