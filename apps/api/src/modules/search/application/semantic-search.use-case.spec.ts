import type { Uuid } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { FakeEmbeddingAdapter } from '../../ai/infrastructure/fake/fake-embedding.adapter';
import type { ProductSearchReadModelPort } from '../domain/ports/product-search-read-model.port';
import type {
  ProductVectorIndexPort,
  UpsertVectorCommand,
  VectorSearchHit,
} from '../domain/ports/product-vector-index.port';
import { SemanticSearchUseCase } from './semantic-search.use-case';

class RecordingVectorIndex implements ProductVectorIndexPort {
  lastQuery: { vector: number[]; model: string; limit: number } | null = null;

  constructor(private readonly hits: VectorSearchHit[] = []) {}

  async upsert(_command: UpsertVectorCommand): Promise<void> {}
  async currentSourceHash(): Promise<string | null> {
    return null;
  }
  async searchSimilar(input: { vector: number[]; model: string; limit: number }) {
    this.lastQuery = input;
    return this.hits;
  }
}

describe('SemanticSearchUseCase', () => {
  it('queries the index with the same model that produced the query vector', async () => {
    const index = new RecordingVectorIndex([
      {
        productId: '11111111-1111-4111-8111-111111111111' as Uuid,
        sku: '6205-2RS',
        name: 'Rodamiento',
        score: 0.92,
      },
    ]);
    const deterministic: ProductSearchReadModelPort = {
      findDeterministic: async () => [],
      documentParts: async () => [],
    };
    const useCase = new SemanticSearchUseCase(new FakeEmbeddingAdapter(), index, deterministic);

    const result = await useCase.execute('rodamiento sellado', 5, ['VENTAS']);

    expect(index.lastQuery?.model).toBe('fake-embedding-v1');
    expect(index.lastQuery?.vector).toHaveLength(1536);
    expect(index.lastQuery?.limit).toBe(5);
    expect(result.hits[0]?.score).toBe(0.92);
  });

  it('keeps deterministic catalogue hits when the embedding index is unavailable', async () => {
    const index = new RecordingVectorIndex();
    index.searchSimilar = async () => {
      throw new Error('pgvector unavailable');
    };
    const exact: VectorSearchHit = {
      productId: '22222222-2222-4222-8222-222222222222' as Uuid,
      sku: 'D1672',
      name: 'Pastilla de freno',
      score: 1,
    };
    const deterministic: ProductSearchReadModelPort = {
      findDeterministic: async () => [exact],
      documentParts: async () => [],
    };
    const useCase = new SemanticSearchUseCase(new FakeEmbeddingAdapter(), index, deterministic);

    await expect(useCase.execute('D1672', 10, ['VENTAS'])).resolves.toMatchObject({
      model: 'fake-embedding-v1',
      dimensions: 1536,
      hits: [exact],
    });
  });

  it('keeps semantic hits when a deterministic source is temporarily unavailable', async () => {
    const semantic: VectorSearchHit = {
      productId: '33333333-3333-4333-8333-333333333333' as Uuid,
      sku: 'RET-045',
      name: 'Retén 45 mm',
      score: 0.83,
    };
    const deterministic: ProductSearchReadModelPort = {
      findDeterministic: async () => {
        throw new Error('catalogue projection unavailable');
      },
      documentParts: async () => [],
    };
    const useCase = new SemanticSearchUseCase(
      new FakeEmbeddingAdapter(),
      new RecordingVectorIndex([semantic]),
      deterministic,
    );

    await expect(useCase.execute('reten', 10, ['VENTAS'])).resolves.toMatchObject({
      hits: [semantic],
    });
  });
});
