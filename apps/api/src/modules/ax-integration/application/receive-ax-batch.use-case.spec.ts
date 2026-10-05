import type { AxSyncRequest } from '@cdr/contracts';
import {
  ConflictError,
  FixedClock,
  type Logger,
  newExecutionContext,
  runWithContext,
} from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import type {
  AxInboxBatch,
  AxInboxReceipt,
  AxInboxRepositoryPort,
} from '../domain/ports/ax-inbox.repository.port';
import { GetAxBatchStatusUseCase, ReceiveAxBatchUseCase } from './receive-ax-batch.use-case';

class MemoryInbox implements AxInboxRepositoryPort {
  received: AxInboxBatch[] = [];

  async receive(batch: AxInboxBatch): Promise<AxInboxReceipt> {
    const existing = this.received.find((item) => item.idLote === batch.idLote);
    if (existing) {
      if (existing.requestHash !== batch.requestHash) throw new ConflictError('different payload');
      return receipt(existing);
    }
    this.received.push(batch);
    return receipt(batch);
  }

  async findByExternalId(idLote: string): Promise<AxInboxReceipt | null> {
    const batch = this.received.find((item) => item.idLote === idLote);
    return batch ? receipt(batch) : null;
  }
}

const batch: AxSyncRequest = {
  idLote: 'AX-20260928-000001',
  fechaEnvio: '2026-09-28T10:30:00-05:00',
  sistemaOrigen: 'SISMETIC_AX',
  productos: [
    {
      codigoArticulo: '000123',
      codigoProveedor: 'PRV-SECRETO-1',
      codigoLinea: 'RODAMIENTOS',
      tipoAplicacion: 'AUTOMOTRIZ',
      marca: 'SKF',
    },
    { codigoArticulo: '000456', codigoProveedor: 'PRV-2', codigoLinea: 'SELLOS' },
  ],
};

const clock = new FixedClock(new Date('2026-09-28T15:30:01.000Z'));
const correlationId = '22222222-2222-4222-8222-222222222222';

interface LogEntry {
  level: string;
  message: string;
  meta?: Record<string, unknown>;
}

function recordingLogger(entries: LogEntry[]): Logger {
  const logger: Logger = {
    debug: (message, meta) => entries.push({ level: 'debug', message, meta }),
    info: (message, meta) => entries.push({ level: 'info', message, meta }),
    warn: (message, meta) => entries.push({ level: 'warn', message, meta }),
    error: (message, meta) => entries.push({ level: 'error', message, meta }),
    child: () => logger,
  };
  return logger;
}

function execute(useCase: ReceiveAxBatchUseCase, input: AxSyncRequest = batch) {
  return runWithContext(newExecutionContext(correlationId), () => useCase.execute(input));
}

describe('ReceiveAxBatchUseCase', () => {
  it('stores the full batch before answering RECIBIDO', async () => {
    const inbox = new MemoryInbox();
    const useCase = new ReceiveAxBatchUseCase(inbox, clock, recordingLogger([]));

    await expect(execute(useCase)).resolves.toEqual({
      idLote: batch.idLote,
      estado: 'RECIBIDO',
      registrosRecibidos: 2,
      fechaRecepcion: '2026-09-28T15:30:01.000Z',
      correlationId,
    });
    expect(inbox.received[0]).toMatchObject({
      idLote: batch.idLote,
      productos: batch.productos,
      requestHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
  });

  it('is idempotent when AX retries the same batch', async () => {
    const inbox = new MemoryInbox();
    const useCase = new ReceiveAxBatchUseCase(inbox, clock, recordingLogger([]));
    const first = await execute(useCase);
    const second = await execute(useCase);
    expect(second).toEqual(first);
    expect(inbox.received).toHaveLength(1);
  });

  it('rejects reuse of idLote with different content', async () => {
    const inbox = new MemoryInbox();
    const useCase = new ReceiveAxBatchUseCase(inbox, clock, recordingLogger([]));
    await execute(useCase);
    await expect(
      execute(useCase, {
        ...batch,
        productos: [{ ...batch.productos[0]!, codigoArticulo: 'DIFFERENT' }],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('logs warnings without product values', async () => {
    const entries: LogEntry[] = [];
    await execute(new ReceiveAxBatchUseCase(new MemoryInbox(), clock, recordingLogger(entries)));
    expect(entries.find((entry) => entry.level === 'warn')?.meta).toMatchObject({
      idLote: batch.idLote,
      warnings: [
        { code: 'AX_TIPO_APLICACION_MISSING', count: 1, productIndexes: [1] },
        { code: 'AX_MARCA_MISSING', count: 1, productIndexes: [1] },
      ],
    });
    const logged = JSON.stringify(entries);
    for (const value of ['000123', '000456', 'PRV-SECRETO-1', 'RODAMIENTOS', 'SKF']) {
      expect(logged).not.toContain(value);
    }
  });

  it('returns the durable reception status', async () => {
    const inbox = new MemoryInbox();
    await execute(new ReceiveAxBatchUseCase(inbox, clock, recordingLogger([])));
    await expect(new GetAxBatchStatusUseCase(inbox).execute(batch.idLote)).resolves.toMatchObject({
      idLote: batch.idLote,
      estado: 'RECIBIDO',
      fechaEnvio: '2026-09-28T15:30:00.000Z',
      sistemaOrigen: 'SISMETIC_AX',
      requestHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
  });
});

function receipt(batch: AxInboxBatch): AxInboxReceipt {
  return {
    idLote: batch.idLote,
    fechaEnvio: batch.fechaEnvio,
    sistemaOrigen: batch.sistemaOrigen,
    requestHash: batch.requestHash,
    receivedAt: batch.receivedAt,
    correlationId: batch.correlationId,
    recordCount: batch.productos.length,
  };
}
