import { ConflictError, FixedClock, NotFoundError } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { InMemoryAxMockBatchStore } from '../infrastructure/ax/in-memory-ax-mock-batch-store.adapter';
import {
  GetAxMockBatchUseCase,
  ReceiveAxMockBatchUseCase,
} from './manage-ax-mock-batches.use-cases';

const now = new Date('2026-10-20T15:30:00.000Z');
const validCommand = {
  schemaVersion: 'draft-0' as const,
  batchId: 'AX-20261020-001',
  sentAt: '2026-10-20T15:29:00.000Z',
  records: [{ recordId: '1', codigoArticulo: '6205-2RS', marca: 'SKF' }],
};

describe('AX mock batches', () => {
  it('validates records without mutating any catalog dependency', async () => {
    const store = new InMemoryAxMockBatchStore();
    const receive = new ReceiveAxMockBatchUseCase(store, new FixedClock(now));

    const batch = await receive.execute(
      {
        ...validCommand,
        records: [validCommand.records[0]!, { recordId: '2', codigoArticulo: null, marca: 'SKF' }],
      },
      'ax-batch-key-0001',
    );

    expect(batch).toMatchObject({
      status: 'partially_processed',
      receivedAt: now.toISOString(),
      totals: { received: 2, accepted: 1, warnings: 0, rejected: 1 },
    });
    expect(batch.records[1]).toMatchObject({
      rowNumber: 2,
      codigoArticulo: null,
      status: 'rejected',
      issues: [{ code: 'FIELD_REQUIRED', field: 'codigoArticulo', retryable: false }],
    });
  });

  it('returns the original result for the same idempotency key and payload', async () => {
    const store = new InMemoryAxMockBatchStore();
    const receive = new ReceiveAxMockBatchUseCase(store, new FixedClock(now));
    const first = await receive.execute(validCommand, 'ax-batch-key-0002');
    const retried = await receive.execute(validCommand, 'ax-batch-key-0002');

    expect(retried).toBe(first);
    expect(await new GetAxMockBatchUseCase(store).execute(validCommand.batchId)).toBe(first);
  });

  it('keeps concurrent identical deliveries idempotent', async () => {
    const store = new InMemoryAxMockBatchStore();
    const receive = new ReceiveAxMockBatchUseCase(store, new FixedClock(now));

    const [first, concurrentRetry] = await Promise.all([
      receive.execute(validCommand, 'ax-batch-key-concurrent'),
      receive.execute(validCommand, 'ax-batch-key-concurrent'),
    ]);

    expect(concurrentRetry).toBe(first);
  });

  it('rejects reusing an idempotency key with a different payload', async () => {
    const store = new InMemoryAxMockBatchStore();
    const receive = new ReceiveAxMockBatchUseCase(store, new FixedClock(now));
    await receive.execute(validCommand, 'ax-batch-key-0003');

    await expect(
      receive.execute({ ...validCommand, batchId: 'AX-OTHER' }, 'ax-batch-key-0003'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects reusing a batch identifier with a different idempotency key', async () => {
    const store = new InMemoryAxMockBatchStore();
    const receive = new ReceiveAxMockBatchUseCase(store, new FixedClock(now));
    await receive.execute(validCommand, 'ax-batch-key-0004');

    await expect(receive.execute(validCommand, 'ax-batch-key-0005')).rejects.toMatchObject({
      details: { conflict: 'batch-id', batchId: validCommand.batchId },
    });
  });

  it('reports an unknown batch without inventing a result', async () => {
    await expect(
      new GetAxMockBatchUseCase(new InMemoryAxMockBatchStore()).execute('missing'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('evicts batches in deterministic FIFO order at its strict capacity', async () => {
    const store = new InMemoryAxMockBatchStore(2);
    const receive = new ReceiveAxMockBatchUseCase(store, new FixedClock(now));
    const get = new GetAxMockBatchUseCase(store);

    const first = await receive.execute(validCommand, 'ax-batch-key-capacity-1');
    await receive.execute(
      { ...validCommand, batchId: 'AX-20261020-002' },
      'ax-batch-key-capacity-2',
    );
    // Reads and exact retries do not turn FIFO into LRU.
    expect(await get.execute(first.batchId)).toBe(first);
    expect(await receive.execute(validCommand, 'ax-batch-key-capacity-1')).toBe(first);

    await receive.execute(
      { ...validCommand, batchId: 'AX-20261020-003' },
      'ax-batch-key-capacity-3',
    );

    await expect(get.execute(first.batchId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(get.execute('AX-20261020-002')).resolves.toBeDefined();
    await expect(get.execute('AX-20261020-003')).resolves.toBeDefined();
  });

  it('rejects an invalid in-memory retention capacity', () => {
    expect(() => new InMemoryAxMockBatchStore(0)).toThrow(RangeError);
    expect(() => new InMemoryAxMockBatchStore(1.5)).toThrow(RangeError);
  });
});
