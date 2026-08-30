import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, type Uuid, assertUuid } from '@cdr/shared';

import {
  EMBEDDING_PROVIDER,
  type EmbeddingProviderPort,
} from '../../ai/domain/ports/embedding-provider.port';
import {
  PRODUCT_REPOSITORY,
  type ProductRepositoryPort,
} from '../../catalog/domain/ports/product-repository.port';
import {
  PRODUCT_VECTOR_INDEX,
  type ProductVectorIndexPort,
} from '../domain/ports/product-vector-index.port';

export interface IndexProductResult {
  readonly productId: Uuid;
  readonly model: string;
  readonly indexed: boolean;
  readonly reason?: 'unchanged';
}

/**
 * Computes and stores the embedding for one product.
 *
 * Cross-module access to the catalog happens through the *published port*
 * (`PRODUCT_REPOSITORY`, exported by `CatalogModule`) — never by reading the `products`
 * table from here. That rule is what keeps the modules extractable later (ADR-001).
 *
 * The `sourceHash` short-circuit is the cost control: re-running the indexer over all
 * 45k SKU only pays the provider for the products whose text actually changed.
 */
@Injectable()
export class IndexProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProviderPort,
    @Inject(PRODUCT_VECTOR_INDEX) private readonly index: ProductVectorIndexPort,
  ) {}

  async execute(rawProductId: string, force = false): Promise<IndexProductResult> {
    const productId = assertUuid(rawProductId, 'productId');
    const product = await this.products.findById(productId);
    if (!product) throw new NotFoundError('Product', rawProductId);

    const text = product.toEmbeddableText();
    const sourceHash = createHash('sha256').update(text).digest('hex');

    if (!force) {
      const stored = await this.index.currentSourceHash(productId, this.embeddings.model);
      if (stored === sourceHash) {
        return {
          productId,
          model: this.embeddings.model,
          indexed: false,
          reason: 'unchanged',
        };
      }
    }

    const [embedded] = await this.embeddings.embed([text]);
    if (!embedded) {
      return { productId, model: this.embeddings.model, indexed: false };
    }

    await this.index.upsert({
      productId,
      model: embedded.model,
      dimensions: embedded.dimensions,
      vector: embedded.vector,
      sourceHash,
    });

    return { productId, model: embedded.model, indexed: true };
  }
}
