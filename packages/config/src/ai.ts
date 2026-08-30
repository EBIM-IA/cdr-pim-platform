import { z } from 'zod';

/**
 * AI configuration is entirely data-driven — no model name is ever hardcoded in the
 * application. Swapping `AI_PROVIDER` to `anthropic` must be a configuration change plus a
 * new adapter, never a change to a use case. See ADR-007.
 */
export const aiProviderSchema = z.enum(['openai', 'fake']);
export type AiProvider = z.infer<typeof aiProviderSchema>;

export const aiEnvSchema = z.object({
  AI_PROVIDER: aiProviderSchema.default('fake'),
  AI_GENERATION_MODEL: z.string().default('gpt-4o-mini'),
  AI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  /**
   * MUST match the `vector(N)` column width in the database. Changing it is a migration
   * plus a full re-embedding — see `docs/architecture/AI_ARCHITECTURE.md`.
   */
  AI_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  /** Never committed. Injected from AWS Secrets Manager in QAS/PRD. */
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});
