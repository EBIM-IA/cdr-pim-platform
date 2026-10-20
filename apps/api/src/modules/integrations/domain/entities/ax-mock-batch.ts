export const AxMockBatchStatus = {
  Processed: 'processed',
  PartiallyProcessed: 'partially_processed',
  Rejected: 'rejected',
} as const;
export type AxMockBatchStatus = (typeof AxMockBatchStatus)[keyof typeof AxMockBatchStatus];

export const AxMockRecordStatus = {
  Accepted: 'accepted',
  Warning: 'warning',
  Rejected: 'rejected',
} as const;
export type AxMockRecordStatus = (typeof AxMockRecordStatus)[keyof typeof AxMockRecordStatus];

export interface AxMockRecordIssue {
  readonly code: string;
  readonly severity: 'warning' | 'error';
  readonly field: string | null;
  readonly message: string;
  readonly retryable: boolean;
}

export interface AxMockRecordResult {
  readonly rowNumber: number;
  readonly recordId: string | null;
  readonly codigoArticulo: string | null;
  readonly status: AxMockRecordStatus;
  readonly issues: readonly AxMockRecordIssue[];
}

/**
 * Immutable result retained by the local-only AX simulator.
 *
 * `idempotencyKey` and `payloadHash` are internal comparison material and must never be
 * presented by the HTTP adapter or written to logs.
 */
export interface StoredAxMockBatch {
  readonly schemaVersion: 'draft-0';
  readonly batchId: string;
  readonly sentAt: string;
  readonly receivedAt: string;
  readonly status: AxMockBatchStatus;
  readonly totals: {
    readonly received: number;
    readonly accepted: number;
    readonly warnings: number;
    readonly rejected: number;
  };
  readonly records: readonly AxMockRecordResult[];
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
}
