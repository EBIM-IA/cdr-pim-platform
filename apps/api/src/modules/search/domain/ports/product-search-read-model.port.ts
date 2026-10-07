import type { Uuid } from '@cdr/shared';

import type { VectorSearchHit } from './product-vector-index.port';

/**
 * Deterministic, permission-aware projection used beside the vector index.
 *
 * The implementation composes published ports from the owning bounded contexts. Search
 * therefore does not reach into another module's tables, and a provider outage cannot make
 * exact catalogue identifiers disappear.
 */
export interface ProductSearchReadModelPort {
  findDeterministic(input: {
    readonly query: string;
    readonly roles: readonly string[];
    readonly limit: number;
  }): Promise<VectorSearchHit[]>;

  /** Extra text which is safe to put in the shared semantic index for this product. */
  documentParts(productId: Uuid): Promise<readonly string[]>;
}

export const PRODUCT_SEARCH_READ_MODEL = Symbol('ProductSearchReadModelPort');
