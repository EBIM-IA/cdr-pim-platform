import type { StoredAxMockBatch } from '../entities/ax-mock-batch';

export type StoreAxMockBatchResult =
  | { readonly kind: 'created'; readonly batch: StoredAxMockBatch }
  | { readonly kind: 'idempotency_exists'; readonly batch: StoredAxMockBatch }
  | { readonly kind: 'batch_exists'; readonly batch: StoredAxMockBatch };

export interface AxMockBatchStorePort {
  /** Atomic check-and-insert: two concurrent retries may never create two batches. */
  saveIfAbsent(batch: StoredAxMockBatch): Promise<StoreAxMockBatchResult>;
  findByBatchId(batchId: string): Promise<StoredAxMockBatch | null>;
}

export const AX_MOCK_BATCH_STORE = Symbol('AxMockBatchStorePort');
