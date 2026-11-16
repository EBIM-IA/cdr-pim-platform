import { integrationExecutionMonitorSchema } from '@cdr/contracts';
import type { Sql } from '../../../database/drizzle.client';
/** Counts observed receptions and actual catalog imports separately; never calls remote adapters. */
export class PostgresIntegrationMonitorReadModel {
  constructor(private readonly sql: Sql) {}
  async read() {
    const [summaries, executions] = await Promise.all([
      this
        .sql`SELECT (SELECT COUNT(*)::int FROM ax_inbound_batches) AS "axBatches", (SELECT COALESCE(SUM(record_count),0)::int FROM ax_inbound_batches) AS "axRecords",
      COUNT(*) FILTER (WHERE b.status='processing' OR e.status IN ('queued','processing'))::int AS "importsProcessing",
      COUNT(*) FILTER (WHERE b.status='failed' OR e.status='failed')::int AS "importsFailed",
      COUNT(*) FILTER (WHERE b.status='confirmed')::int AS "importsConfirmed",
      COALESCE(SUM(b.valid_rows) FILTER (WHERE b.status='confirmed'),0)::int AS "importRowsApplied",
      (SELECT COUNT(*)::int FROM audit_entries WHERE action='ai_generated') AS "aiGenerations"
      FROM import_batches b LEFT JOIN import_executions e ON e.batch_id=b.id`,
      this.sql`SELECT * FROM (
        SELECT b.id::text AS id, 'ax' AS system, 'Recepción PUSH (sin aplicar al catálogo)' AS operation, b.status, b.record_count AS records,
          NULL::integer AS "succeededRecords", NULL::integer AS "failedRecords", b.received_at AS "startedAt", b.received_at AS "finishedAt", NULL::float AS "durationMs",
          b.source_system AS actor, b.correlation_id AS "correlationId", NULL::text AS error FROM ax_inbound_batches b
        UNION ALL
        SELECT b.id::text, 'import', 'Importación · ' || b.target, CASE WHEN e.status IN ('queued','processing','failed') THEN e.status ELSE b.status END, b.total_rows,
          CASE WHEN b.status='confirmed' THEN b.valid_rows ELSE NULL END, b.invalid_rows,
          COALESCE(e.started_at,b.processing_started_at,b.created_at), COALESCE(e.completed_at,b.confirmed_at),
          CASE WHEN e.completed_at IS NOT NULL AND e.started_at IS NOT NULL THEN GREATEST(EXTRACT(EPOCH FROM (e.completed_at-e.started_at))*1000,0)::float ELSE NULL END,
          b.created_by, (SELECT a.correlation_id FROM audit_entries a WHERE a.resource_type='import_batch' AND a.resource_id=b.id::text ORDER BY a.occurred_at DESC LIMIT 1), e.error
          FROM import_batches b LEFT JOIN import_executions e ON e.batch_id=b.id
      ) executions ORDER BY "startedAt" DESC, id DESC LIMIT 50`,
    ]);
    return integrationExecutionMonitorSchema.parse({
      summary: summaries[0],
      executions: executions.map((row) => ({
        ...row,
        startedAt: new Date(row.startedAt).toISOString(),
        finishedAt: row.finishedAt ? new Date(row.finishedAt).toISOString() : null,
      })),
    });
  }
}
