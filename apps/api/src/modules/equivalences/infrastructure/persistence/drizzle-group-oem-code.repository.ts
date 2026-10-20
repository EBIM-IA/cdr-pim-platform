import { Inject, Injectable } from '@nestjs/common';
import type { OemCodeListQuery } from '@cdr/contracts';
import { ConflictError, type Uuid } from '@cdr/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { recordAuditWithinTransaction } from '../../../../shared/persistence/record-audit-within-transaction';
import { AuditAction, createAuditEntry } from '../../../audit/domain/entities/audit-entry';
import type { AuditWriteContext } from '../../../audit/domain/ports/audit.port';
import { groupApplications } from '../../../applications/infrastructure/persistence/applications.tables';
import {
  attributeDefinitions,
  productAttributeValues,
} from '../../../catalog-schema/infrastructure/persistence/catalog-schema.tables';
import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';
import { GroupOemCode, type GroupOemCodeSnapshot } from '../../domain/entities/group-oem-code';
import type {
  EligibleOemMatch,
  GroupOemCodeMutationResult,
  GroupOemCodeRepositoryPort,
  OemAuditWriteContext,
  OemProductMatch,
} from '../../domain/ports/group-oem-code-repository.port';
import { equivalenceGroupMembers, equivalenceGroups } from './equivalences.tables';
import { groupOemCodes, type GroupOemCodeRow } from './group-oem-codes.tables';

@Injectable()
export class DrizzleGroupOemCodeRepository implements GroupOemCodeRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findGroupByCode(
    code: string,
  ): Promise<{ id: Uuid; code: string; automotive: boolean } | null> {
    const [row] = await this.db
      .select({ id: equivalenceGroups.id, code: equivalenceGroups.code })
      .from(equivalenceGroups)
      .where(eq(equivalenceGroups.code, code.trim().toUpperCase()))
      .limit(1);
    if (!row) return null;

    return {
      id: row.id as Uuid,
      code: row.code,
      automotive: await this.isAutomotiveGroup(row.id as Uuid),
    };
  }

  private async isAutomotiveGroup(groupId: Uuid): Promise<boolean> {
    const applications = await this.db
      .select({ value: groupApplications.vehicleType })
      .from(groupApplications)
      .where(and(eq(groupApplications.groupId, groupId), eq(groupApplications.active, true)));
    if (applications.some(({ value }) => isAutomotiveApplicationType(value))) return true;

    const attributes = await this.db
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
    return attributes.some(({ value }) => isAutomotiveApplicationType(value));
  }

  async findById(id: Uuid): Promise<GroupOemCode | null> {
    const [result] = await this.db
      .select({ oem: groupOemCodes, unifiedCode: equivalenceGroups.code })
      .from(groupOemCodes)
      .innerJoin(equivalenceGroups, eq(groupOemCodes.groupId, equivalenceGroups.id))
      .where(eq(groupOemCodes.id, id))
      .limit(1);
    return result ? this.toDomain(result.oem, result.unifiedCode) : null;
  }

  async findByNaturalKey(groupId: Uuid, oemCode: string): Promise<GroupOemCode | null> {
    const [result] = await this.db
      .select({ oem: groupOemCodes, unifiedCode: equivalenceGroups.code })
      .from(groupOemCodes)
      .innerJoin(equivalenceGroups, eq(groupOemCodes.groupId, equivalenceGroups.id))
      .where(
        and(
          eq(groupOemCodes.groupId, groupId),
          sql`lower(${groupOemCodes.oemCode}) = lower(${oemCode.trim()})`,
        ),
      )
      .limit(1);
    return result ? this.toDomain(result.oem, result.unifiedCode) : null;
  }

  async list(query: OemCodeListQuery): Promise<GroupOemCode[]> {
    const conditions = [];
    if (!query.includeInactive) conditions.push(eq(groupOemCodes.active, true));
    if (query.unifiedCode) {
      conditions.push(eq(equivalenceGroups.code, query.unifiedCode.trim().toUpperCase()));
    }
    if (query.brand) {
      conditions.push(sql`${query.brand.trim().toUpperCase()} = any(${groupOemCodes.brands})`);
    }
    const rows = await this.db
      .select({ oem: groupOemCodes, unifiedCode: equivalenceGroups.code })
      .from(groupOemCodes)
      .innerJoin(equivalenceGroups, eq(groupOemCodes.groupId, equivalenceGroups.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    return rows.map((row) => this.toDomain(row.oem, row.unifiedCode));
  }

  async searchEligible(query: string): Promise<EligibleOemMatch[]> {
    const term = query.trim();
    const rows = await this.db
      .select({ oem: groupOemCodes, unifiedCode: equivalenceGroups.code })
      .from(groupOemCodes)
      .innerJoin(equivalenceGroups, eq(groupOemCodes.groupId, equivalenceGroups.id))
      .where(
        and(
          eq(groupOemCodes.active, true),
          eq(groupOemCodes.approvalStatus, 'approved'),
          sql`(lower(${groupOemCodes.oemCode}) = lower(${term}) or upper(${term}) = any(${groupOemCodes.brands}))`,
        ),
      );

    const result: EligibleOemMatch[] = [];
    const automotiveGroups = new Map<string, Promise<boolean>>();
    for (const row of rows) {
      let automotive = automotiveGroups.get(row.oem.groupId);
      if (!automotive) {
        automotive = this.isAutomotiveGroup(row.oem.groupId as Uuid);
        automotiveGroups.set(row.oem.groupId, automotive);
      }
      if (!(await automotive)) continue;
      const memberRows = await this.db
        .select({
          id: products.id,
          sku: products.sku,
          name: products.name,
          brand: products.brand,
          status: products.status,
        })
        .from(equivalenceGroupMembers)
        .innerJoin(products, eq(equivalenceGroupMembers.productId, products.id))
        .where(eq(equivalenceGroupMembers.groupId, row.oem.groupId));
      result.push({
        oem: this.toDomain(row.oem, row.unifiedCode),
        products: memberRows.map((product): OemProductMatch => ({
          ...product,
          id: product.id as Uuid,
        })),
      });
    }
    return result;
  }

  async insertWithAudit(oem: GroupOemCode, audit: OemAuditWriteContext): Promise<void> {
    const snapshot = oem.toSnapshot();
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(groupOemCodes).values(toInsertRow(snapshot));
        await recordAuditWithinTransaction(
          tx,
          createAuditEntry({
            resourceType: 'group_oem_code',
            resourceId: snapshot.id,
            action: audit.action,
            actorId: audit.actorId,
            source: 'api',
            correlationId: audit.correlationId,
            occurredAt: audit.occurredAt,
            changes: oemChanges(undefined, snapshot),
          }),
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('OEM code already exists for this unifying code');
      }
      throw error;
    }
  }

  async saveImported(oem: GroupOemCode, audit: AuditWriteContext): Promise<void> {
    const snapshot = oem.toSnapshot();
    try {
      await this.db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(groupOemCodes)
          .where(eq(groupOemCodes.id, snapshot.id))
          .for('update')
          .limit(1);
        await tx
          .insert(groupOemCodes)
          .values({
            id: snapshot.id,
            groupId: snapshot.groupId,
            oemCode: snapshot.oemCode,
            brands: [...snapshot.brands],
            active: snapshot.active,
            approvalStatus: snapshot.approvalStatus,
            source: 'import',
            importBatchId: snapshot.importBatchId,
            createdAt: snapshot.createdAt,
            updatedAt: snapshot.updatedAt,
          })
          .onConflictDoUpdate({
            target: groupOemCodes.id,
            set: {
              oemCode: snapshot.oemCode,
              brands: [...snapshot.brands],
              active: snapshot.active,
              approvalStatus: snapshot.approvalStatus,
              source: 'import',
              importBatchId: snapshot.importBatchId,
              updatedAt: snapshot.updatedAt,
            },
          });
        await recordAuditWithinTransaction(
          tx,
          createAuditEntry({
            resourceType: 'group_oem_code',
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
        throw new ConflictError('OEM code already exists for this unifying code');
      }
      throw error;
    }
  }

  async updateWithAudit(
    oem: GroupOemCode,
    expectedUpdatedAt: Date,
    audit: OemAuditWriteContext,
  ): Promise<GroupOemCodeMutationResult> {
    const snapshot = oem.toSnapshot();
    try {
      return await this.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(groupOemCodes)
          .where(eq(groupOemCodes.id, snapshot.id))
          .for('update')
          .limit(1);
        if (!current) return { kind: 'not_found' } as const;
        if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
          return { kind: 'version_conflict', actualUpdatedAt: current.updatedAt } as const;
        }

        const [updated] = await tx
          .update(groupOemCodes)
          .set(toMutableRow(snapshot))
          .where(eq(groupOemCodes.id, snapshot.id))
          .returning();
        if (!updated) return { kind: 'not_found' } as const;
        await recordAuditWithinTransaction(
          tx,
          createAuditEntry({
            resourceType: 'group_oem_code',
            resourceId: snapshot.id,
            action: audit.action,
            actorId: audit.actorId,
            source: 'api',
            correlationId: audit.correlationId,
            occurredAt: audit.occurredAt,
            changes: oemChanges(
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
        throw new ConflictError('OEM code already exists for this unifying code');
      }
      throw error;
    }
  }

  private toDomain(row: GroupOemCodeRow, unifiedCode: string): GroupOemCode {
    const snapshot: GroupOemCodeSnapshot = {
      id: row.id as Uuid,
      groupId: row.groupId as Uuid,
      unifiedCode,
      oemCode: row.oemCode,
      brands: row.brands,
      active: row.active,
      approvalStatus: row.approvalStatus as GroupOemCodeSnapshot['approvalStatus'],
      source: row.source as GroupOemCodeSnapshot['source'],
      importBatchId: row.importBatchId as Uuid | null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    return GroupOemCode.rehydrate(snapshot);
  }
}

function toInsertRow(snapshot: GroupOemCodeSnapshot): typeof groupOemCodes.$inferInsert {
  return {
    id: snapshot.id,
    groupId: snapshot.groupId,
    ...toMutableRow(snapshot),
    source: snapshot.source,
    importBatchId: snapshot.importBatchId,
    createdAt: snapshot.createdAt,
  };
}

function toMutableRow(snapshot: GroupOemCodeSnapshot) {
  return {
    oemCode: snapshot.oemCode,
    brands: [...snapshot.brands],
    active: snapshot.active,
    approvalStatus: snapshot.approvalStatus,
    updatedAt: snapshot.updatedAt,
  };
}

function oemChanges(
  before: GroupOemCodeSnapshot | undefined,
  after: GroupOemCodeSnapshot,
): Record<string, { before?: unknown; after?: unknown }> {
  const fields = [
    'groupId',
    'unifiedCode',
    'oemCode',
    'brands',
    'active',
    'approvalStatus',
  ] as const;
  return Object.fromEntries(
    fields
      .filter((field) => before === undefined || !sameValue(before[field], after[field]))
      .map((field) => [field, { before: before?.[field], after: after[field] }]),
  );
}

function importedChanges(
  before: GroupOemCodeRow | undefined,
  after: GroupOemCodeSnapshot,
): Record<string, { before: unknown; after: unknown }> {
  const previous: Record<string, unknown> = before ?? {};
  const current = after as unknown as Record<string, unknown>;
  const ignored = new Set(['id', 'groupId', 'unifiedCode', 'createdAt', 'updatedAt']);
  return Object.fromEntries(
    Object.keys(current)
      .filter((field) => !ignored.has(field) && !sameValue(previous[field], current[field]))
      .map((field) => [field, { before: previous[field], after: current[field] }]),
  );
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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

export function isAutomotiveApplicationType(value: string | null | undefined): boolean {
  const normalized = (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
  if (!normalized) return false;

  const automotiveTerm = '(?:automotriz|automotrices|automovil|automoviles)';
  const negated = new RegExp(
    `\\b(?:no|sin|excepto)\\b(?:\\s+\\w+){0,3}\\s+${automotiveTerm}\\b`,
    'u',
  );
  if (negated.test(normalized)) return false;
  return new RegExp(`\\b${automotiveTerm}\\b`, 'u').test(normalized);
}
