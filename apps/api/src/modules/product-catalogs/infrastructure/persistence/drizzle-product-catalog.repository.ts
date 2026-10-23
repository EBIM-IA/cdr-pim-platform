import { lockFileObject } from '../../../../shared/persistence/file-object-lock';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  ConflictError,
  NotFoundError,
  isDomainError,
  DependencyUnavailableError,
} from '@cdr/shared';
import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { recordAuditWithinTransaction } from '../../../../shared/persistence/record-audit-within-transaction';
import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
import type {
  CatalogWithShares,
  ProductCatalog,
  ProductCatalogShare,
} from '../../domain/entities/product-catalog';
import type {
  CatalogMutation,
  CatalogVersion,
  CatalogMetrics,
  ProductCatalogRepositoryPort,
} from '../../domain/ports/product-catalog.port';
import { productCatalogs, productCatalogShares } from './product-catalogs.tables';

@Injectable()
export class DrizzleProductCatalogRepository implements ProductCatalogRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  private async safe<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('product-catalog-database');
    }
  }
  list(query: {
    page: number;
    pageSize: number;
    q?: string;
    includeDeleted?: boolean;
    now: Date;
  }): Promise<{ items: CatalogWithShares[]; total: number; metrics: CatalogMetrics }> {
    return this.safe(() =>
      this.db.transaction(
        async (tx) => {
          const search = query.q?.trim().replace(/[\\%_]/gu, '\\$&');
          const where = and(
            query.includeDeleted ? undefined : isNull(productCatalogs.deletedAt),
            search
              ? or(
                  ilike(productCatalogs.title, `%${search}%`),
                  ilike(productCatalogs.description, `%${search}%`),
                  ilike(productCatalogs.fileName, `%${search}%`),
                  ilike(productCatalogs.code, `%${search}%`),
                  sql`${productCatalogs.createdBy}->>'email' ILIKE ${`%${search}%`}`,
                  sql`${productCatalogs.updatedBy}->>'email' ILIKE ${`%${search}%`}`,
                )
              : undefined,
          );
          const rows = await tx
            .select()
            .from(productCatalogs)
            .where(where)
            .orderBy(desc(productCatalogs.createdAt), productCatalogs.id)
            .limit(query.pageSize)
            .offset((query.page - 1) * query.pageSize);
          const [total] = await tx.select({ count: count() }).from(productCatalogs).where(where);
          const shares = rows.length
            ? await tx
                .select()
                .from(productCatalogShares)
                .where(
                  inArray(
                    productCatalogShares.catalogId,
                    rows.map((row) => row.id),
                  ),
                )
                .orderBy(desc(productCatalogShares.createdAt), productCatalogShares.id)
            : [];
          const today = query.now.toISOString().slice(0, 10);
          const current = sql`${productCatalogs.deletedAt} IS NULL AND ${productCatalogs.validFrom} <= ${today}::date AND (${productCatalogs.validUntil} IS NULL OR ${productCatalogs.validUntil} >= ${today}::date)`;
          const [metrics] = await tx
            .select({
              catalogs: sql<number>`count(*) FILTER (WHERE ${productCatalogs.deletedAt} IS NULL)::int`,
              current: sql<number>`count(*) FILTER (WHERE ${current})::int`,
              expiring: sql<number>`count(*) FILTER (WHERE ${current} AND ${productCatalogs.validUntil} <= ${today}::date + 30)::int`,
              expired: sql<number>`count(*) FILTER (WHERE ${productCatalogs.deletedAt} IS NULL AND ${productCatalogs.validUntil} < ${today}::date)::int`,
              scheduled: sql<number>`count(*) FILTER (WHERE ${productCatalogs.deletedAt} IS NULL AND ${productCatalogs.validFrom} > ${today}::date)::int`,
              deleted: sql<number>`count(*) FILTER (WHERE ${productCatalogs.deletedAt} IS NOT NULL)::int`,
              // Explicit identifiers preserve the outer qualifier in this correlated subquery.
              // Drizzle otherwise strips table prefixes in a single-table select list.
              activeLinks: sql<number>`COALESCE(sum(CASE WHEN ${current} THEN (SELECT count(*) FROM product_catalog_shares s WHERE s.catalog_id = ${sql.identifier('product_catalogs')}.${sql.identifier('id')} AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > ${query.now.toISOString()}::timestamptz)) ELSE 0 END), 0)::int`,
            })
            .from(productCatalogs)
            .where(where);
          return {
            metrics: metrics!,
            items: rows.map((catalog) => ({
              catalog: catalogRecord(catalog),
              shares: shares.filter((share) => share.catalogId === catalog.id),
            })),
            total: total?.count ?? 0,
          };
        },
        { isolationLevel: 'repeatable read' },
      ),
    );
  }
  find(id: string): Promise<CatalogWithShares | null> {
    return this.safe(() =>
      this.db.transaction(
        async (tx) => {
          const [catalog] = await tx
            .select()
            .from(productCatalogs)
            .where(eq(productCatalogs.id, id));
          if (!catalog) return null;
          const shares = await tx
            .select()
            .from(productCatalogShares)
            .where(eq(productCatalogShares.catalogId, id))
            .orderBy(desc(productCatalogShares.createdAt), productCatalogShares.id);
          return { catalog: catalogRecord(catalog), shares };
        },
        { isolationLevel: 'repeatable read' },
      ),
    );
  }
  insert(
    catalog: ProductCatalog,
    audit: AuditEntry,
    assertObjectAvailable?: () => Promise<void>,
  ): Promise<CatalogWithShares> {
    return this.safe(() =>
      this.db.transaction(async (tx) => {
        await lockFileObject(tx, catalog.objectKey);
        await assertObjectAvailable?.();
        const { code: _code, ...values } = catalog;
        const [saved] = await tx.insert(productCatalogs).values(values).returning();
        await recordAuditWithinTransaction(tx, audit);
        return { catalog: catalogRecord(saved!), shares: [] };
      }),
    );
  }
  mutate(
    id: string,
    expected: CatalogVersion,
    change: (current: CatalogWithShares) => CatalogMutation,
    assertObjectAvailable?: () => Promise<void>,
  ): Promise<CatalogWithShares> {
    return this.safe(() =>
      this.db.transaction(async (tx) => {
        const [catalog] = await tx
          .select()
          .from(productCatalogs)
          .where(eq(productCatalogs.id, id))
          .for('update');
        if (!catalog) throw new NotFoundError('ProductCatalog', id);
        const shares = await tx
          .select()
          .from(productCatalogShares)
          .where(eq(productCatalogShares.catalogId, id))
          .for('update');
        const actual =
          expected instanceof Date
            ? catalog.updatedAt
            : shares.find((share) => share.id === expected.shareId)?.updatedAt;
        if (!actual) throw new NotFoundError('CatalogShare', 'unavailable');
        if (
          actual.getTime() !== (expected instanceof Date ? expected : expected.updatedAt).getTime()
        )
          throw new ConflictError('The catalog or share was modified by another request');
        const changed = change({ catalog: catalogRecord(catalog), shares });
        if (changed.catalog.objectKey !== catalog.objectKey)
          await lockFileObject(tx, changed.catalog.objectKey);
        await assertObjectAvailable?.();
        const { code: _code, ...catalogValues } = changed.catalog;
        await tx.update(productCatalogs).set(catalogValues).where(eq(productCatalogs.id, id));
        for (const share of changed.shares) {
          await tx
            .insert(productCatalogShares)
            .values(share)
            .onConflictDoUpdate({ target: productCatalogShares.id, set: share });
        }
        await recordAuditWithinTransaction(tx, changed.audit);
        return { catalog: changed.catalog, shares: [...changed.shares] };
      }),
    );
  }
  accessShared(
    digest: string,
    now: Date,
    visit: boolean,
    authorize: (current: CatalogWithShares, share: ProductCatalogShare) => void,
  ): Promise<{ catalog: ProductCatalog; share: ProductCatalogShare } | null> {
    return this.safe(() =>
      this.db.transaction(async (tx) => {
        const [candidate] = await tx
          .select({ catalogId: productCatalogShares.catalogId })
          .from(productCatalogShares)
          .where(eq(productCatalogShares.tokenDigest, digest));
        if (!candidate) return null;
        const [catalog] = await tx
          .select()
          .from(productCatalogs)
          .where(eq(productCatalogs.id, candidate.catalogId))
          .for('update');
        const [share] = await tx
          .select()
          .from(productCatalogShares)
          .where(eq(productCatalogShares.tokenDigest, digest))
          .for('update');
        if (!catalog || !share) return null;
        authorize({ catalog: catalogRecord(catalog), shares: [share] }, share);
        if (visit)
          await tx
            .update(productCatalogShares)
            .set({ views: share.views + 1, lastViewedAt: now })
            .where(eq(productCatalogShares.id, share.id));
        return { catalog: catalogRecord(catalog), share };
      }),
    );
  }
}

function catalogRecord(row: typeof productCatalogs.$inferSelect): ProductCatalog {
  const { sequenceNumber: _sequenceNumber, ...catalog } = row;
  return catalog;
}
