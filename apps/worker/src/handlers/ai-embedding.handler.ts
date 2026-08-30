import { type JobEnvelope, JobType, aiEmbeddingPayloadSchema } from '@cdr/contracts';

import type { JobContext, JobHandler } from '../runtime/job-handler';
import { PermanentJobError } from '../runtime/job-handler';

export type AiEmbeddingPayload = { productId: string; force: boolean };

/**
 * Re-embeds one product — **NOT IMPLEMENTED**.
 *
 * The pieces it needs all exist (`IndexProductUseCase` in `apps/api`, the embedding port
 * and its adapters), but wiring them here means giving the worker its own database
 * connection and its own copy of the catalog port. That is a real design step — likely
 * extracting `packages/database` — and doing it speculatively now would add a package
 * nothing yet uses.
 *
 * Registered deliberately so the job type is *claimed*: an AI_EMBEDDING message logs a
 * clear "not implemented" instead of falling through as an unknown type, which would look
 * like a deployment mismatch.
 */
export class AiEmbeddingHandler implements JobHandler<AiEmbeddingPayload> {
  readonly type = JobType.AI_EMBEDDING;

  parse(payload: Record<string, unknown>): AiEmbeddingPayload {
    const result = aiEmbeddingPayloadSchema.safeParse(payload);
    if (!result.success) {
      throw new PermanentJobError('AI_EMBEDDING payload does not match its contract', {
        issues: result.error.issues.map((issue) => issue.message),
      });
    }
    return result.data;
  }

  async handle(
    payload: AiEmbeddingPayload,
    _envelope: JobEnvelope,
    context: JobContext,
  ): Promise<void> {
    context.logger.warn('AI_EMBEDDING handler is not implemented yet', {
      productId: payload.productId,
      force: payload.force,
      nextStep:
        'Extract packages/database, then call IndexProductUseCase from the worker. ' +
        'See docs/architecture/AI_ARCHITECTURE.md.',
    });
    throw new PermanentJobError('AI_EMBEDDING handler is not implemented', {
      productId: payload.productId,
    });
  }
}
