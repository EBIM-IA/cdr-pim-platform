import { catalogCategories } from './catalog-schema.tables';
import { Inject, Injectable } from '@nestjs/common';
import {
  qualityProductChangesSchema,
  qualityCompletenessSchema,
  qualityReviewSchema,
  type QualityReviewDto,
  type QualitySourcePriorityInput,
  type QualityReviewQuery,
} from '@cdr/contracts';
import {
  ConflictError,
  DependencyUnavailableError,
  NotFoundError,
  newUuid,
  isDomainError,
} from '@cdr/shared';
import { and, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { recordAuditWithinTransaction } from '../../../../shared/persistence/record-audit-within-transaction';
import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
import type {
  QualityAttributeApplication,
  QualityGovernancePort,
} from '../../../quality/domain/ports/quality-governance.port';
import { qualityReviewItems } from '../../../quality/infrastructure/persistence/quality-governance.tables';
import { DrizzleDynamicCatalogRepository } from './drizzle-dynamic-catalog.repository';

/** UoW adapter resides beside the catalog writer so no other module accesses catalog tables. */
@Injectable()
export class DrizzleQualityGovernanceRepository implements QualityGovernancePort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async productChanges(query: { page: number; pageSize: number }) {
    try {
      const rows = await this.db.execute<{
        productId: string;
        sku: string;
        name: string;
        status: 'in_review';
        updatedAt: Date | string;
        origin: string | null;
        total: number;
      }>(sql`
        SELECT p.id AS "productId", p.sku, p.name, p.status, p.updated_at AS "updatedAt", latest.source AS origin, COUNT(*) OVER()::int AS total
        FROM products p LEFT JOIN LATERAL (
          SELECT source FROM audit_entries WHERE resource_type='product' AND resource_id=p.id::text ORDER BY occurred_at DESC, id DESC LIMIT 1
        ) latest ON TRUE WHERE p.status='in_review' ORDER BY p.updated_at DESC,p.id DESC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
      `);
      return qualityProductChangesSchema.parse({
        items: rows.map((row) => ({ ...row, updatedAt: new Date(row.updatedAt).toISOString() })),
        total: rows[0]?.total ?? 0,
      });
    } catch (error) {
      throw new DependencyUnavailableError('quality-product-changes', error);
    }
  }
  async completeness() {
    try {
      const rows = await this.db.execute<{
        kind: 'template' | 'line';
        key: string;
        label: string;
        categoryId: string | null;
        productCount: number;
        average: number;
      }>(sql`
        WITH RECURSIVE roots AS (
          SELECT id, id AS line_id, name AS line_name FROM catalog_categories WHERE parent_id IS NULL
          UNION ALL
          SELECT child.id, parent.line_id, parent.line_name FROM catalog_categories child JOIN roots parent ON child.parent_id=parent.id
        ), base AS (
          SELECT t.id AS template_id, t.name AS template_name, c.id AS category_id,
            roots.line_id, roots.line_name,
            CASE WHEN t.id IS NULL OR c.active=FALSE THEN 0 WHEN r.required=0 THEN 100 ELSE ROUND(r.completed*100.0/r.required) END AS completeness
          FROM catalog_product_readiness r LEFT JOIN attribute_templates t ON t.id=r.template_id
          LEFT JOIN catalog_categories c ON c.id=t.category_id LEFT JOIN roots ON roots.id=c.id
        )
        SELECT 'template' AS kind, COALESCE(template_id::text,'sin-plantilla') AS key,
          COALESCE(template_name,'Sin plantilla activa') AS label, category_id AS "categoryId",
          COUNT(*)::int AS "productCount", ROUND(AVG(completeness))::int AS average
        FROM base GROUP BY template_id, template_name, category_id
        UNION ALL
        SELECT 'line' AS kind, COALESCE(line_id::text,'sin-linea') AS key,
          COALESCE(line_name,'Sin línea asignada') AS label, line_id AS "categoryId",
          COUNT(*)::int AS "productCount", ROUND(AVG(completeness))::int AS average
        FROM base GROUP BY line_id, line_name ORDER BY kind, label
      `);
      return qualityCompletenessSchema.parse([...rows]);
    } catch (error) {
      throw new DependencyUnavailableError('quality-completeness', error);
    }
  }
  async updatePriority(input: QualitySourcePriorityInput, audit: AuditEntry) {
    try {
      await this.db.transaction(async (tx) => {
        const rows = await tx
          .update(catalogCategories)
          .set({ sourcePriority: input.priority, updatedAt: audit.occurredAt })
          .where(
            and(
              eq(catalogCategories.id, input.categoryId),
              eq(catalogCategories.updatedAt, new Date(input.expectedUpdatedAt)),
            ),
          )
          .returning();
        if (!rows.length)
          throw new ConflictError('La categoría cambió. Recarga antes de guardar las prioridades.');
        await recordAuditWithinTransaction(tx, audit);
      });
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('quality-source-priority', error);
    }
  }
  async list(query: QualityReviewQuery) {
    try {
      const predicates: SQL[] = [];
      if (query.kind) predicates.push(eq(qualityReviewItems.kind, query.kind));
      if (query.status) predicates.push(eq(qualityReviewItems.status, query.status));
      if (query.productId) predicates.push(eq(qualityReviewItems.productId, query.productId));
      const where = and(...predicates);
      const [rows, totals] = await Promise.all([
        this.db
          .select()
          .from(qualityReviewItems)
          .where(where)
          .orderBy(desc(qualityReviewItems.createdAt), desc(qualityReviewItems.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        this.db.select({ total: count() }).from(qualityReviewItems).where(where),
      ]);
      return {
        items: rows.map((row) => qualityReviewSchema.parse(row.data)),
        total: totals[0]?.total ?? 0,
      };
    } catch (error) {
      throw new DependencyUnavailableError('quality-governance', error);
    }
  }
  async find(id: string) {
    try {
      const [row] = await this.db
        .select()
        .from(qualityReviewItems)
        .where(eq(qualityReviewItems.id, id));
      return row ? qualityReviewSchema.parse(row.data) : null;
    } catch (error) {
      throw new DependencyUnavailableError('quality-governance', error);
    }
  }
  async create(items: readonly QualityReviewDto[], audit: AuditEntry) {
    if (!items.length) return;
    try {
      await this.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(qualityReviewItems)
          .values(items.map(values))
          .onConflictDoNothing()
          .returning({ id: qualityReviewItems.id });
        for (const [index, row] of inserted.entries()) {
          const item = items.find((candidate) => candidate.id === row.id)!;
          await recordAuditWithinTransaction(tx, {
            ...audit,
            id: index === 0 ? audit.id : newUuid(),
            resourceId: item.id,
            changes: {
              ...audit.changes,
              sku: { after: item.sku },
              attribute: { after: item.attributeKey },
              model: { after: item.model },
              candidateCount: { after: item.candidates.length },
            },
          });
        }
      });
    } catch (error) {
      throw new DependencyUnavailableError('quality-governance', error);
    }
  }
  async decide(
    item: QualityReviewDto,
    expectedVersion: number,
    audit: AuditEntry,
    application?: QualityAttributeApplication,
  ) {
    try {
      await this.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(qualityReviewItems)
          .where(eq(qualityReviewItems.id, item.id))
          .for('update');
        if (!current) throw new NotFoundError('QualityReview', item.id);
        if (current.version !== expectedVersion || current.status !== 'pending')
          throw new ConflictError('La solicitud cambió o ya fue decidida. Recarga la bandeja.');
        if (application) {
          // A nested transaction is a PostgreSQL savepoint on the SAME connection.
          // A failed review/audit write rolls back attribute changes and all replicated values.
          const catalog = new DrizzleDynamicCatalogRepository(tx as unknown as Database);
          const result = await catalog.updateAttribute({
            productId: application.productId,
            attributeKey: application.attributeKey,
            value: application.value,
            expectedVersion: application.expectedVersion,
            source: application.source,
            roles: application.roles,
            now: application.now,
            audit: { actorId: application.actorId, correlationId: application.correlationId },
          });
          if (result.kind === 'not_found')
            throw new NotFoundError('Editable product attribute', application.attributeKey);
          if (result.kind === 'version_conflict')
            throw new ConflictError(
              'El valor vigente cambió desde la propuesta. Genera una nueva revisión.',
              { actualVersion: result.actualVersion },
            );
        }
        await tx
          .update(qualityReviewItems)
          .set(values(item))
          .where(
            and(
              eq(qualityReviewItems.id, item.id),
              eq(qualityReviewItems.version, expectedVersion),
            ),
          );
        await recordAuditWithinTransaction(tx, audit);
      });
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('quality-governance', error);
    }
  }
}
function values(item: QualityReviewDto) {
  return {
    id: item.id,
    productId: item.productId,
    kind: item.kind,
    status: item.status,
    version: item.version,
    data: item,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  };
}
