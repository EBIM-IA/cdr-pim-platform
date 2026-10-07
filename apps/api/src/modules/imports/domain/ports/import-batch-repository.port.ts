import type { Uuid } from '@cdr/shared';

import type { ImportBatch, ImportTarget } from '../entities/import-batch';
import type { AuditWriteContext } from '../../../audit/domain/ports/audit.port';

export interface ImportBatchRepositoryPort {
  findById(id: Uuid): Promise<ImportBatch | null>;
  findByIdempotency(target: ImportTarget, idempotencyKey: string): Promise<ImportBatch | null>;
  /** Inserts the preview or returns the winner of a concurrent idempotent request. */
  savePreview(batch: ImportBatch): Promise<ImportBatch>;
  /** Atomically transitions previewed -> processing so only one confirmation can write. */
  claimConfirmation(
    id: Uuid,
    audit: AuditWriteContext,
  ): Promise<
    | { readonly kind: 'claimed'; readonly batch: ImportBatch }
    | { readonly kind: 'confirmed'; readonly batch: ImportBatch }
    | { readonly kind: 'busy'; readonly status: string }
    | { readonly kind: 'not_found' }
  >;
  updateRowResult(
    batchId: Uuid,
    rowNumber: number,
    valid: boolean,
    errors: readonly string[],
  ): Promise<void>;
  /** Completes processing and appends its batch audit event in the same transaction. */
  saveConfirmation(batch: ImportBatch, audit: AuditWriteContext): Promise<void>;
}

export const IMPORT_BATCH_REPOSITORY = Symbol('ImportBatchRepositoryPort');
