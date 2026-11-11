import { newUuid, NotFoundError } from '@cdr/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresAxInboxReadModel } from '../../src/modules/workspaces/infrastructure/postgres-ax-inbox-read-model';
import { PostgresReportSettingsAdapter } from '../../src/modules/workspaces/infrastructure/postgres-report-settings.adapter';
import { PostgresReportsReadModel } from '../../src/modules/workspaces/infrastructure/postgres-reports-read-model';
import { PostgresSearchTelemetryAdapter } from '../../src/modules/catalog-schema/infrastructure/persistence/postgres-search-telemetry.adapter';
import { type TestDatabase, createTestDatabase } from './database.helper';
const productId = '10000000-0000-4000-8000-000000000001';
describe('Durable reporting and AX reception monitor', () => {
  let database: TestDatabase;
  let settings: PostgresReportSettingsAdapter;
  let reports: PostgresReportsReadModel;
  beforeAll(async () => {
    database = await createTestDatabase();
    settings = new PostgresReportSettingsAdapter(database.sql);
    reports = new PostgresReportsReadModel(database.sql);
  });
  beforeEach(() => database.truncateAll());
  afterAll(() => database.close());
  it('shares client formats, isolates personal layouts, and preserves intentional unmapped columns', async () => {
    await settings.update('admin', {
      operation: 'save-format',
      format: {
        id: 'client',
        title: 'Cliente',
        file: 'cliente.xlsx',
        fields: [
          { header: 'SKU', field: 'sku' },
          { header: 'Nota', field: '' },
        ],
      },
    });
    await settings.update('admin', {
      operation: 'save-layout',
      key: 'client',
      layout: { order: ['sku'], hidden: [] },
    });
    expect((await settings.read('admin')).layouts.client).toEqual({ order: ['sku'], hidden: [] });
    const other = await new PostgresReportSettingsAdapter(database.sql).read('other');
    expect(other.layouts).toEqual({});
    expect(other.formats[0]?.fields[1]?.field).toBe('');
    await settings.update('admin', { operation: 'delete-format', key: 'client' });
    expect((await settings.read('other')).formats).toEqual([]);
  });
  it('preserves baseline observations and uses them for before/current comparison and monthly goal', async () => {
    await database.sql`INSERT INTO products(id,sku,name,status) VALUES (${productId}::uuid,'TEST-1','Inicial','draft')`;
    await settings.update('admin', { operation: 'capture-baseline', label: 'Corte inicial' });
    const baseline = (await settings.read('admin')).baselines[0]!;
    expect(baseline.productCount).toBe(1);
    await database.sql`INSERT INTO audit_entries(id,resource_type,resource_id,action,actor_id,source,correlation_id,occurred_at,changes) VALUES (${newUuid()}::uuid,'product',${productId},'updated','admin','api','report-test','2026-11-01T12:00:00Z','{}'::jsonb)`;
    const groupId = newUuid();
    await database.sql`INSERT INTO equivalence_groups(id,code,name,kind) VALUES (${groupId}::uuid,'UNIF-TEST','Prueba','interchange')`;
    await database.sql`INSERT INTO equivalence_group_members(group_id,product_id,role) VALUES (${groupId}::uuid,${productId}::uuid,'member')`;
    await database.sql`INSERT INTO group_applications(id,equivalence_group_id,vehicle_type,make,model,year_from,year_to,active,source,verification_status) VALUES (${newUuid()}::uuid,${groupId}::uuid,'AUTOMOTRIZ','Toyota','Corolla',2014,2018,true,'manual','verified')`;
    const report = await reports.read('general_results', { baselineId: baseline.id });
    expect(report.rows[0]?.values).toMatchObject({
      previousApplications: 0,
      currentApplications: 1,
      previousAttributes: 0,
      currentAttributes: 0,
    });
    expect(report.metrics).toContainEqual({
      key: 'monthly-goal',
      label: 'Meta mensual',
      value: 250,
      format: 'integer',
    });
    expect(report.metrics).toContainEqual({
      key: 'goal-result',
      label: 'Resultado',
      value: '1/250',
      format: 'text',
    });
    await expect(reports.read('general_results', { baselineId: newUuid() })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(
      (await reports.read('general_results', {})).rows[0]?.values.previousApplications,
    ).toBeNull();
  });
  it('keeps actual closed-month totals with their source, and does not apply global totals to filtered subsets', async () => {
    await settings.update('admin', {
      operation: 'save-closed-periods',
      source: 'Cliente.xlsx',
      periods: [
        { year: 2024, month: 1, total: 0 },
        { year: 2024, month: 2, total: 250 },
      ],
    });
    let report = await reports.read('period_results', {});
    expect(report.rows.find((row) => row.values.month === 'ENERO')?.values.year_2024).toBe(0);
    expect(report.rows.find((row) => row.values.month === 'TOTAL')?.values.year_2024).toBe(250);
    report = await reports.read('period_results', { from: '2024-02-15', to: '2024-02-28' });
    expect(report.rows.find((row) => row.values.month === 'FEBRERO')?.values.year_2024).toBeNull();
    report = await reports.read('period_results', { q: 'sku' });
    expect(report.rows.find((row) => row.values.month === 'FEBRERO')?.values.year_2024).toBeNull();
    const source =
      await database.sql`SELECT source FROM report_closed_periods WHERE year=2024 AND month=2`;
    expect(source[0]?.source).toBe('Cliente.xlsx');
  });
  it('aggregates successful executions and independent zero-result terms with inclusive UTC date filters', async () => {
    const telemetry = new PostgresSearchTelemetryAdapter(database.sql);
    await telemetry.record('  Rodamiento  6205  ', 2, 'variants');
    await telemetry.record('Rodamiento 6205', 0, 'semantic');
    await telemetry.record('Otro', 0, 'variants');
    const report = await reports.searchReport({});
    expect(report).toMatchObject({ total: 3, withResults: 1, withoutResults: 2, semantic: 1 });
    expect(report.terms[0]).toMatchObject({
      query: 'rodamiento 6205',
      count: 2,
      withoutResults: 1,
    });
    expect(report.unsuccessfulTerms).toHaveLength(2);
    expect(await reports.searchReport({ to: '2000-01-01' })).toMatchObject({ total: 0, terms: [] });
  });
  it('shows real inbox batches and paginated records without claiming they were processed', async () => {
    const batchId = newUuid();
    await database.sql`INSERT INTO ax_inbound_batches(id,external_batch_id,sent_at,source_system,request_hash,status,record_count,correlation_id,received_at) VALUES (${batchId}::uuid,'AX-001','2026-11-01T12:00:00Z','AX',${'sha256:' + 'a'.repeat(64)},'received',2,'correlation','2026-11-01T12:01:00Z')`;
    for (const row of [1, 2])
      await database.sql`INSERT INTO ax_inbound_records(id,batch_id,row_number,item_code,supplier_code,payload) VALUES (${newUuid()}::uuid,${batchId}::uuid,${row},${`SKU-${row}`},'PRV','{}'::jsonb)`;
    const monitor = new PostgresAxInboxReadModel(database.sql);
    const detail = await monitor.read({ axBatchId: 'AX-001', page: 2, pageSize: 1 });
    expect(detail).toMatchObject({
      totalBatches: 1,
      totalRecords: 2,
      catalogApplicationEnabled: false,
      selectedBatch: { externalId: 'AX-001', status: 'received' },
    });
    expect(detail.records).toHaveLength(1);
    expect(detail.records[0]?.rowNumber).toBe(2);
    await expect(monitor.read({ axBatchId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
