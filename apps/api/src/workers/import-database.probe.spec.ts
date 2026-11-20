import { afterEach, describe, expect, it, vi } from 'vitest';
import type { createDatabase } from '../database/drizzle.client';
import { ImportDatabaseProbeError, probeImportWorkerDatabase } from './import-database.probe';

const options = { url: 'postgres://probe:secret@localhost/probe_test', poolMax: 1, ssl: false };
function setup({
  tlsEnabled = false,
  readOnly = true,
  queryFailure,
}: { tlsEnabled?: boolean; readOnly?: boolean; queryFailure?: unknown } = {}) {
  const transaction = vi.fn(async (strings: TemplateStringsArray) => {
    const query = strings.join('');
    if (query.includes('SELECT 1 = 1')) return [{ connected: true, tlsEnabled, readOnly }];
    if (query.includes('LIMIT 0') && queryFailure) throw queryFailure;
    return [];
  });
  const end = vi.fn().mockResolvedValue(undefined);
  const begin = vi.fn(async (_mode: string, callback: (tx: unknown) => Promise<unknown>) =>
    callback(transaction),
  );
  const connect = vi.fn(() => ({
    sql: { begin, end },
    db: {},
  })) as unknown as typeof createDatabase;
  return { transaction, end, begin, connect };
}
afterEach(() => vi.useRealTimers());

describe('Import worker database verification', () => {
  it('uses a read-only transaction and bounds query time before checking schema without row data', async () => {
    const db = setup();
    await expect(probeImportWorkerDatabase(options, db.connect)).resolves.toEqual({
      connected: true,
      tlsEnabled: false,
      readOnly: true,
      importSchemaReady: true,
    });
    expect(db.begin).toHaveBeenCalledWith('read only', expect.any(Function));
    const queries = db.transaction.mock.calls.map(([parts]) => parts.join(''));
    expect(queries[0]).toContain("set_config('statement_timeout', '10000', true)");
    expect(queries.at(-1)).toMatch(
      /import_executions[\s\S]*import_batches[\s\S]*import_rows[\s\S]*LIMIT 0/u,
    );
    expect(queries.join(' ')).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|TRUNCATE)\b/u);
    expect(db.end).toHaveBeenCalledWith({ timeout: 5 });
  });

  it('rejects a non-TLS hosted connection and always closes its pool', async () => {
    const db = setup();
    await expect(
      probeImportWorkerDatabase({ ...options, ssl: true }, db.connect),
    ).rejects.toMatchObject({ code: 'DATABASE_TLS_REQUIRED' });
    expect(db.end).toHaveBeenCalledOnce();
  });

  it('refuses a transaction that is not read-only', async () => {
    const db = setup({ readOnly: false });
    await expect(probeImportWorkerDatabase(options, db.connect)).rejects.toMatchObject({
      code: 'DATABASE_READ_ONLY_REQUIRED',
    });
    expect(db.end).toHaveBeenCalledOnce();
  });

  it('classifies missing migration columns without disclosing raw database errors', async () => {
    const db = setup({
      queryFailure: Object.assign(new Error('private column error postgres://private'), {
        code: '42703',
      }),
    });
    await expect(probeImportWorkerDatabase(options, db.connect)).rejects.toMatchObject({
      code: 'IMPORT_SCHEMA_NOT_READY',
      message: 'IMPORT_SCHEMA_NOT_READY',
    });
    expect(db.end).toHaveBeenCalledOnce();
  });

  it('bounds a stalled connection and cleans up after the deadline', async () => {
    vi.useFakeTimers();
    const db = setup();
    db.begin.mockImplementation(() => new Promise(() => {}));
    const operation = probeImportWorkerDatabase(options, db.connect);
    const rejected = expect(operation).rejects.toBeInstanceOf(ImportDatabaseProbeError);
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    await expect(operation).rejects.toMatchObject({ code: 'DATABASE_PROBE_TIMEOUT' });
    expect(db.end).toHaveBeenCalledOnce();
  });

  it('reports pool cleanup failure safely and preserves an earlier schema failure', async () => {
    const healthy = setup();
    healthy.end.mockRejectedValue(new Error('raw database connection secret'));
    await expect(probeImportWorkerDatabase(options, healthy.connect)).rejects.toMatchObject({
      code: 'IMPORT_DATABASE_PROBE_FAILED',
      message: 'IMPORT_DATABASE_PROBE_FAILED',
    });

    const outdated = setup({ queryFailure: { code: '42703' } });
    outdated.end.mockRejectedValue(new Error('raw database connection secret'));
    await expect(probeImportWorkerDatabase(options, outdated.connect)).rejects.toMatchObject({
      code: 'IMPORT_SCHEMA_NOT_READY',
    });
  });
});
