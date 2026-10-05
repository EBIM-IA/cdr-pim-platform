import type { Uuid } from '@cdr/shared';

import type { Product } from '../../src/modules/catalog/domain/entities/product';
import type {
  ProductListOptions,
  ProductRepositoryPort,
} from '../../src/modules/catalog/domain/ports/product-repository.port';

/**
 * Test double for `ProductRepositoryPort`.
 *
 * The existence of this file is the payoff of the hexagonal boundary: every catalog use
 * case can be tested without PostgreSQL, Docker or Drizzle.
 */
export class InMemoryProductRepository implements ProductRepositoryPort {
  private readonly store = new Map<string, Product>();

  constructor(seed: Product[] = []) {
    for (const product of seed) this.store.set(product.id, product);
  }

  async findById(id: Uuid): Promise<Product | null> {
    return this.store.get(id) ?? null;
  }

  async findBySku(sku: string): Promise<Product | null> {
    return [...this.store.values()].find((product) => product.sku === sku) ?? null;
  }

  async save(product: Product): Promise<void> {
    this.store.set(product.id, product);
  }

  async list(options: ProductListOptions): Promise<{
    items: Product[];
    total: number;
  }> {
    const search = options.q?.toLocaleLowerCase('es');
    const brand = options.brand?.toLocaleLowerCase('es');
    const all = [...this.store.values()]
      .filter((product) => {
        if (options.status && product.status !== options.status) return false;
        if (brand && product.brand?.toLocaleLowerCase('es') !== brand) return false;
        if (!search) return true;
        return [product.sku, product.name, product.description, product.brand]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLocaleLowerCase('es').includes(search));
      })
      .sort((a, b) => a.sku.localeCompare(b.sku));
    const offset = (options.page - 1) * options.pageSize;
    return { items: all.slice(offset, offset + options.pageSize), total: all.length };
  }
}
