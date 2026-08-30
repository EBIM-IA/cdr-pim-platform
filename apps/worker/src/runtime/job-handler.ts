import type { JobEnvelope, JobType } from '@cdr/contracts';
import type { Logger } from '@cdr/shared';

export interface JobContext {
  readonly logger: Logger;
  /** Delivery attempt reported by the broker, starting at 1. */
  readonly attempt: number;
}

/**
 * Contract every background job implements.
 *
 * `handle` MUST be idempotent: SQS guarantees at-least-once delivery, so a handler will
 * eventually see the same `idempotencyKey` twice. Handlers that cannot be naturally
 * idempotent are responsible for recording the keys they have processed.
 */
export interface JobHandler<TPayload = unknown> {
  readonly type: JobType;
  /** Parses and narrows the untrusted payload. Throwing here means "poison message". */
  parse(payload: Record<string, unknown>): TPayload;
  handle(payload: TPayload, envelope: JobEnvelope, context: JobContext): Promise<void>;
}

/**
 * Marker for a failure that retrying cannot fix — a malformed payload, a referenced entity
 * that will never exist. The consumer acknowledges these instead of burning the retry
 * budget, so the DLQ collects genuinely stuck work rather than noise.
 */
export class PermanentJobError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'PermanentJobError';
  }
}
