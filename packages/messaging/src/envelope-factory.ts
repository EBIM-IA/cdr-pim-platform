import { type JobEnvelope, type JobType, jobEnvelopeSchema } from '@cdr/contracts';
import { getCorrelationId, newUuid } from '@cdr/shared';

export interface BuildEnvelopeInput {
  readonly type: JobType;
  readonly payload: Record<string, unknown>;
  readonly source: string;
  /**
   * Business key that makes redelivery safe. If two publishes describe the same intent
   * (e.g. "embed product X at revision Y") they MUST share this key.
   */
  readonly idempotencyKey: string;
  readonly correlationId?: string;
  readonly occurredAt?: Date;
}

/**
 * The single constructor for queue messages.
 *
 * Centralised so that no producer can forget the correlation id or the idempotency key —
 * the two fields that make the asynchronous side of this platform debuggable and safe.
 * The result is validated against the shared schema before it can reach a broker.
 */
export function buildJobEnvelope(input: BuildEnvelopeInput): JobEnvelope {
  return jobEnvelopeSchema.parse({
    schemaVersion: 1,
    jobId: newUuid(),
    type: input.type,
    correlationId: input.correlationId ?? getCorrelationId() ?? newUuid(),
    idempotencyKey: input.idempotencyKey,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    source: input.source,
    payload: input.payload,
  } satisfies JobEnvelope);
}
