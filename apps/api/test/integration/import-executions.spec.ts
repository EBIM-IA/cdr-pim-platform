import { DispatchImportExecutionsUseCase } from '../../src/modules/imports/application/dispatch-import-executions.use-case';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertUuid, FixedClock, newUuid } from '@cdr/shared';
import { DrizzleImportExecutionAdapter } from '../../src/modules/imports/infrastructure/persistence/drizzle-import-execution.adapter';
import { DrizzleImportBatchRepository } from '../../src/modules/imports/infrastructure/persistence/drizzle-import-batch.repository';
import { ImportExecutionUseCases } from '../../src/modules/imports/application/import-execution.use-cases';
import { ConfirmImportBatchUseCase } from '../../src/modules/imports/application/manage-import-batches.use-cases';
import { ImportBatch } from '../../src/modules/imports/domain/entities/import-batch';
import { DrizzleGroupApplicationRepository } from '../../src/modules/applications/infrastructure/persistence/drizzle-group-application.repository';
import { DrizzleExternalHomologRepository } from '../../src/modules/equivalences/infrastructure/persistence/drizzle-external-homolog.repository';
import { DrizzleGroupOemCodeRepository } from '../../src/modules/equivalences/infrastructure/persistence/drizzle-group-oem-code.repository';
import { ExternalHomolog } from '../../src/modules/equivalences/domain/entities/external-homolog';
import { Role } from '../../src/modules/identity/domain/entities/role';
import { PostgresIntegrationMonitorReadModel } from '../../src/modules/workspaces/infrastructure/postgres-integration-monitor-read-model';
import { createTestDatabase, type TestDatabase } from './database.helper';
const now = new Date('2026-11-16T15:00:00Z');
const groupId = assertUuid('20000000-0000-4000-8000-000000000001');
const actor = { id: 'admin', email: 'admin@example.test', roles: [Role.Administrator] };
describe('durable asynchronous import confirmations', () => {
  let database: TestDatabase,
    executions: DrizzleImportExecutionAdapter,
    batches: DrizzleImportBatchRepository,
    homologs: DrizzleExternalHomologRepository;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  beforeEach(async () => {
    await database.truncateAll();
    executions = new DrizzleImportExecutionAdapter(database.db);
    batches = new DrizzleImportBatchRepository(database.db);
    homologs = new DrizzleExternalHomologRepository(database.db);
    await database.sql`INSERT INTO equivalence_groups(id,code,name,kind) VALUES (${groupId},'CU-1','Grupo','interchange')`;
  });
  afterAll(() => database?.close());
  const service = (at = now) =>
    new ImportExecutionUseCases(
      executions,
      batches,
      new ConfirmImportBatchUseCase(
        batches,
        new FixedClock(at),
        new DrizzleGroupApplicationRepository(database.db),
        homologs,
        new DrizzleGroupOemCodeRepository(database.db),
        { prepare: vi.fn(), applyRow: vi.fn() },
        { assertExternalReference: vi.fn().mockResolvedValue(undefined) },
      ),
      new FixedClock(at),
    );
  async function preview(group = 'CU-1') {
    const batch = ImportBatch.preview(
      {
        target: 'homologs',
        format: 'json',
        idempotencyKey: newUuid(),
        payloadHash: 'test-payload',
        categoryCode: null,
        createdBy: actor.id,
        rows: [1, 2].map((index) => ({
          rowNumber: index,
          valid: true,
          data: {
            unifiedCode: group,
            externalCode: `EXT-${index}`,
            externalBrand: 'SKF',
            approvalStatus: 'approved',
            active: true,
          },
          errors: [],
          warnings: [],
        })),
      },
      now,
    );
    await batches.savePreview(batch);
    return batch.toSnapshot().id;
  }
  it('converges concurrent enqueue and workers on one job with durable progress and no duplicate relations', async () => {
    const id = await preview();
    const queued = await Promise.all([service().enqueue(id, actor), service().enqueue(id, actor)]);
    expect(queued.map((value) => value.status)).toEqual(['queued', 'queued']);
    const outcomes = await Promise.allSettled([
      service().processBatch(id),
      service().processBatch(id),
    ]);
    expect(outcomes.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((value) => value.status === 'rejected')).toHaveLength(1);
    const persisted = await new DrizzleImportExecutionAdapter(database.db).get(id);
    expect(persisted).toMatchObject({
      status: 'completed',
      processedRows: 2,
      totalRows: 2,
      error: null,
    });
    expect((await batches.findById(id))?.toSnapshot().status).toBe('confirmed');
    expect(await homologs.list('CU-1', true)).toHaveLength(2);
    await service().processBatch(id);
    expect(await service().enqueue(id, actor)).toEqual(persisted);
    const [count] = await database.sql`SELECT COUNT(*)::int AS count FROM import_executions`;
    expect(count?.count).toBe(1);
  });
  it('recovers an expired lease after a process crash and safely reapplies an already persisted row', async () => {
    const id = await preview();
    await service().enqueue(id, actor);
    const crashed = await executions.claim(id, now);
    expect(crashed).not.toBeNull();
    const first = ExternalHomolog.create(
      {
        groupId,
        unifiedCode: 'CU-1',
        externalCode: 'EXT-1',
        externalBrand: 'SKF',
        source: 'import',
        importBatchId: id,
        approvalStatus: 'approved',
      },
      now,
    );
    await homologs.saveImported(first, {
      actorId: actor.id,
      correlationId: newUuid(),
      occurredAt: now,
    });
    await database.sql`UPDATE import_batches SET status='processing',processing_started_at=${now.toISOString()}::timestamptz WHERE id=${id}`;
    const later = new Date(now.getTime() + 21 * 60 * 1000);
    await service(later).processBatch(id);
    expect(await homologs.list('CU-1', true)).toHaveLength(2);
    expect(
      (await homologs.list('CU-1', true))
        .find((value) => value.toSnapshot().externalCode === 'EXT-1')
        ?.toSnapshot().id,
    ).toBe(first.toSnapshot().id);
    expect(await executions.get(id)).toMatchObject({
      status: 'completed',
      processedRows: 2,
      totalRows: 2,
    });
    await expect(executions.progress(crashed!, 1, later)).rejects.toThrow('perdió su turno');
  });
  it('keeps row validation failures and a failed execution available after reopening', async () => {
    const id = await preview('MISSING');
    await service().enqueue(id, actor);
    await service().processBatch(id);
    expect(await executions.get(id)).toMatchObject({ status: 'failed', processedRows: 2 });
    const snapshot = (await new DrizzleImportBatchRepository(database.db).findById(
      id,
    ))!.toSnapshot();
    expect(snapshot.status).toBe('failed');
    expect(snapshot.rows.every((row) => !row.valid && row.errors.length > 0)).toBe(true);
    expect(await homologs.list('CU-1', true)).toHaveLength(0);
  });
  it('preserves dispatch intent through a broker outage and only marks a successful SQS publish', async () => {
    const id = await preview();
    await service().enqueue(id, actor);
    const queue = {
      publish: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue({ messageId: 'test-message' }),
      publishBatch: vi.fn(),
    };
    const dispatch = new DispatchImportExecutionsUseCase(executions, queue, new FixedClock(now));
    await expect(dispatch.execute()).rejects.toThrow('offline');
    expect(await executions.undispatched(10)).toEqual([id]);
    expect(await dispatch.execute()).toBe(1);
    expect(await executions.undispatched(10)).toEqual([]);
    expect(queue.publish.mock.calls[1]?.[0]).toMatchObject({
      type: 'IMPORT_BATCH',
      payload: { batchId: id },
      idempotencyKey: `import-confirmation:${id}`,
    });
    expect(await executions.get(id)).toMatchObject({ status: 'queued', processedRows: 0 });
  });
  it('distinguishes durable AX receipt from catalog import application in the monitor', async () => {
    const id = await preview();
    await service().enqueue(id, actor);
    await service().processBatch(id);
    await database.sql`INSERT INTO ax_inbound_batches(id,external_batch_id,sent_at,request_hash,status,record_count,correlation_id,received_at) VALUES (${newUuid()},'AX-1',${now.toISOString()}::timestamptz,${`sha256:${'a'.repeat(64)}`},'received',5,'corr-ax',${now.toISOString()}::timestamptz)`;
    const monitor = await new PostgresIntegrationMonitorReadModel(database.sql).read();
    expect(monitor.summary).toMatchObject({
      axBatches: 1,
      axRecords: 5,
      importsConfirmed: 1,
      importRowsApplied: 2,
    });
    expect(monitor.executions.find((row) => row.system === 'ax')).toMatchObject({
      status: 'received',
      succeededRecords: null,
      failedRecords: null,
      durationMs: null,
    });
    expect(monitor.executions.find((row) => row.system === 'import')).toMatchObject({
      status: 'confirmed',
      succeededRecords: 2,
      failedRecords: 0,
    });
  });
});
