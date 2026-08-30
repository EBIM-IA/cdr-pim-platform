import { Inject, Injectable } from '@nestjs/common';
import { JobType } from '@cdr/contracts';
import { QUEUE_PORT, type QueuePort, buildJobEnvelope } from '@cdr/messaging';
import { assertUuid } from '@cdr/shared';

/**
 * Requests an asynchronous (re-)embedding of a product.
 *
 * The idempotency key is derived from business identity — product plus intent — so that a
 * duplicate SQS delivery, or two editors saving the same product within seconds of each
 * other, converge on one unit of work rather than paying the AI provider twice.
 */
@Injectable()
export class EnqueueProductEmbeddingUseCase {
  constructor(@Inject(QUEUE_PORT) private readonly queue: QueuePort) {}

  async execute(rawProductId: string, force = false): Promise<{ jobId: string }> {
    const productId = assertUuid(rawProductId, 'productId');

    const envelope = buildJobEnvelope({
      type: JobType.AI_EMBEDDING,
      payload: { productId, force },
      source: 'api',
      idempotencyKey: `ai-embedding:${productId}`,
    });

    await this.queue.publish(envelope);
    return { jobId: envelope.jobId };
  }
}
