import type { Uuid } from '@cdr/shared';

import type { Product } from '../entities/product';

/**
 * Outbound port for catalog persistence.
 *
 * Owned by the DOMAIN, implemented by INFRASTRUCTURE. The interface speaks only in terms
 * of domain types — no rows, no Drizzle, no SQL — so swapping PostgreSQL for anything else
 * is an adapter change, not a domain change.
 *
 * Deliberately narrow: methods are added when a use case needs them, never speculatively.
 */
export interface ProductRepositoryPort {
  findById(id: Uuid): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  /** Insert-or-update of the whole aggregate, including its identifiers. */
  save(product: Product): Promise<void>;
  list(options: { page: number; pageSize: number }): Promise<{ items: Product[]; total: number }>;
}

/** Nest DI token. Lives beside the port so adapters and modules cannot invent their own. */
export const PRODUCT_REPOSITORY = Symbol('ProductRepositoryPort');
