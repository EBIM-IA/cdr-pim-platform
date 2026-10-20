import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, type Uuid } from '@cdr/shared';
import { and, eq, sql } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { recordAuditWithinTransaction } from '../../../../shared/persistence/record-audit-within-transaction';
import { AuditAction, createAuditEntry } from '../../../audit/domain/entities/audit-entry';
import type { AuditWriteContext } from '../../../audit/domain/ports/audit.port';
import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';
import {
  ExternalHomolog,
  type ExternalHomologSnapshot,
} from '../../domain/entities/external-homolog';
import type {
  EligibleHomologMatch,
  ExternalHomologMutationResult,
  ExternalHomologRepositoryPort,
  HomologAuditWriteContext,
  HomologProductMatch,
} from '../../domain/ports/external-homolog-repository.port';
import { equivalenceGroupMembers, equivalenceGroups } from './equivalences.tables';
import { externalHomologs, type ExternalHomologRow } from './external-homologs.tables';

@Injectable()
export class DrizzleExternalHomologRepository implements ExternalHomologRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findGroupByCode(code: string): Promise<{ id: Uuid; code: string } | null> {
    const [row] = await this.db
      .select({ id: equivalenceGroups.id, code: equivalenceGroups.code })
      .from(equivalenceGroups)
      .where(eq(equivalenceGroups.code, code.trim().toUpperCase()))
      .limit(1);
    return row ? { id: row.id as Uuid, code: row.code } : null;
  }

  async findById(id: Uuid): Promise<ExternalHomolog | null> {
    const [result] = await this.db
      .select({ homolog: externalHomologs, unifiedCode: equivalenceGroups.code })
      .from(externalHomologs)
      .innerJoin(equivalenceGroups, eq(externalHomologs.groupId, equivalenceGroups.id))
      .where(eq(externalHomologs.id, id))
      .limit(1);
    return result ? this.toDomain(result.homolog, result.unifiedCode) : null;
  }

  async list(unifiedCode?: string, includeInactive = false): Promise<ExternalHomolog[]> {
    const conditions = [];
    if (!includeInactive) conditions.push(eq(externalHomologs.active, true));
    if (unifiedCode) {
      conditions.push(eq(equivalenceGroups.code, unifiedCode.trim().toUpperCase()));
    }
    const rows = await this.db
      .select({ homolog: externalHomologs, unifiedCode: equivalenceGroups.code })
      .from(externalHomologs)
      .innerJoin(equivalenceGroups, eq(externalHomologs.groupId, equivalenceGroups.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    return rows.map((row) => this.toDomain(row.homolog, row.unifiedCode));
  }

  async searchEligible(externalCode: string): Promise<EligibleHomologMatch[]> {
    const homologRows = await this.db
      .select({ homolog: externalHomologs, unifiedCode: equivalenceGroups.code })
      .from(externalHomologs)
      .innerJoin(equivalenceGroups, eq(externalHomologs.groupId, equivalenceGroups.id))
      .where(
        and(
          eq(externalHomologs.active, true),
          eq(externalHomologs.approvalStatus, 'approved'),
          sql`lower(${externalHomologs.externalCode}) = lower(${externalCode.trim()})`,
        ),
      );
    if (homologRows.length === 0) return [];

    const result: EligibleHomologMatch[] = [];
    for (const row of homologRows) {
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
        .where(eq(equivalenceGroupMembers.groupId, row.homolog.groupId));
      result.push({
        homolog: this.toDomain(row.homolog, row.unifiedCode),
        products: memberRows.map((product): HomologProductMatch => ({
          ...product,
          id: product.id as Uuid,
        })),
      });
    }
    return result;
  }

  async insertWithAudit(homolog: ExternalHomolog, audit: HomologAuditWriteContext): Promise<void> {
    const snapshot = homolog.toSnapshot();
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(externalHomologs).values(toInsertRow(snapshot));
        await recordAuditWithinTransaction(
          tx,
          createAuditEntry({
            resourceType: 'external_homolog',
            resourceId: snapshot.id,
            action: audit.action,
            actorId: audit.actorId,
            source: 'api',
            correlationId: audit.correlationId,
            occurredAt: audit.occurredAt,
            changes: homologChanges(undefined, snapshot),
          }),
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('External homolog already exists for this unifying code');
      }
      throw error;
    }
  }

  async updateWithAudit(
    homolog: ExternalHomolog,
    expectedUpdatedAt: Date,
    audit: HomologAuditWriteContext,
  ): Promise<ExternalHomologMutationResult> {
    const snapshot = homolog.toSnapshot();
    try {
      return await this.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(externalHomologs)
          .where(eq(externalHomologs.id, snapshot.id))
          .for('update')
          .limit(1);
        if (!current) return { kind: 'not_found' } as const;
        if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
          return { kind: 'version_conflict', actualUpdatedAt: current.updatedAt } as const;
        }

        const [updated] = await tx
          .update(externalHomologs)
          .set(toMutableRow(snapshot))
          .where(eq(externalHomologs.id, snapshot.id))
          .returning();
        if (!updated) return { kind: 'not_found' } as const;
        await recordAuditWithinTransaction(
          tx,
          createAuditEntry({
            resourceType: 'external_homolog',
            resourceId: snapshot.id,
            action: audit.action,
            actorId: audit.actorId,
            source: 'api',
            correlationId: audit.correlationId,
            occurredAt: audit.occurredAt,
            changes: homologChanges(
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
        throw new ConflictError('External homolog already exists for this unifying code');
      }
      throw error;
    }
  }

  async saveImported(homolog: ExternalHomolog, audit: AuditWriteContext): Promise<void> {
    const snapshot = homolog.toSnapshot();
    try {
      await this.db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(externalHomologs)
          .where(eq(externalHomologs.id, snapshot.id))
          .for('update')
          .limit(1);
        await tx
          .insert(externalHomologs)
          .values({
            id: snapshot.id,
            groupId: snapshot.groupId,
            externalCode: snapshot.externalCode,
            externalBrand: snapshot.externalBrand,
            active: snapshot.active,
            approvalStatus: snapshot.approvalStatus,
            source: 'import',
            importBatchId: snapshot.importBatchId,
            createdAt: snapshot.createdAt,
            updatedAt: snapshot.updatedAt,
          })
          .onConflictDoUpdate({
            target: externalHomologs.id,
            set: {
              externalCode: snapshot.externalCode,
              externalBrand: snapshot.externalBrand,
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
            resourceType: 'external_homolog',
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
        throw new ConflictError('External homolog already exists for this unifying code');
      }
      throw error;
    }
  }

  private toDomain(row: ExternalHomologRow, unifiedCode: string): ExternalHomolog {
    const snapshot: ExternalHomologSnapshot = {
      id: row.id as Uuid,
      groupId: row.groupId as Uuid,
      unifiedCode,
      externalCode: row.externalCode,
      externalBrand: row.externalBrand,
      active: row.active,
      approvalStatus: row.approvalStatus as ExternalHomologSnapshot['approvalStatus'],
      source: row.source as ExternalHomologSnapshot['source'],
      importBatchId: row.importBatchId as Uuid | null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    return ExternalHomolog.rehydrate(snapshot);
  }
}

function toInsertRow(snapshot: ExternalHomologSnapshot): typeof externalHomologs.$inferInsert {
  return {
    id: snapshot.id,
    groupId: snapshot.groupId,
    ...toMutableRow(snapshot),
    source: snapshot.source,
    importBatchId: snapshot.importBatchId,
    createdAt: snapshot.createdAt,
  };
}

function toMutableRow(snapshot: ExternalHomologSnapshot) {
  return {
    externalCode: snapshot.externalCode,
    externalBrand: snapshot.externalBrand,
    active: snapshot.active,
    approvalStatus: snapshot.approvalStatus,
    updatedAt: snapshot.updatedAt,
  };
}

function homologChanges(
  before: ExternalHomologSnapshot | undefined,
  after: ExternalHomologSnapshot,
): Record<string, { before?: unknown; after?: unknown }> {
  const fields = [
    'groupId',
    'unifiedCode',
    'externalCode',
    'externalBrand',
    'active',
    'approvalStatus',
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
  before: ExternalHomologRow | undefined,
  after: ExternalHomologSnapshot,
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
