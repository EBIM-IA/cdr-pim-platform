import type { Uuid } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { FakeEmbeddingAdapter } from '../../ai/infrastructure/fake/fake-embedding.adapter';
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
    const useCase = new SemanticSearchUseCase(new FakeEmbeddingAdapter(), index);

    const result = await useCase.execute('rodamiento sellado', 5);

    expect(index.lastQuery?.model).toBe('fake-embedding-v1');
    expect(index.lastQuery?.vector).toHaveLength(1536);
    expect(index.lastQuery?.limit).toBe(5);
    expect(result.hits[0]?.score).toBe(0.92);
  });
});
