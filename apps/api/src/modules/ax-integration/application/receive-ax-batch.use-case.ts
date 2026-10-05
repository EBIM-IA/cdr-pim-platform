import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { type AxSyncAcceptedResponse, type AxSyncRequest, JobType } from '@cdr/contracts';
import { QUEUE_PORT, type QueuePort, buildJobEnvelope } from '@cdr/messaging';
import type { Clock, Logger } from '@cdr/shared';

import { CLOCK, LOGGER } from '../../../shared/tokens';
import { canonicalJson, contractWarnings } from '../domain/ax-batch-reception';

/**
 * TEMPORARY QAS MOCK — receives an AX batch and hands a lightweight event to the worker.
 *
 *   HTTP (validated v1.1 batch) -> this use case -> QueuePort -> SQS -> worker (mock handler)
 *
 * What it deliberately does NOT do: persist the batch or any product, deduplicate a
 * re-sent idLote, or put the products on the queue (there is no database claim-check yet
 * and SQS caps a message at 256 KiB). Those belong to the next phase
 * (docs/integrations/ax/NEXT_DB_PHASE.md).
 *
 * `RECIBIDO` therefore means exactly "validated and delivered to SQS". If the publish
 * fails, the adapter raises DependencyUnavailableError and the caller gets a 503 — never a
 * 202 for an event that does not exist.
 */
@Injectable()
export class ReceiveAxBatchUseCase {
  constructor(
    @Inject(QUEUE_PORT) private readonly queue: QueuePort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async execute(batch: AxSyncRequest): Promise<AxSyncAcceptedResponse> {
    const receivedAt = this.clock.now().toISOString();
    const registrosRecibidos = batch.productos.length;
    const sistemaOrigen = batch.sistemaOrigen ?? null;
    // Technical trace only. Nothing stores it, so it is NOT an idempotency guarantee.
    const requestHash = `sha256:${createHash('sha256').update(canonicalJson(batch)).digest('hex')}`;

    const warnings = contractWarnings(batch.productos);
    if (warnings.length > 0) {
      this.logger.warn('AX batch accepted with temporary contract warnings', {
        idLote: batch.idLote,
        registrosRecibidos,
        warnings,
        integrationMode: 'mock',
      });
    }

    const envelope = buildJobEnvelope({
      type: JobType.AX_BATCH_RECEIVED,
      payload: {
        idLote: batch.idLote,
        sistemaOrigen,
        registrosRecibidos,
        fechaEnvio: batch.fechaEnvio,
        fechaRecepcion: receivedAt,
        requestHash,
      },
      source: 'api:ax-integration',
      // Shaped like a business key, but NOT enforced: nothing records it yet, so a re-sent
      // idLote produces a second job. IDEMPOTENCY_NOT_IMPLEMENTED_YET.
      idempotencyKey: `ax-batch-received:${batch.idLote}`,
    });

    const { messageId } = await this.queue.publish(envelope);

    this.logger.info('AX batch received', {
      idLote: batch.idLote,
      sistemaOrigen,
      registrosRecibidos,
      requestHash,
      jobId: envelope.jobId,
      messageId,
      integrationMode: 'mock',
    });

    return {
      idLote: batch.idLote,
      estado: 'RECIBIDO',
      registrosRecibidos,
      fechaRecepcion: receivedAt,
      correlationId: envelope.correlationId,
    };
  }
}
