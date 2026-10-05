import { Module } from '@nestjs/common';

import {
  GetAxBatchStatusUseCase,
  ReceiveAxBatchUseCase,
} from './application/receive-ax-batch.use-case';
import { AX_INBOX_REPOSITORY } from './domain/ports/ax-inbox.repository.port';
import { DrizzleAxInboxRepository } from './infrastructure/persistence/drizzle-ax-inbox.repository';
import { AxSyncController } from './presentation/ax-sync.controller';
import { AxIntegrationAuthGuard } from './presentation/guards/ax-integration-auth.guard';

/**
 * Bounded context for the Sismetic / Dynamics AX PUSH integration (contract v1.1).
 *
 * The confirmed direction is AX -> PIM. This module stores an immutable inbox and exposes
 * its reception state; it deliberately does not mutate catalog products until field-level
 * overwrite and stale-update rules are approved.
 *
 * Distinct from `integrations`, which still holds the earlier PULL design (ADR-008).
 */
@Module({
  controllers: [AxSyncController],
  providers: [
    ReceiveAxBatchUseCase,
    GetAxBatchStatusUseCase,
    AxIntegrationAuthGuard,
    { provide: AX_INBOX_REPOSITORY, useClass: DrizzleAxInboxRepository },
  ],
})
export class AxIntegrationModule {}
