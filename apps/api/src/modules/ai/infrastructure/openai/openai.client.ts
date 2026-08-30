import { DependencyUnavailableError } from '@cdr/shared';
import OpenAI from 'openai';

export interface OpenAiClientOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly timeoutMs: number;
}

/**
 * The one and only place in the codebase that constructs the OpenAI SDK.
 *
 * Keeping the `import OpenAI` confined to `modules/ai/infrastructure/openai` is enforced by
 * the architecture test — a use case that wants an embedding asks for `EmbeddingProviderPort`.
 */
export function createOpenAiClient(options: OpenAiClientOptions): OpenAI {
  return new OpenAI({
    apiKey: options.apiKey,
    ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
    timeout: options.timeoutMs,
    // The SDK's own retry, for connection errors and 429/5xx only.
    maxRetries: 2,
  });
}

/**
 * Normalises every vendor failure into a domain error.
 *
 * Without this, an `APIConnectionError` would leak all the way up into a use case and the
 * application layer would end up knowing which SDK we bought.
 */
export function toDomainError(error: unknown, operation: string): DependencyUnavailableError {
  return new DependencyUnavailableError(`openai:${operation}`, error);
}
