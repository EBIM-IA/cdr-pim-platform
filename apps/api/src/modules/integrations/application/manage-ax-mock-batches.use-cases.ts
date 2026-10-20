import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { type Clock, ConflictError, NotFoundError, getCorrelationId, newUuid } from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import {
  AxMockBatchStatus,
  AxMockRecordStatus,
  type AxMockRecordResult,
  type StoredAxMockBatch,
} from '../domain/entities/ax-mock-batch';
import {
  AX_MOCK_BATCH_STORE,
  type AxMockBatchStorePort,
} from '../domain/ports/ax-mock-batch-store.port';

export interface AxMockCanonicalRecord {
  readonly recordId?: string | null;
  readonly codigoArticulo?: string | null;
  readonly codigoProveedor?: string | null;
  readonly codigoUnificador?: string | null;
  readonly linea?: string | null;
  readonly tipoAplicacion?: string | null;
  readonly marca?: string | null;
  readonly categoriaNivel1?: string | null;
  readonly categoriaNivel2?: string | null;
  readonly categoriaNivel3?: string | null;
  readonly modifiedAt?: string | null;
}

export interface ReceiveAxMockBatchCommand {
  readonly schemaVersion: 'draft-0';
  readonly batchId: string;
  readonly sentAt: string;
  readonly records: readonly AxMockCanonicalRecord[];
}

@Injectable()
export class ReceiveAxMockBatchUseCase {
  constructor(
    @Inject(AX_MOCK_BATCH_STORE) private readonly store: AxMockBatchStorePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    command: ReceiveAxMockBatchCommand,
    idempotencyKey: string,
  ): Promise<StoredAxMockBatch> {
    const payloadHash = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    const records = command.records.map(validateRecord);
    const accepted = records.filter(
      (record) => record.status === AxMockRecordStatus.Accepted,
    ).length;
    const warnings = records.filter(
      (record) => record.status === AxMockRecordStatus.Warning,
    ).length;
    const rejected = records.filter(
      (record) => record.status === AxMockRecordStatus.Rejected,
    ).length;
    const batch: StoredAxMockBatch = {
      schemaVersion: command.schemaVersion,
      batchId: command.batchId,
      sentAt: command.sentAt,
      receivedAt: this.clock.now().toISOString(),
      status:
        rejected === records.length
          ? AxMockBatchStatus.Rejected
          : rejected > 0
            ? AxMockBatchStatus.PartiallyProcessed
            : AxMockBatchStatus.Processed,
      totals: { received: records.length, accepted, warnings, rejected },
      records,
      correlationId: getCorrelationId() ?? newUuid(),
      idempotencyKey,
      payloadHash,
    };

    const stored = await this.store.saveIfAbsent(batch);
    if (stored.kind === 'created') return stored.batch;
    if (stored.kind === 'idempotency_exists') {
      if (stored.batch.payloadHash === payloadHash) return stored.batch;
      throw new ConflictError('The idempotency key was already used with a different payload', {
        conflict: 'idempotency-key',
      });
    }
    throw new ConflictError('The AX mock batch identifier already exists', {
      conflict: 'batch-id',
      batchId: command.batchId,
    });
  }
}

@Injectable()
export class GetAxMockBatchUseCase {
  constructor(@Inject(AX_MOCK_BATCH_STORE) private readonly store: AxMockBatchStorePort) {}

  async execute(batchId: string): Promise<StoredAxMockBatch> {
    const batch = await this.store.findByBatchId(batchId);
    if (!batch) throw new NotFoundError('AX mock batch', batchId);
    return batch;
  }
}

function validateRecord(record: AxMockCanonicalRecord, index: number): AxMockRecordResult {
  const codigoArticulo = record.codigoArticulo?.trim() || null;
  const issues = codigoArticulo
    ? []
    : [
        {
          code: 'FIELD_REQUIRED',
          severity: 'error' as const,
          field: 'codigoArticulo',
          message: 'codigoArticulo is required to identify an ERP-owned SKU',
          retryable: false,
        },
      ];
  return {
    rowNumber: index + 1,
    recordId: record.recordId?.trim() || null,
    codigoArticulo,
    status: issues.length > 0 ? AxMockRecordStatus.Rejected : AxMockRecordStatus.Accepted,
    issues,
  };
}
