import { Inject, Injectable } from '@nestjs/common';
import { type Uuid } from '@cdr/shared';
import { and, eq, ilike, or, sql } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import type { ApplicationSearchReadModelPort } from '../../domain/ports/application-search-read-model.port';
import { equivalenceGroupMembers } from '../../../equivalences/infrastructure/persistence/equivalences.tables';
import { groupApplications } from './applications.tables';

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

@Injectable()
export class DrizzleApplicationSearchReadModel implements ApplicationSearchReadModelPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findActiveProductIds(query: string, limit: number): Promise<readonly Uuid[]> {
    const term = query.trim();
    if (!term) return [];
    const pattern = `%${escapeLike(term)}%`;
    const applicationMatch = or(
      ilike(groupApplications.vehicleType, pattern),
      ilike(groupApplications.make, pattern),
      ilike(groupApplications.model, pattern),
      ilike(groupApplications.engine, pattern),
      ilike(groupApplications.notes, pattern),
      sql<boolean>`cast(${groupApplications.yearFrom} as text) = ${term}`,
      sql<boolean>`cast(${groupApplications.yearTo} as text) = ${term}`,
    );
    if (!applicationMatch) return [];

    const rows = await this.db
      .selectDistinct({ productId: equivalenceGroupMembers.productId })
      .from(groupApplications)
      .innerJoin(
        equivalenceGroupMembers,
        eq(equivalenceGroupMembers.groupId, groupApplications.groupId),
      )
      .where(and(eq(groupApplications.active, true), applicationMatch))
      .orderBy(equivalenceGroupMembers.productId)
      .limit(limit);

    return rows.map((row) => row.productId as Uuid);
  }
}
