import { Inject, Injectable } from '@nestjs/common';
import { type Uuid } from '@cdr/shared';
import { and, eq, or, sql, type SQLWrapper } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import type { ApplicationSearchReadModelPort } from '../../domain/ports/application-search-read-model.port';
import { equivalenceGroupMembers } from '../../../equivalences/infrastructure/persistence/equivalences.tables';
import { groupApplications } from './applications.tables';

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

const SPANISH_UPPERCASE_CHARACTERS = 'ÁÉÍÓÚÜÑ';
const SPANISH_LOWERCASE_CHARACTERS = 'áéíóúüñ';

/**
 * PostgreSQL's deterministic `C` collation only folds ASCII for ILIKE. Translate the
 * Spanish uppercase characters explicitly so searches behave the same in the local
 * SQL_ASCII test database and in the UTF-8 operational database.
 */
function spanishCaseInsensitiveLike(value: SQLWrapper, pattern: string) {
  return sql<boolean>`translate(${value}, ${SPANISH_UPPERCASE_CHARACTERS}, ${SPANISH_LOWERCASE_CHARACTERS}) ilike ${pattern}`;
}

function normalizeSpanishUppercase(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[\u00c1\u00c9\u00cd\u00d3\u00da\u00dc\u00d1]/gu, (character) => {
      const index = SPANISH_UPPERCASE_CHARACTERS.indexOf(character);
      return SPANISH_LOWERCASE_CHARACTERS[index] ?? character;
    });
}

@Injectable()
export class DrizzleApplicationSearchReadModel implements ApplicationSearchReadModelPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findActiveProductIds(query: string, limit: number): Promise<readonly Uuid[]> {
    const term = query.trim();
    if (!term) return [];
    const pattern = `%${escapeLike(normalizeSpanishUppercase(term))}%`;
    const applicationMatch = or(
      spanishCaseInsensitiveLike(groupApplications.vehicleType, pattern),
      spanishCaseInsensitiveLike(groupApplications.make, pattern),
      spanishCaseInsensitiveLike(groupApplications.model, pattern),
      spanishCaseInsensitiveLike(groupApplications.bodyStyle, pattern),
      spanishCaseInsensitiveLike(groupApplications.fuel, pattern),
      spanishCaseInsensitiveLike(groupApplications.traction, pattern),
      spanishCaseInsensitiveLike(groupApplications.displacement, pattern),
      spanishCaseInsensitiveLike(groupApplications.area, pattern),
      spanishCaseInsensitiveLike(groupApplications.subarea, pattern),
      spanishCaseInsensitiveLike(groupApplications.engine, pattern),
      spanishCaseInsensitiveLike(groupApplications.notes, pattern),
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
