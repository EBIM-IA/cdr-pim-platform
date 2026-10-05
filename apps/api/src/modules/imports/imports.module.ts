import { Module } from '@nestjs/common';

import { EnqueueProductEmbeddingUseCase } from './application/enqueue-product-embedding.use-case';
import { EnqueueSkeletonPingUseCase } from './application/enqueue-skeleton-ping.use-case';
import {
  ConfirmImportBatchUseCase,
  GetImportBatchUseCase,
  PreviewImportBatchUseCase,
} from './application/manage-import-batches.use-cases';
import { IMPORT_BATCH_REPOSITORY } from './domain/ports/import-batch-repository.port';
import { DrizzleImportBatchRepository } from './infrastructure/persistence/drizzle-import-batch.repository';
import { ImportsController } from './presentation/imports.controller';

/**
 * Bounded context for bulk ingestion (Excel/CSV files, manufacturer feeds) and for
 * enqueuing the work those imports generate.
 *
 * Only the job-publishing half exists today; file parsing, staging tables and the
 * validation report are deliberately absent until the import rules are agreed with
 * Casa del Rulimán.
 */
@Module({
  controllers: [ImportsController],
  providers: [
    EnqueueSkeletonPingUseCase,
    EnqueueProductEmbeddingUseCase,
    { provide: IMPORT_BATCH_REPOSITORY, useClass: DrizzleImportBatchRepository },
    PreviewImportBatchUseCase,
    GetImportBatchUseCase,
    ConfirmImportBatchUseCase,
  ],
  exports: [IMPORT_BATCH_REPOSITORY],
})
export class ImportsModule {}
