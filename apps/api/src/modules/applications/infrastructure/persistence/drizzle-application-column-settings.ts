import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { recordAuditWithinTransaction } from '../../../../shared/persistence/record-audit-within-transaction';
import { AuditAction, createAuditEntry } from '../../../audit/domain/entities/audit-entry';
import type { ApplicationColumnSettingsPort } from '../../domain/ports/application-column-settings.port';
import { applicationColumnSettings } from './application-column-settings.tables';
@Injectable()
export class DrizzleApplicationColumnSettings implements ApplicationColumnSettingsPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async get() {
    const [row] = await this.db
      .select()
      .from(applicationColumnSettings)
      .where(eq(applicationColumnSettings.id, 'default'));
    return { columns: row?.columns ?? [], version: row?.version ?? 0 };
  }
  async update(
    columns: Parameters<ApplicationColumnSettingsPort['update']>[0],
    expectedVersion: number,
    audit: Parameters<ApplicationColumnSettingsPort['update']>[2],
  ) {
    return this.db.transaction(async (tx) => {
      await tx.insert(applicationColumnSettings).values({ id: 'default' }).onConflictDoNothing();
      const [before] = await tx
        .select()
        .from(applicationColumnSettings)
        .where(eq(applicationColumnSettings.id, 'default'))
        .for('update');
      if (!before || before.version !== expectedVersion) return null;
      const [after] = await tx
        .update(applicationColumnSettings)
        .set({
          columns: columns.map((column) => ({ ...column, aliases: [...column.aliases] })),
          version: before.version + 1,
          updatedAt: audit.occurredAt,
        })
        .where(eq(applicationColumnSettings.id, 'default'))
        .returning();
      if (!after) return null;
      await recordAuditWithinTransaction(
        tx,
        createAuditEntry({
          resourceType: 'application_column_settings',
          resourceId: 'default',
          action: AuditAction.Updated,
          source: 'api',
          actorId: audit.actorId,
          correlationId: audit.correlationId,
          occurredAt: audit.occurredAt,
          changes: { columns: { before: before.columns, after: after.columns } },
        }),
      );
      return { columns: after.columns, version: after.version };
    });
  }
}
