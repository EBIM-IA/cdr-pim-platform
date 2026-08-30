import type { JobEnvelope } from '@cdr/contracts';

/**
 * Outbound port for publishing asynchronous work.
 *
 * Named after the capability, not after SQS. It is shared by `apps/api` (producer) and
 * `apps/worker` (consumer) so both sides agree on the envelope and neither imports the
 * AWS SDK outside an adapter. Redis is deliberately absent from this platform (ADR-006).
 */
export interface PublishResult {
  readonly messageId: string;
}

export interface QueuePort {
  publish(envelope: JobEnvelope): Promise<PublishResult>;
  publishBatch(envelopes: readonly JobEnvelope[]): Promise<PublishResult[]>;
}

/** A message as handed to a consumer, plus the broker handle needed to settle it. */
export interface ReceivedMessage {
  readonly envelope: JobEnvelope;
  /** Opaque broker token (an SQS receipt handle). Never interpreted by a handler. */
  readonly receiptHandle: string;
  /** Delivery attempt number reported by the broker, starting at 1. */
  readonly approximateReceiveCount: number;
}

export interface ReceiveOptions {
  readonly maxMessages: number;
  readonly waitTimeSeconds: number;
  readonly visibilityTimeoutSeconds: number;
}

export interface QueueConsumerPort {
  receive(options: ReceiveOptions): Promise<ReceivedMessage[]>;
  /** Permanently removes the message. Only after the handler has fully succeeded. */
  acknowledge(message: ReceivedMessage): Promise<void>;
  /**
   * Returns the message for redelivery after `delaySeconds`.
   *
   * There is intentionally no `moveToDeadLetter` method: the DLQ is driven by the queue's
   * redrive policy (`maxReceiveCount`, declared in Terraform), which is the only place that
   * can enforce it consistently across every consumer.
   */
  release(message: ReceivedMessage, delaySeconds: number): Promise<void>;
}

export const QUEUE_PORT = Symbol('QueuePort');
export const QUEUE_CONSUMER_PORT = Symbol('QueueConsumerPort');
