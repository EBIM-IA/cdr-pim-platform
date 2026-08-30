import { JobType, type JobEnvelope, skeletonPingPayloadSchema } from '@cdr/contracts';

import type { JobContext, JobHandler } from '../runtime/job-handler';
import { PermanentJobError } from '../runtime/job-handler';

export type SkeletonPingPayload = { message: string; productId?: string };

/**
 * Walking-skeleton handler.
 *
 * Its whole job is to prove the asynchronous path works end to end and to demonstrate the
 * handler contract — parse, act, log. Delete it once a real job exists.
 */
export class SkeletonPingHandler implements JobHandler<SkeletonPingPayload> {
  readonly type = JobType.SKELETON_PING;

  parse(payload: Record<string, unknown>): SkeletonPingPayload {
    const result = skeletonPingPayloadSchema.safeParse(payload);
    if (!result.success) {
      // A payload that does not match the contract will never match it on a retry.
      throw new PermanentJobError('SKELETON_PING payload does not match its contract', {
        issues: result.error.issues.map((issue) => issue.message),
      });
    }
    return result.data;
  }

  async handle(
    payload: SkeletonPingPayload,
    envelope: JobEnvelope,
    context: JobContext,
  ): Promise<void> {
    context.logger.info('SKELETON_PING processed', {
      receivedMessage: payload.message,
      publishedBy: envelope.source,
      // Latency from publication to processing: the first number worth watching when the
      // queue starts backing up.
      queueLatencyMs: Date.now() - new Date(envelope.occurredAt).getTime(),
    });
  }
}
