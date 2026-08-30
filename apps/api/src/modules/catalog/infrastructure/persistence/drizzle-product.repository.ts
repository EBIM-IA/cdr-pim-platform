import { Inject, Injectable } from '@nestjs/common';
import { type Uuid, newUuid } from '@cdr/shared';
import { count, eq, inArray } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { Product, type ProductStatus } from '../../domain/entities/product';
import { ProductIdentifier } from '../../domain/entities/product-identifier';
import type { ProductRepositoryPort } from '../../domain/ports/product-repository.port';
import {
  type ProductIdentifierRow,
  type ProductRow,
  productIdentifiers,
  products,
} from './catalog.tables';

/**
 * PostgreSQL adapter for `ProductRepositoryPort`.
 *
 * This is the ONLY class in the catalog module that knows SQL exists. Everything it
 * returns is a domain aggregate; everything it accepts is a domain aggregate. Row shapes
 * never escape this file.
 */
@Injectable()
export class DrizzleProductRepository implements ProductRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(id: Uuid): Promise<Product | null> {
    const rows = await this.db.select().from(products).where(eq(products.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.toDomain(row, await this.loadIdentifiers([row.id]));
  }

  async findBySku(sku: string): Promise<Product | null> {
    const rows = await this.db.select().from(products).where(eq(products.sku, sku)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.toDomain(row, await this.loadIdentifiers([row.id]));
  }

  async list(options: { page: number; pageSize: number }): Promise<{
    items: Product[];
    total: number;
  }> {
    const offset = (options.page - 1) * options.pageSize;
    const rows = await this.db
      .select()
      .from(products)
      .orderBy(products.sku)
      .limit(options.pageSize)
      .offset(offset);

    const totals = await this.db.select({ value: count() }).from(products);
    const identifiers = await this.loadIdentifiers(rows.map((row) => row.id));

    return {
      items: rows.map((row) => this.toDomain(row, identifiers)),
      total: totals[0]?.value ?? 0,
    };
  }

  /**
   * Whole-aggregate upsert.
   *
   * Identifiers are replaced rather than diffed: the set is small and bounded, and a
   * delete+insert inside one transaction is far easier to reason about than a three-way
   * merge. Revisit only if a product ever carries hundreds of codes.
   */
  async save(product: Product): Promise<void> {
    const snapshot = product.toSnapshot();

    await this.db.transaction(async (tx) => {
      await tx
        .insert(products)
        .values({
          id: snapshot.id,
          sku: snapshot.sku,
          name: snapshot.name,
          description: snapshot.description,
          brand: snapshot.brand,
          status: snapshot.status,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
        })
        .onConflictDoUpdate({
          target: products.id,
          set: {
            sku: snapshot.sku,
            name: snapshot.name,
            description: snapshot.description,
            brand: snapshot.brand,
            status: snapshot.status,
            updatedAt: snapshot.updatedAt,
          },
        });

      await tx.delete(productIdentifiers).where(eq(productIdentifiers.productId, snapshot.id));
      if (snapshot.identifiers.length > 0) {
        await tx.insert(productIdentifiers).values(
          snapshot.identifiers.map((identifier) => ({
            id: newUuid(),
            productId: snapshot.id,
            type: identifier.type,
            value: identifier.value,
          })),
        );
      }
    });
  }

  private async loadIdentifiers(productIds: string[]): Promise<ProductIdentifierRow[]> {
    if (productIds.length === 0) return [];
    return this.db
      .select()
      .from(productIdentifiers)
      .where(inArray(productIdentifiers.productId, productIds));
  }

  private toDomain(row: ProductRow, identifierRows: ProductIdentifierRow[]): Product {
    return Product.rehydrate({
      id: row.id as Uuid,
      sku: row.sku,
      name: row.name,
      description: row.description,
      brand: row.brand,
      status: row.status as ProductStatus,
      identifiers: identifierRows
        .filter((identifier) => identifier.productId === row.id)
        .map((identifier) => ProductIdentifier.create(identifier.type, identifier.value)),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
