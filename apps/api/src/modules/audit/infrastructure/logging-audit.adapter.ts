import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from '@cdr/shared';

import { LOGGER } from '../../../shared/tokens';
import type { AuditEntry } from '../domain/entities/audit-entry';
import type { AuditPort } from '../domain/ports/audit.port';

/**
 * Interim audit sink: emits the entry as a structured log record, which CloudWatch Logs
 * retains and can be queried with Logs Insights.
 *
 * This is explicitly NOT the final answer — a durable `audit_entries` table is the intended
 * destination, and swapping this adapter for `PostgresAuditAdapter` is one line in
 * `AuditModule`. It is not built yet because doing so would mean guessing the retention
 * period and the legal/reporting requirements, which are Casa del Rulimán's call.
 */
@Injectable()
export class LoggingAuditAdapter implements AuditPort {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  async record(entry: AuditEntry): Promise<void> {
    this.logger.info('audit', {
      auditId: entry.id,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      action: entry.action,
      actorId: entry.actorId,
      source: entry.source,
      occurredAt: entry.occurredAt.toISOString(),
      changes: entry.changes,
    });
  }
}
