/**
 * Outbound port for generating or rewriting product copy (B2C descriptions, titles,
 * bullet points). The prompt is expressed in domain terms; the adapter decides how to
 * express it to a particular vendor.
 */
export interface GenerationRequest {
  readonly instruction: string;
  readonly input: string;
  readonly maxOutputTokens?: number;
  /** 0 = deterministic. Defaults are chosen per use case, never per vendor. */
  readonly temperature?: number;
}

export interface GenerationResult {
  readonly text: string;
  readonly model: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface TextGenerationProviderPort {
  readonly model: string;
  generate(request: GenerationRequest): Promise<GenerationResult>;
}

export const TEXT_GENERATION_PROVIDER = Symbol('TextGenerationProviderPort');
