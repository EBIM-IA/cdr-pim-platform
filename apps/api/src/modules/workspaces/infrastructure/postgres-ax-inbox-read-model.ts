import type { WorkspaceDto, WorkspaceQuery } from '@cdr/contracts';
import { NotFoundError } from '@cdr/shared';
import type { Sql } from '../../../database/drizzle.client';

type Batch = NonNullable<WorkspaceDto['axInbox']>['recentBatches'][number];
type RawBatch = Omit<Batch, 'sentAt' | 'receivedAt'> & {
  sentAt: Date | string;
  receivedAt: Date | string;
};
const asIso = (value: Date | string): string => new Date(value).toISOString();
const present = (row: RawBatch): Batch => ({
  ...row,
  sentAt: asIso(row.sentAt),
  receivedAt: asIso(row.receivedAt),
});

/** Query-only reporting surface over the immutable AX reception inbox. */
export class PostgresAxInboxReadModel {
  constructor(private readonly sql: Sql) {}

  async read(query: WorkspaceQuery): Promise<NonNullable<WorkspaceDto['axInbox']>> {
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 100;
    const [totals, batches] = await Promise.all([
      this.sql<
        { batches: number; records: number }[]
      >`SELECT COUNT(*)::int AS batches, COALESCE(SUM(record_count),0)::int AS records FROM ax_inbound_batches`,
      this.sql<
        RawBatch[]
      >`SELECT id::text, external_batch_id AS "externalId", sent_at AS "sentAt", received_at AS "receivedAt", source_system AS "sourceSystem", correlation_id AS "correlationId", status, record_count AS "recordCount" FROM ax_inbound_batches ORDER BY received_at DESC, id DESC LIMIT 50`,
    ]);
    let selected = batches[0];
    if (query.axBatchId) {
      const rows = await this.sql<
        RawBatch[]
      >`SELECT id::text, external_batch_id AS "externalId", sent_at AS "sentAt", received_at AS "receivedAt", source_system AS "sourceSystem", correlation_id AS "correlationId", status, record_count AS "recordCount" FROM ax_inbound_batches WHERE external_batch_id = ${query.axBatchId} LIMIT 1`;
      selected = rows[0];
      if (!selected) throw new NotFoundError('AX inbox batch', query.axBatchId);
    }
    const records = selected
      ? await this.sql<
          {
            id: string;
            rowNumber: number;
            itemCode: string;
            supplierCode: string;
            sourceModifiedAt: Date | string | null;
          }[]
        >`SELECT id::text, row_number AS "rowNumber", item_code AS "itemCode", supplier_code AS "supplierCode", source_modified_at AS "sourceModifiedAt" FROM ax_inbound_records WHERE batch_id = ${selected.id}::uuid ORDER BY row_number LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
      : [];
    return {
      totalBatches: totals[0]?.batches ?? 0,
      totalRecords: totals[0]?.records ?? 0,
      recentBatches: batches.map(present),
      selectedBatch: selected ? present(selected) : null,
      records: records.map((row) => ({
        ...row,
        sourceModifiedAt: row.sourceModifiedAt ? asIso(row.sourceModifiedAt) : null,
      })),
      page,
      pageSize,
      catalogApplicationEnabled: false,
    };
  }
}
