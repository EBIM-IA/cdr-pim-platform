import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { probeImportWorkerDatabase } from '../../src/workers/import-database.probe';
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from './database.helper';

describe('Real import worker database startup probe', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => database?.close());

  it('verifies the migrated import columns in a read-only connection without changing import rows', async () => {
    const counts = () => database.sql`
      SELECT (SELECT count(*)::int FROM import_batches) AS batches,
        (SELECT count(*)::int FROM import_executions) AS executions,
        (SELECT count(*)::int FROM import_rows) AS rows
    `;
    const before = await counts();
    await expect(
      probeImportWorkerDatabase({ url: testDatabaseUrl(), poolMax: 1, ssl: false }),
    ).resolves.toEqual({
      connected: true,
      tlsEnabled: false,
      readOnly: true,
      importSchemaReady: true,
    });
    expect(await counts()).toEqual(before);
  });
});
