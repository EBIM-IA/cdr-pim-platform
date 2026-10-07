import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, type Uuid } from '@cdr/shared';
import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { CodeAffix, type CodeAffixSnapshot } from '../../domain/entities/code-affix';
import type {
  CodeAffixCriteria,
  CodeAffixMutationResult,
  CodeAffixRepositoryPort,
} from '../../domain/ports/code-affix.repository.port';
import { codeAffixes, type CodeAffixRow } from './code-affix.tables';

@Injectable()
export class DrizzleCodeAffixRepository implements CodeAffixRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(criteria: CodeAffixCriteria): Promise<CodeAffix[]> {
    const filters = [];
    if (!criteria.includeInactive) filters.push(eq(codeAffixes.active, true));
    if (criteria.kind) filters.push(eq(codeAffixes.kind, criteria.kind));
    if (criteria.status) filters.push(eq(codeAffixes.status, criteria.status));
    if (criteria.source) filters.push(eq(codeAffixes.source, criteria.source));
    if (criteria.q) {
      const query = `%${criteria.q.trim()}%`;
      filters.push(
        or(
          ilike(codeAffixes.token, query),
          ilike(codeAffixes.meaning, query),
          ilike(codeAffixes.attribute, query),
          ilike(codeAffixes.brand, query),
          ilike(codeAffixes.family, query),
        )!,
      );
    }
    const rows = await this.db
      .select()
      .from(codeAffixes)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(codeAffixes.priority), asc(codeAffixes.kind), asc(codeAffixes.token));
    return rows.map(toDomain);
  }

  async findById(id: Uuid): Promise<CodeAffix | null> {
    const [row] = await this.db.select().from(codeAffixes).where(eq(codeAffixes.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async insert(rule: CodeAffix): Promise<void> {
    try {
      await this.db.insert(codeAffixes).values(toRow(rule.toSnapshot()));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('An active code-affix rule already exists for this identity');
      }
      throw error;
    }
  }

  async save(rule: CodeAffix, expectedUpdatedAt: Date): Promise<CodeAffixMutationResult> {
    const snapshot = rule.toSnapshot();
    let updated: CodeAffixRow | undefined;
    try {
      [updated] = await this.db
        .update(codeAffixes)
        .set(toMutableRow(snapshot))
        .where(and(eq(codeAffixes.id, snapshot.id), eq(codeAffixes.updatedAt, expectedUpdatedAt)))
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('An active code-affix rule already exists for this identity');
      }
      throw error;
    }
    if (updated) return { kind: 'updated', value: toDomain(updated) };

    const [current] = await this.db
      .select({ updatedAt: codeAffixes.updatedAt })
      .from(codeAffixes)
      .where(eq(codeAffixes.id, snapshot.id))
      .limit(1);
    return current
      ? { kind: 'version_conflict', actualUpdatedAt: current.updatedAt }
      : { kind: 'not_found' };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function toDomain(row: CodeAffixRow): CodeAffix {
  return CodeAffix.rehydrate({
    id: row.id as Uuid,
    kind: row.kind as CodeAffixSnapshot['kind'],
    token: row.token,
    meaning: row.meaning,
    attribute: row.attribute,
    impliedValue: row.impliedValue,
    brand: row.brand,
    family: row.family,
    source: row.source as CodeAffixSnapshot['source'],
    confidence: row.confidence,
    status: row.status as CodeAffixSnapshot['status'],
    evidence: row.evidence,
    boreRule: row.boreRule as CodeAffixSnapshot['boreRule'],
    priority: row.priority,
    active: row.active,
    createdBy: row.createdBy,
    validatedBy: row.validatedBy,
    validatedAt: row.validatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toRow(snapshot: CodeAffixSnapshot): typeof codeAffixes.$inferInsert {
  return {
    id: snapshot.id,
    ...toMutableRow(snapshot),
    createdBy: snapshot.createdBy,
    createdAt: snapshot.createdAt,
  };
}

function toMutableRow(snapshot: CodeAffixSnapshot) {
  return {
    kind: snapshot.kind,
    token: snapshot.token,
    meaning: snapshot.meaning,
    attribute: snapshot.attribute,
    impliedValue: snapshot.impliedValue,
    brand: snapshot.brand,
    family: snapshot.family,
    source: snapshot.source,
    confidence: snapshot.confidence,
    status: snapshot.status,
    evidence: snapshot.evidence,
    boreRule: snapshot.boreRule,
    priority: snapshot.priority,
    active: snapshot.active,
    validatedBy: snapshot.validatedBy,
    validatedAt: snapshot.validatedAt,
    updatedAt: snapshot.updatedAt,
  };
}
