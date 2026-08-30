/**
 * Outbound port for turning text into a vector.
 *
 * Nothing here mentions OpenAI. The provider, the model and the dimensionality are all
 * data (`AI_PROVIDER`, `AI_EMBEDDING_MODEL`, `AI_EMBEDDING_DIMENSIONS`), which is what
 * makes an `AnthropicEmbeddingAdapter` — or a self-hosted one — a pure addition (ADR-007).
 */
export interface EmbeddingResult {
  readonly vector: number[];
  readonly model: string;
  readonly dimensions: number;
}

export interface EmbeddingProviderPort {
  /** Model identifier actually used, recorded alongside every stored vector. */
  readonly model: string;
  readonly dimensions: number;

  /** Batched on purpose: embedding 45k SKU one HTTP call at a time is not viable. */
  embed(texts: readonly string[]): Promise<EmbeddingResult[]>;
}

export const EMBEDDING_PROVIDER = Symbol('EmbeddingProviderPort');
