import { createHash } from 'node:crypto';

import type {
  EmbeddingProviderPort,
  EmbeddingResult,
} from '../../domain/ports/embedding-provider.port';

/**
 * Deterministic, offline embedding provider.
 *
 * This is what every test and every `pnpm dev` session uses by default, so the suite never
 * touches the network, never costs money and never flakes. It is *not* a stub that returns
 * zeroes: it hashes token trigrams into a fixed-width bag-of-features and L2-normalises the
 * result, so semantically overlapping strings really do land closer together under cosine
 * similarity. That is enough to prove the pgvector pipeline end to end.
 */
export class FakeEmbeddingAdapter implements EmbeddingProviderPort {
  constructor(
    readonly model = 'fake-embedding-v1',
    readonly dimensions = 1536,
  ) {}

  async embed(texts: readonly string[]): Promise<EmbeddingResult[]> {
    return texts.map((text) => ({
      vector: this.vectorFor(text),
      model: this.model,
      dimensions: this.dimensions,
    }));
  }

  private vectorFor(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const tokens = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(Boolean);

    for (const token of tokens) {
      // Whole token plus its character trigrams: gives partial credit to near-matches
      // such as "rulimán" / "rulimanes" or "6205-2RS" / "6205 2RS".
      addFeature(vector, token);
      for (let i = 0; i + 3 <= token.length; i += 1) {
        addFeature(vector, token.slice(i, i + 3));
      }
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (norm === 0) {
      // pgvector rejects a zero vector for cosine distance; anchor empty input somewhere.
      vector[0] = 1;
      return vector;
    }
    return vector.map((value) => value / norm);
  }
}

function addFeature(vector: number[], feature: string): void {
  const digest = createHash('sha1').update(feature).digest();
  const index = digest.readUInt32BE(0) % vector.length;
  // Sign from a second byte so unrelated features can cancel instead of only accumulating.
  const sign = (digest[4] as number) % 2 === 0 ? 1 : -1;
  vector[index] = (vector[index] as number) + sign;
}
