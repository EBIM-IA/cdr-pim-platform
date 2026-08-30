import { Inject, Injectable } from '@nestjs/common';
import { JobType } from '@cdr/contracts';
import { QUEUE_PORT, type QueuePort, buildJobEnvelope } from '@cdr/messaging';
import { newUuid } from '@cdr/shared';

export interface EnqueueSkeletonPingResult {
  readonly jobId: string;
  readonly messageId: string;
  readonly correlationId: string;
}

/**
 * Walking-skeleton producer.
 *
 * Its only purpose is to prove the asynchronous half of the architecture end to end:
 *
 *   HTTP -> use case -> QueuePort -> SQS (or LocalStack) -> worker -> completion log
 *
 * It is the async counterpart to `GET /products/:id` and should be deleted the moment a
 * real job takes its place.
 */
@Injectable()
export class EnqueueSkeletonPingUseCase {
  constructor(@Inject(QUEUE_PORT) private readonly queue: QueuePort) {}

  async execute(message: string): Promise<EnqueueSkeletonPingResult> {
    const envelope = buildJobEnvelope({
      type: JobType.SKELETON_PING,
      payload: { message },
      source: 'api',
      // A fresh key per request: this probe is meant to be observed on every call. A real
      // job would derive the key from business identity instead (see AI_EMBEDDING below).
      idempotencyKey: `skeleton-ping:${newUuid()}`,
    });

    const { messageId } = await this.queue.publish(envelope);

    return {
      jobId: envelope.jobId,
      messageId,
      correlationId: envelope.correlationId,
    };
  }
}
