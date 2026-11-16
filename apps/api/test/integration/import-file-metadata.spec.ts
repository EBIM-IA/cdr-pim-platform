import { assertUuid } from '@cdr/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ImportBatch } from '../../src/modules/imports/domain/entities/import-batch';
import { DrizzleImportBatchRepository } from '../../src/modules/imports/infrastructure/persistence/drizzle-import-batch.repository';
import { parseImportPayload } from '../../src/modules/imports/application/parse-import-payload';
import {
  type TestDatabase,
  createTestDatabase,
  expectConstraintViolation,
} from './database.helper';

const now = new Date('2026-11-16T12:00:00.000Z');
const legacyId = assertUuid('10000000-0000-4000-8000-000000000001');

describe('original import file metadata', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  beforeEach(async () => {
    await database.truncateAll();
  });
  afterAll(() => database?.close());

  it('retains original CSV identity through JSON preview persistence and confirmation', async () => {
    const repository = new DrizzleImportBatchRepository(database.db);
    const batch = ImportBatch.preview(
      {
        target: 'homologs',
        format: 'json',
        originalFileName: 'Homólogos originales.csv',
        sourceFileFormat: 'csv',
        idempotencyKey: 'original-csv-identity',
        payloadHash: 'metadata-independent-payload-hash',
        categoryCode: null,
        createdBy: 'admin',
        rows: parseImportPayload({
          target: 'homologs',
          format: 'json',
          idempotencyKey: 'original-csv-identity',
          records: [
            { codigo_unificador: 'D1672', codigo_homologo: 'EXT-1', marca_homologo: 'EXTERNA' },
          ],
        }),
      },
      now,
    );
    await repository.savePreview(batch);
    const id = batch.toSnapshot().id;
    const expected = {
      format: 'json',
      originalFileName: 'Homólogos originales.csv',
      sourceFileFormat: 'csv',
    };
    expect((await repository.findById(id))?.toSnapshot()).toMatchObject(expected);
    expect(
      (await repository.findByIdempotency('homologs', 'original-csv-identity'))?.toSnapshot(),
    ).toMatchObject(expected);
    const audit = { actorId: 'admin', correlationId: 'file-metadata-confirm', occurredAt: now };
    const claimed = await repository.claimConfirmation(id, audit);
    expect(claimed.kind).toBe('claimed');
    if (claimed.kind !== 'claimed') throw new Error('Expected the preview claim');
    claimed.batch.confirm(now);
    await repository.saveConfirmation(claimed.batch, audit);
    expect((await repository.findById(id))?.toSnapshot()).toMatchObject({
      ...expected,
      status: 'confirmed',
    });
  });

  it('reads legacy null metadata and enforces safe filename and original format constraints', async () => {
    await database.sql`INSERT INTO import_batches (id,target,format,idempotency_key,payload_hash,created_by,total_rows,valid_rows,invalid_rows)
      VALUES (${legacyId},'homologs','json','legacy-no-file-metadata','legacy-hash','admin',0,0,0)`;
    expect(
      (await new DrizzleImportBatchRepository(database.db).findById(legacyId))?.toSnapshot(),
    ).toMatchObject({
      originalFileName: null,
      sourceFileFormat: null,
    });
    await expectConstraintViolation(
      database.sql`UPDATE import_batches SET original_file_name='../unsafe.csv' WHERE id=${legacyId}`,
      'import_batches_original_file_name_check',
    );
    await expectConstraintViolation(
      database.sql`UPDATE import_batches SET source_file_format='json' WHERE id=${legacyId}`,
      'import_batches_source_file_format_check',
    );
    await database.sql`UPDATE import_batches SET original_file_name='Archivo.xlsx',source_file_format='xlsx' WHERE id=${legacyId}`;
    expect(
      (await new DrizzleImportBatchRepository(database.db).findById(legacyId))?.toSnapshot(),
    ).toMatchObject({
      format: 'json',
      originalFileName: 'Archivo.xlsx',
      sourceFileFormat: 'xlsx',
    });
  });
});
