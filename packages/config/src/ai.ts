import { z } from 'zod';

/**
 * AI configuration is entirely data-driven — no model name is ever hardcoded in the
 * application. Each capability is opted in independently: enabling embeddings must never
 * silently send commercial text or private documents to an external provider.
 */
export const aiProviderSchema = z.enum(['openai', 'fake']);
export type AiProvider = z.infer<typeof aiProviderSchema>;

export interface AiCapabilityProviderConfig {
  readonly AI_PROVIDER: AiProvider;
  readonly AI_EMBEDDING_PROVIDER?: AiProvider;
  readonly AI_GENERATION_PROVIDER?: AiProvider;
  readonly AI_DOCUMENT_EXTRACTION_PROVIDER?: AiProvider;
}

/**
 * `AI_PROVIDER` is a deprecated compatibility alias for embeddings only. Historically it
 * selected every AI adapter; retaining that behaviour would make an embeddings-only opt-in
 * upload private supplier documents. Generation and extraction therefore stay fake unless
 * their capability-specific variables are explicitly enabled.
 */
export function resolveAiCapabilityProviders(env: AiCapabilityProviderConfig): Readonly<{
  embeddings: AiProvider;
  generation: AiProvider;
  documentExtraction: AiProvider;
}> {
  return {
    embeddings: env.AI_EMBEDDING_PROVIDER ?? env.AI_PROVIDER,
    generation: env.AI_GENERATION_PROVIDER ?? 'fake',
    documentExtraction: env.AI_DOCUMENT_EXTRACTION_PROVIDER ?? 'fake',
  };
}

export const aiEnvSchema = z.object({
  /** @deprecated Compatibility alias for AI_EMBEDDING_PROVIDER only. */
  AI_PROVIDER: aiProviderSchema.default('fake'),
  AI_EMBEDDING_PROVIDER: aiProviderSchema.optional(),
  AI_GENERATION_PROVIDER: aiProviderSchema.optional(),
  AI_DOCUMENT_EXTRACTION_PROVIDER: aiProviderSchema.optional(),
  AI_GENERATION_MODEL: z.string().default('gpt-6-luna'),
  AI_DOCUMENT_EXTRACTION_MODEL: z.string().default('gpt-6-luna'),
  AI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  /**
   * MUST match the `vector(N)` column width in the database. Changing it is a migration
   * plus a full re-embedding — see `docs/architecture/AI_ARCHITECTURE.md`.
   */
  AI_EMBEDDING_DIMENSIONS: z.coerce
    .number()
    .int()
    .refine((dimensions) => dimensions === 1536, {
      message: 'must be 1536 while the product_embeddings column is vector(1536)',
    })
    .default(1536),
  /** Private evidence sent to document AI is intentionally stricter than the 20 MB asset cap. */
  AI_DOCUMENT_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(10 * 1_024 * 1_024)
    .default(5 * 1_024 * 1_024),
  /** Never committed. Injected from the local environment or AWS Secrets Manager. */
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  /** Must remain below the web BFF's 45 second interactive deadline. */
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(35_000).default(25_000),
  OPENAI_MAX_RETRIES: z.coerce.number().int().min(0).max(1).default(0),
});
