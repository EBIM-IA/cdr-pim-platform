import { Inject, Injectable } from '@nestjs/common';
import type { Uuid } from '@cdr/shared';
import { and, eq, sql } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';
import {
  ExternalHomolog,
  type ExternalHomologSnapshot,
} from '../../domain/entities/external-homolog';
import type {
  EligibleHomologMatch,
  ExternalHomologRepositoryPort,
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

  async save(homolog: ExternalHomolog): Promise<void> {
    const snapshot = homolog.toSnapshot();
    await this.db
      .insert(externalHomologs)
      .values({
        id: snapshot.id,
        groupId: snapshot.groupId,
        externalCode: snapshot.externalCode,
        externalBrand: snapshot.externalBrand,
        active: snapshot.active,
        approvalStatus: snapshot.approvalStatus,
        source: snapshot.source,
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
          updatedAt: snapshot.updatedAt,
        },
      });
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
