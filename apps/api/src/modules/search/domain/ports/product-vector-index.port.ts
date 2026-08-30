import type { Uuid } from '@cdr/shared';

/**
 * Outbound port for the vector index.
 *
 * Named for the *capability* (a searchable index of product vectors), not for pgvector.
 * If the index ever moves to OpenSearch or a managed vector store, only the adapter
 * changes — this interface, the use cases and the domain do not.
 */
export interface VectorSearchHit {
  readonly productId: Uuid;
  readonly sku: string;
  readonly name: string;
  /** Cosine similarity in [0,1]: 1 - cosine_distance. */
  readonly score: number;
}

export interface UpsertVectorCommand {
  readonly productId: Uuid;
  readonly model: string;
  readonly dimensions: number;
  readonly vector: number[];
  /** Hash of the exact text embedded, so unchanged products can be skipped. */
  readonly sourceHash: string;
}

export interface ProductVectorIndexPort {
  upsert(command: UpsertVectorCommand): Promise<void>;
  /** Returns the stored source hash for a (product, model) pair, or null if not indexed. */
  currentSourceHash(productId: Uuid, model: string): Promise<string | null>;
  searchSimilar(input: {
    vector: number[];
    model: string;
    limit: number;
  }): Promise<VectorSearchHit[]>;
}

export const PRODUCT_VECTOR_INDEX = Symbol('ProductVectorIndexPort');
