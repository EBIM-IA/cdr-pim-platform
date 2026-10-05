import { Module } from '@nestjs/common';

import { ReceiveAxBatchUseCase } from './application/receive-ax-batch.use-case';
import { AxSyncController } from './presentation/ax-sync.controller';
import { AxIntegrationAuthGuard } from './presentation/guards/ax-integration-auth.guard';

/**
 * Bounded context for the Sismetic / Dynamics AX PUSH integration (contract v1.1).
 *
 * TEMPORARY QAS MOCK: receives and validates batches, publishes AX_BATCH_RECEIVED, and
 * touches no table. It depends on no other bounded context and on no database port — the
 * architecture test keeps it that way until the database phase is designed
 * (docs/integrations/ax/NEXT_DB_PHASE.md).
 *
 * Distinct from `integrations`, which still holds the earlier PULL design (ADR-008).
 */
@Module({
  controllers: [AxSyncController],
  providers: [ReceiveAxBatchUseCase, AxIntegrationAuthGuard],
})
export class AxIntegrationModule {}
