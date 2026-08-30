import { Inject, Injectable } from '@nestjs/common';

import {
  EMBEDDING_PROVIDER,
  type EmbeddingProviderPort,
} from '../../ai/domain/ports/embedding-provider.port';
import {
  PRODUCT_VECTOR_INDEX,
  type ProductVectorIndexPort,
  type VectorSearchHit,
} from '../domain/ports/product-vector-index.port';

export interface SemanticSearchResult {
  readonly model: string;
  readonly dimensions: number;
  readonly hits: VectorSearchHit[];
}

/**
 * Embeds the user's query with the *same* provider and model used to index the catalog,
 * then asks the vector index for the nearest products.
 *
 * Note what this use case does not contain: no SQL, no HTTP, no vendor SDK. It is two
 * port calls, and it is fully unit-testable with the fake embedding adapter.
 */
@Injectable()
export class SemanticSearchUseCase {
  constructor(
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProviderPort,
    @Inject(PRODUCT_VECTOR_INDEX) private readonly index: ProductVectorIndexPort,
  ) {}

  async execute(query: string, limit: number): Promise<SemanticSearchResult> {
    const [embedded] = await this.embeddings.embed([query]);
    if (!embedded) {
      return { model: this.embeddings.model, dimensions: this.embeddings.dimensions, hits: [] };
    }

    const hits = await this.index.searchSimilar({
      vector: embedded.vector,
      model: embedded.model,
      limit,
    });

    return { model: embedded.model, dimensions: embedded.dimensions, hits };
  }
}
