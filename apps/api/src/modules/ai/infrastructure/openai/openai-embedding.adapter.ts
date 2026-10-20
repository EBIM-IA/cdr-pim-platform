import type OpenAI from 'openai';

import type {
  EmbeddingProviderPort,
  EmbeddingResult,
} from '../../domain/ports/embedding-provider.port';
import { toDomainError } from './openai.client';

/** Maximum inputs per request. Conservative; the API limit is higher but payload-bound. */
const MAX_BATCH = 96;

export class OpenAiEmbeddingAdapter implements EmbeddingProviderPort {
  constructor(
    private readonly client: OpenAI,
    readonly model: string,
    readonly dimensions: number,
  ) {}

  async embed(texts: readonly string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    const results: EmbeddingResult[] = [];
    for (let offset = 0; offset < texts.length; offset += MAX_BATCH) {
      const batch = texts.slice(offset, offset + MAX_BATCH);
      try {
        const response = await this.client.embeddings.create({
          model: this.model,
          input: batch as string[],
          // Explicit: the `text-embedding-3-*` family supports Matryoshka truncation, and
          // the stored `vector(N)` column width is not negotiable at runtime.
          ...(supportsDimensionParameter(this.model) ? { dimensions: this.dimensions } : {}),
        });

        // The API guarantees ordering by `index`, but sorting makes that explicit rather
        // than assumed — a silent reordering would corrupt product/vector association.
        const ordered = [...response.data].sort((a, b) => a.index - b.index);
        if (
          ordered.length !== batch.length ||
          ordered.some((item, position) => item.index !== position)
        ) {
          throw new Error('OpenAI returned an incomplete or invalid embedding batch');
        }

        for (const item of ordered) {
          if (item.embedding.length !== this.dimensions) {
            throw new Error(
              `OpenAI returned ${item.embedding.length} dimensions; expected ${this.dimensions}`,
            );
          }
          results.push({
            vector: item.embedding,
            model: response.model,
            dimensions: item.embedding.length,
          });
        }
      } catch (error) {
        throw toDomainError(error, 'embeddings.create');
      }
    }
    return results;
  }
}

function supportsDimensionParameter(model: string): boolean {
  return /^text-embedding-3(?:-|$)/u.test(model.toLocaleLowerCase('en'));
}
