import { Global, Module } from '@nestjs/common';

import { ListAuditChangesUseCase } from './application/list-audit-changes.use-case';
import { AUDIT_READ_PORT } from './domain/ports/audit-read.port';
import { AUDIT_PORT } from './domain/ports/audit.port';
import { PostgresAuditAdapter } from './infrastructure/persistence/postgres-audit.adapter';
import { AuditController } from './presentation/audit.controller';

/**
 * Global because auditing is a cross-cutting concern that any bounded context may need,
 * and routing it through a single port keeps the format consistent across all of them.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [
    PostgresAuditAdapter,
    { provide: AUDIT_PORT, useExisting: PostgresAuditAdapter },
    { provide: AUDIT_READ_PORT, useExisting: PostgresAuditAdapter },
    ListAuditChangesUseCase,
  ],
  exports: [AUDIT_PORT, AUDIT_READ_PORT],
})
export class AuditModule {}
