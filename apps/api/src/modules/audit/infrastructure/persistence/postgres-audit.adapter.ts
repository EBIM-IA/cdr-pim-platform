import { Inject, Injectable } from '@nestjs/common';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import type { AuditEntry } from '../../domain/entities/audit-entry';
import type { AuditPort } from '../../domain/ports/audit.port';
import { auditEntries } from './audit.tables';

/** Persists the compliance trail in the database-owned append-only table. */
@Injectable()
export class PostgresAuditAdapter implements AuditPort {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.database.insert(auditEntries).values({
      id: entry.id,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      action: entry.action,
      actorId: entry.actorId,
      source: entry.source,
      correlationId: entry.correlationId,
      occurredAt: entry.occurredAt,
      changes: entry.changes,
    });
  }
}
