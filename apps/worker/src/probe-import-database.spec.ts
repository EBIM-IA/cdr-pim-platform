import { describe, expect, it, vi } from 'vitest';
import { ImportDatabaseProbeError } from '@cdr/api/import-worker';
import { runImportDatabaseProbe } from './probe-import-database';

const local = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  DATABASE_URL: 'postgres://probe:private@localhost/probe_test',
};
const result = {
  connected: true,
  tlsEnabled: false,
  readOnly: true,
  importSchemaReady: true,
} as const;

describe('Standalone worker database probe', () => {
  it('checks a local database without starting a consumer and reports only safe booleans', async () => {
    const probe = vi.fn().mockResolvedValue(result),
      write = vi.fn();
    expect(await runImportDatabaseProbe(local, { probe, write })).toBe(0);
    expect(probe).toHaveBeenCalledExactlyOnceWith({
      url: local.DATABASE_URL,
      poolMax: 5,
      ssl: false,
      sslCaFile: undefined,
    });
    expect(JSON.parse(write.mock.calls[0]![0])).toEqual({
      service: 'cdr-pim-worker',
      check: 'import-database',
      status: 'ok',
      ...result,
    });
    expect(JSON.stringify(write.mock.calls)).not.toContain('private');
  });

  it('refuses an incomplete hosted environment before attempting a database connection', async () => {
    const probe = vi.fn(),
      write = vi.fn();
    expect(
      await runImportDatabaseProbe(
        { ...local, NODE_ENV: 'production', APP_ENV: 'qas' },
        { probe, write },
      ),
    ).toBe(1);
    expect(probe).not.toHaveBeenCalled();
    expect(JSON.parse(write.mock.calls[0]![0])).toMatchObject({
      status: 'failed',
      code: 'INVALID_WORKER_ENVIRONMENT',
    });
  });

  it.each([
    [new ImportDatabaseProbeError('IMPORT_SCHEMA_NOT_READY'), 'IMPORT_SCHEMA_NOT_READY'],
    [
      new Error('postgres://probe:private@private.rds.amazonaws.com/operational'),
      'IMPORT_DATABASE_PROBE_FAILED',
    ],
  ])(
    'prints only a safe failure code and never a raw connection error',
    async (failure, expectedCode) => {
      const probe = vi.fn().mockRejectedValue(failure),
        write = vi.fn();
      expect(await runImportDatabaseProbe(local, { probe, write })).toBe(1);
      expect(JSON.parse(write.mock.calls[0]![0])).toMatchObject({
        status: 'failed',
        code: expectedCode,
      });
      expect(JSON.stringify(write.mock.calls)).not.toMatch(
        /postgres:|private|rds\.amazonaws|stack/u,
      );
    },
  );
});
