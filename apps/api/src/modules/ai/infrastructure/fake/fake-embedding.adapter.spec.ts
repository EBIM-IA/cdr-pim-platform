import { describe, expect, it } from 'vitest';

import { FakeEmbeddingAdapter } from './fake-embedding.adapter';

const adapter = new FakeEmbeddingAdapter('fake-embedding-v1', 1536);

function cosine(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + value * (b[index] as number), 0);
}

describe('FakeEmbeddingAdapter', () => {
  it('produces vectors of the configured width', async () => {
    const [result] = await adapter.embed(['rodamiento 6205-2RS']);
    expect(result?.vector).toHaveLength(1536);
    expect(result?.dimensions).toBe(1536);
  });

  it('is deterministic, so tests and cached hashes stay stable', async () => {
    const [first] = await adapter.embed(['rodamiento rígido de bolas']);
    const [second] = await adapter.embed(['rodamiento rígido de bolas']);
    expect(first?.vector).toEqual(second?.vector);
  });

  it('returns unit vectors, as cosine similarity assumes', async () => {
    const [result] = await adapter.embed(['retén de aceite']);
    expect(cosine(result!.vector, result!.vector)).toBeCloseTo(1, 6);
  });

  it('places related text closer than unrelated text', async () => {
    const [query, related, unrelated] = await adapter.embed([
      'rodamiento rigido de bolas 6205',
      'rodamiento rigido de bolas 6205 2RS sellado',
      'aceite lubricante sintetico para caja de cambios',
    ]);

    expect(cosine(query!.vector, related!.vector)).toBeGreaterThan(
      cosine(query!.vector, unrelated!.vector),
    );
  });

  it('never emits a zero vector, which pgvector rejects under cosine distance', async () => {
    const [result] = await adapter.embed(['']);
    expect(result!.vector.some((value) => value !== 0)).toBe(true);
  });
});
