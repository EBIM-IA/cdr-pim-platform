import { type AxSyncRequest, JobType, axBatchReceivedPayloadSchema } from '@cdr/contracts';
import { InMemoryQueueAdapter, type QueuePort } from '@cdr/messaging';
import {
  DependencyUnavailableError,
  FixedClock,
  type Logger,
  newExecutionContext,
  runWithContext,
} from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { ReceiveAxBatchUseCase } from './receive-ax-batch.use-case';

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

function run(useCase: ReceiveAxBatchUseCase, input: AxSyncRequest = batch) {
  return runWithContext(newExecutionContext(correlationId), () => useCase.execute(input));
}

describe('ReceiveAxBatchUseCase (QAS mock)', () => {
  it('answers RECIBIDO with the contractual fields and the request correlation id', async () => {
    const useCase = new ReceiveAxBatchUseCase(
      new InMemoryQueueAdapter(),
      clock,
      recordingLogger([]),
    );

    await expect(run(useCase)).resolves.toEqual({
      idLote: 'AX-20260928-000001',
      estado: 'RECIBIDO',
      registrosRecibidos: 2,
      fechaRecepcion: '2026-09-28T15:30:01.000Z',
      correlationId,
    });
  });

  it('publishes a lightweight AX_BATCH_RECEIVED job without the products', async () => {
    const queue = new InMemoryQueueAdapter();
    await run(new ReceiveAxBatchUseCase(queue, clock, recordingLogger([])));

    expect(queue.pending).toHaveLength(1);
    const [envelope] = queue.pending;
    expect(envelope).toMatchObject({
      type: JobType.AX_BATCH_RECEIVED,
      correlationId,
      idempotencyKey: 'ax-batch-received:AX-20260928-000001',
      source: 'api:ax-integration',
    });
    const payload = axBatchReceivedPayloadSchema.parse(envelope?.payload);
    expect(payload).toEqual({
      idLote: 'AX-20260928-000001',
      sistemaOrigen: 'SISMETIC_AX',
      registrosRecibidos: 2,
      fechaEnvio: '2026-09-28T10:30:00-05:00',
      fechaRecepcion: '2026-09-28T15:30:01.000Z',
      requestHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
    expect(JSON.stringify(envelope)).not.toContain('000123');
    expect(JSON.stringify(envelope)).not.toContain('codigoArticulo');
  });

  it('sends a null sistemaOrigen when the sender omitted it', async () => {
    const queue = new InMemoryQueueAdapter();
    const { sistemaOrigen: _omitted, ...withoutSource } = batch;
    await run(new ReceiveAxBatchUseCase(queue, clock, recordingLogger([])), withoutSource);
    expect(queue.pending[0]?.payload).toMatchObject({ sistemaOrigen: null });
  });

  it('derives the same request hash whatever the key order', async () => {
    const queue = new InMemoryQueueAdapter();
    const useCase = new ReceiveAxBatchUseCase(queue, clock, recordingLogger([]));
    await run(useCase);
    const reordered = {
      productos: batch.productos,
      sistemaOrigen: batch.sistemaOrigen,
      fechaEnvio: batch.fechaEnvio,
      idLote: batch.idLote,
    } as AxSyncRequest;
    await run(useCase, reordered);
    expect(queue.pending[0]?.payload.requestHash).toBe(queue.pending[1]?.payload.requestHash);
  });

  it('does not deduplicate a re-sent idLote (IDEMPOTENCY_NOT_IMPLEMENTED_YET)', async () => {
    const queue = new InMemoryQueueAdapter();
    const useCase = new ReceiveAxBatchUseCase(queue, clock, recordingLogger([]));
    await run(useCase);
    await run(useCase);
    expect(queue.pending).toHaveLength(2);
  });

  it('propagates a queue failure so the caller gets 503, never a 202', async () => {
    const failing: QueuePort = {
      publish: () => Promise.reject(new DependencyUnavailableError('sqs:sendMessage')),
      publishBatch: () => Promise.reject(new DependencyUnavailableError('sqs:sendMessageBatch')),
    };
    await expect(
      run(new ReceiveAxBatchUseCase(failing, clock, recordingLogger([]))),
    ).rejects.toBeInstanceOf(DependencyUnavailableError);
  });

  it('warns about missing tipoAplicacion / marca by position, never logging product values', async () => {
    const entries: LogEntry[] = [];
    await run(
      new ReceiveAxBatchUseCase(new InMemoryQueueAdapter(), clock, recordingLogger(entries)),
    );

    const warning = entries.find((entry) => entry.level === 'warn');
    expect(warning?.meta).toMatchObject({
      idLote: 'AX-20260928-000001',
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
});
