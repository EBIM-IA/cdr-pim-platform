import type { Uuid } from '@cdr/shared';

import type { ImportBatch, ImportTarget } from '../entities/import-batch';

export interface ImportBatchRepositoryPort {
  findById(id: Uuid): Promise<ImportBatch | null>;
  findByIdempotency(target: ImportTarget, idempotencyKey: string): Promise<ImportBatch | null>;
  /** Inserts the preview or returns the winner of a concurrent idempotent request. */
  savePreview(batch: ImportBatch): Promise<ImportBatch>;
  saveConfirmation(batch: ImportBatch): Promise<void>;
}

export const IMPORT_BATCH_REPOSITORY = Symbol('ImportBatchRepositoryPort');
