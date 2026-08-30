import type { JobEnvelope } from '@cdr/contracts';
import type { QueueConsumerPort, ReceivedMessage } from '@cdr/messaging';
import type { Logger } from '@cdr/shared';

import type { HandlerRegistry } from './handler-registry';
import { PermanentJobError } from './job-handler';

export interface ConsumerOptions {
  readonly maxMessages: number;
  readonly waitTimeSeconds: number;
  readonly visibilityTimeoutSeconds: number;
  readonly maxHandlerAttempts: number;
  readonly retryBaseDelayMs: number;
}

export interface ConsumerMetrics {
  received: number;
  completed: number;
  failed: number;
  retried: number;
  deadLetterCandidates: number;
  unhandled: number;
}

/**
 * The polling loop.
 *
 * Failure policy, deliberately explicit:
 *
 *  - **success**            -> acknowledge (delete). The message is gone for good.
 *  - **PermanentJobError**  -> acknowledge. Retrying a malformed payload only wastes the
 *                              retry budget; the failure is logged with full context.
 *  - **transient failure**  -> release with exponential backoff so SQS redelivers. Once the
 *                              attempt count reaches `maxHandlerAttempts` the message is
 *                              logged as a DLQ candidate and left alone, so the queue's own
 *                              redrive policy (`maxReceiveCount`, set in Terraform) moves
 *                              it to the dead-letter queue. The worker never moves messages
 *                              itself — one authority for that decision, not two.
 *  - **unknown job type**   -> left untouched, same path. Almost always means the producer
 *                              was deployed before the consumer.
 */
export class JobConsumer {
  private running = false;
  private draining: Promise<void> | null = null;

  readonly metrics: ConsumerMetrics = {
    received: 0,
    completed: 0,
    failed: 0,
    retried: 0,
    deadLetterCandidates: 0,
    unhandled: 0,
  };

  constructor(
    private readonly queue: QueueConsumerPort,
    private readonly registry: HandlerRegistry,
    private readonly logger: Logger,
    private readonly options: ConsumerOptions,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.logger.info('Worker consumer started', {
      jobTypes: this.registry.registeredTypes,
      maxMessages: this.options.maxMessages,
    });

    this.draining = this.loop();
  }

  /** Stops accepting new work and waits for the current batch to settle. */
  async stop(timeoutMs: number): Promise<void> {
    this.running = false;
    if (!this.draining) return;

    await Promise.race([
      this.draining,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs).unref?.()),
    ]);
    this.logger.info('Worker consumer stopped', { metrics: this.metrics });
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const messages = await this.queue.receive({
          maxMessages: this.options.maxMessages,
          waitTimeSeconds: this.options.waitTimeSeconds,
          visibilityTimeoutSeconds: this.options.visibilityTimeoutSeconds,
        });

        this.metrics.received += messages.length;
        // Sequential on purpose: one worker task processes one job at a time, so
        // concurrency is scaled by adding ECS tasks. That keeps per-task memory, database
        // connections and AI provider rate limits predictable.
        for (const message of messages) {
          if (!this.running) break;
          await this.processOne(message);
        }
      } catch (error) {
        // A broker-level failure (e.g. SQS unreachable). Back off rather than hot-loop.
        this.logger.error('Queue polling failed', { error });
        await delay(this.options.retryBaseDelayMs * 10);
      }
    }
  }

  /** Exposed for tests: processes exactly one message with the full failure policy. */
  async processOne(message: ReceivedMessage): Promise<void> {
    const envelope = message.envelope;
    const logger = this.logger.child({
      jobId: envelope.jobId,
      jobType: envelope.type,
      correlationId: envelope.correlationId,
      idempotencyKey: envelope.idempotencyKey,
      attempt: message.approximateReceiveCount,
    });

    const handler = this.registry.resolve(envelope.type);
    if (!handler) {
      this.metrics.unhandled += 1;
      logger.error('No handler registered for job type; leaving message for the DLQ', {
        registeredTypes: this.registry.registeredTypes,
      });
      return;
    }

    logger.info('job started');
    const startedAt = Date.now();

    try {
      const payload = handler.parse(envelope.payload);
      await handler.handle(payload, envelope, {
        logger,
        attempt: message.approximateReceiveCount,
      });

      await this.queue.acknowledge(message);
      this.metrics.completed += 1;
      logger.info('job completed', { durationMs: Date.now() - startedAt });
    } catch (error) {
      this.metrics.failed += 1;
      await this.handleFailure(message, envelope, error, logger, startedAt);
    }
  }

  private async handleFailure(
    message: ReceivedMessage,
    envelope: JobEnvelope,
    error: unknown,
    logger: Logger,
    startedAt: number,
  ): Promise<void> {
    const durationMs = Date.now() - startedAt;

    if (error instanceof PermanentJobError) {
      logger.error('job failed permanently; acknowledging to avoid pointless retries', {
        durationMs,
        reason: error.message,
        details: error.details,
      });
      await this.queue.acknowledge(message);
      return;
    }

    if (message.approximateReceiveCount >= this.options.maxHandlerAttempts) {
      this.metrics.deadLetterCandidates += 1;
      logger.error('DLQ candidate: attempts exhausted, leaving message to the redrive policy', {
        durationMs,
        attempts: message.approximateReceiveCount,
        maxAttempts: this.options.maxHandlerAttempts,
        error,
      });
      return;
    }

    // Exponential backoff, capped at the SQS maximum visibility timeout of 12 hours.
    const delaySeconds = Math.min(
      43_200,
      Math.round(
        (this.options.retryBaseDelayMs * 2 ** (message.approximateReceiveCount - 1)) / 1000,
      ),
    );

    this.metrics.retried += 1;
    logger.warn('job failed; scheduling retry', {
      durationMs,
      delaySeconds,
      attempt: message.approximateReceiveCount,
      jobType: envelope.type,
      error,
    });
    await this.queue.release(message, delaySeconds);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });
}
