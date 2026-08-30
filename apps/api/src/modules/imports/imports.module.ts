import { Module } from '@nestjs/common';

import { EnqueueProductEmbeddingUseCase } from './application/enqueue-product-embedding.use-case';
import { EnqueueSkeletonPingUseCase } from './application/enqueue-skeleton-ping.use-case';
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
  providers: [EnqueueSkeletonPingUseCase, EnqueueProductEmbeddingUseCase],
})
export class ImportsModule {}
