import { Inject, Injectable } from '@nestjs/common';
import type { Uuid } from '@cdr/shared';
import { and, eq } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import {
  GroupApplication,
  type GroupApplicationSnapshot,
} from '../../domain/entities/group-application';
import type {
  ApplicationCriteria,
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

  async save(application: GroupApplication): Promise<void> {
    const snapshot = application.toSnapshot();
    await this.db
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
        source: snapshot.source,
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
          updatedAt: snapshot.updatedAt,
        },
      });
  }

  private toDomain(row: GroupApplicationRow, unifiedCode: string): GroupApplication {
    const snapshot: GroupApplicationSnapshot = {
      id: row.id as Uuid,
      groupId: row.groupId as Uuid,
      unifiedCode,
      vehicleType: row.vehicleType,
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
