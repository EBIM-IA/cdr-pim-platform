import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  type AxSyncAcceptedResponse,
  type AxSyncBatchStatusResponse,
  type AxSyncRequest,
} from '@cdr/contracts';
import { NotFoundError, getCorrelationId, type Clock, type Logger, newUuid } from '@cdr/shared';

import { CLOCK, LOGGER } from '../../../shared/tokens';
import { canonicalJson, contractWarnings } from '../domain/ax-batch-reception';
import {
  AX_INBOX_REPOSITORY,
  type AxInboxReceipt,
  type AxInboxRepositoryPort,
} from '../domain/ports/ax-inbox.repository.port';

/** Receives an AX batch into the durable inbox without applying unapproved catalog rules. */
@Injectable()
export class ReceiveAxBatchUseCase {
  constructor(
    @Inject(AX_INBOX_REPOSITORY) private readonly inbox: AxInboxRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async execute(batch: AxSyncRequest): Promise<AxSyncAcceptedResponse> {
    const receivedAt = this.clock.now();
    const correlationId = getCorrelationId() ?? newUuid();
    const requestHash = hashRequest(batch);
    const warnings = contractWarnings(batch.productos);

    const receipt = await this.inbox.receive({
      id: newUuid(),
      recordIds: batch.productos.map(() => newUuid()),
      idLote: batch.idLote,
      fechaEnvio: new Date(batch.fechaEnvio),
      sistemaOrigen: batch.sistemaOrigen ?? null,
      productos: batch.productos,
      requestHash,
      receivedAt,
      correlationId,
    });

    if (warnings.length > 0) {
      this.logger.warn('AX batch stored with contract warnings', {
        idLote: batch.idLote,
        registrosRecibidos: batch.productos.length,
        warnings,
        integrationDirection: 'ax-to-pim',
      });
    }
    this.logger.info('AX batch stored in durable inbox', {
      idLote: receipt.idLote,
      registrosRecibidos: receipt.recordCount,
      requestHash: receipt.requestHash,
      integrationDirection: 'ax-to-pim',
    });

    return acceptedResponse(receipt, correlationId);
  }
}

@Injectable()
export class GetAxBatchStatusUseCase {
  constructor(@Inject(AX_INBOX_REPOSITORY) private readonly inbox: AxInboxRepositoryPort) {}

  async execute(idLote: string): Promise<AxSyncBatchStatusResponse> {
    const receipt = await this.inbox.findByExternalId(idLote);
    if (!receipt) throw new NotFoundError('AX inbound batch', idLote);
    return {
      ...acceptedResponse(receipt, getCorrelationId() ?? newUuid()),
      fechaEnvio: receipt.fechaEnvio.toISOString(),
      sistemaOrigen: receipt.sistemaOrigen,
      requestHash: receipt.requestHash,
    };
  }
}

function acceptedResponse(receipt: AxInboxReceipt, correlationId: string): AxSyncAcceptedResponse {
  return {
    idLote: receipt.idLote,
    estado: 'RECIBIDO',
    registrosRecibidos: receipt.recordCount,
    fechaRecepcion: receipt.receivedAt.toISOString(),
    correlationId,
  };
}

function hashRequest(batch: AxSyncRequest): string {
  return `sha256:${createHash('sha256').update(canonicalJson(batch)).digest('hex')}`;
}
