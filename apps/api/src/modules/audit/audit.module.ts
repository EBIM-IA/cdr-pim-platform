import { Global, Module } from '@nestjs/common';

import { AUDIT_PORT } from './domain/ports/audit.port';
import { PostgresAuditAdapter } from './infrastructure/persistence/postgres-audit.adapter';

/**
 * Global because auditing is a cross-cutting concern that any bounded context may need,
 * and routing it through a single port keeps the format consistent across all of them.
 */
@Global()
@Module({
  providers: [{ provide: AUDIT_PORT, useClass: PostgresAuditAdapter }],
  exports: [AUDIT_PORT],
})
export class AuditModule {}
