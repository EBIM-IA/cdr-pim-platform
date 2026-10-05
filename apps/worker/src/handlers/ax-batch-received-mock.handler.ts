import {
  type AxBatchReceivedPayload,
  type JobEnvelope,
  JobType,
  axBatchReceivedPayloadSchema,
} from '@cdr/contracts';

import type { JobContext, JobHandler } from '../runtime/job-handler';
import { PermanentJobError } from '../runtime/job-handler';

/**
 * AX_BATCH_RECEIVED — TEMPORARY QAS MOCK.
 *
 * Proves the asynchronous half of the AX integration end to end:
 *
 *   Sismetic -> API (validated v1.1 batch) -> SQS -> this handler -> structured log -> ACK
 *
 * It is a real, registered handler, and it deliberately does nothing else: no database
 * (the worker has no DATABASE_URL, and extracting packages/database is the next phase),
 * no product update, no OpenAI, no embeddings, no call to AX. The message carries batch
 * metadata only — the products never reach the queue — so there is nothing else it could
 * do. Trivially idempotent: a redelivery logs the same line again.
 *
 * Logged fields are non-sensitive metadata: idLote, sistemaOrigen, counts, the technical
 * request hash and the correlation id (bound by the consumer).
 */
export class AxBatchReceivedMockHandler implements JobHandler<AxBatchReceivedPayload> {
  readonly type = JobType.AX_BATCH_RECEIVED;

  parse(payload: Record<string, unknown>): AxBatchReceivedPayload {
    const result = axBatchReceivedPayloadSchema.safeParse(payload);
    if (!result.success) {
      // A payload that does not match the contract never will on a retry. Paths and
      // messages only — never the offending values.
      throw new PermanentJobError('AX_BATCH_RECEIVED payload does not match its contract', {
        issues: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      });
    }
    return result.data;
  }

  async handle(
    payload: AxBatchReceivedPayload,
    envelope: JobEnvelope,
    context: JobContext,
  ): Promise<void> {
    context.logger.info('AX batch mock processed', {
      idLote: payload.idLote,
      sistemaOrigen: payload.sistemaOrigen,
      registrosRecibidos: payload.registrosRecibidos,
      requestHash: payload.requestHash,
      fechaEnvio: payload.fechaEnvio,
      fechaRecepcion: payload.fechaRecepcion,
      publishedBy: envelope.source,
      queueLatencyMs: Date.now() - new Date(envelope.occurredAt).getTime(),
      integrationMode: 'mock',
      persisted: false,
    });
  }
}
