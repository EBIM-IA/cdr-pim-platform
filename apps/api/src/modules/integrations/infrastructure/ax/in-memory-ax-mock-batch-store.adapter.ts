import type { StoredAxMockBatch } from '../../domain/entities/ax-mock-batch';
import type {
  AxMockBatchStorePort,
  StoreAxMockBatchResult,
} from '../../domain/ports/ax-mock-batch-store.port';

export const AX_MOCK_RETAINED_BATCH_CAPACITY = 100;

/**
 * Local/test-only volatile FIFO storage. A restart intentionally clears every mock batch.
 *
 * Capacity is deliberately fixed and small in the application binding so a test tool cannot
 * become an unbounded process-memory sink. The constructor override only exists for focused
 * eviction tests.
 */
export class InMemoryAxMockBatchStore implements AxMockBatchStorePort {
  private readonly batchesById = new Map<string, StoredAxMockBatch>();
  private readonly batchesByIdempotency = new Map<string, StoredAxMockBatch>();

  constructor(private readonly capacity = AX_MOCK_RETAINED_BATCH_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('AX mock batch capacity must be a positive integer');
    }
  }

  async saveIfAbsent(batch: StoredAxMockBatch): Promise<StoreAxMockBatchResult> {
    const byIdempotency = this.batchesByIdempotency.get(batch.idempotencyKey);
    if (byIdempotency) return { kind: 'idempotency_exists', batch: byIdempotency };

    const byBatchId = this.batchesById.get(batch.batchId);
    if (byBatchId) return { kind: 'batch_exists', batch: byBatchId };

    // No await occurs between the checks and both writes, so this section is atomic within
    // one Node.js process. The simulator is deliberately forbidden outside local/test.
    this.evictOldestIfFull();
    this.batchesById.set(batch.batchId, batch);
    this.batchesByIdempotency.set(batch.idempotencyKey, batch);
    return { kind: 'created', batch };
  }

  async findByBatchId(batchId: string): Promise<StoredAxMockBatch | null> {
    return this.batchesById.get(batchId) ?? null;
  }

  private evictOldestIfFull(): void {
    if (this.batchesById.size < this.capacity) return;

    const oldest = this.batchesById.values().next().value;
    if (!oldest) return;
    this.batchesById.delete(oldest.batchId);
    this.batchesByIdempotency.delete(oldest.idempotencyKey);
  }
}
