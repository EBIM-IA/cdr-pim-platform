import {
  ImportDatabaseProbeError,
  probeImportWorkerDatabase,
  type ImportDatabaseProbeResult,
} from '@cdr/api/import-worker';
import { loadWorkerEnv } from '@cdr/config';

type ProbeDependencies = {
  readonly probe?: typeof probeImportWorkerDatabase;
  readonly write?: (line: string, failed: boolean) => void;
};

/** Standalone ECS command: validates the same env/TLS as main without starting its consumer. */
export async function runImportDatabaseProbe(
  source: NodeJS.ProcessEnv = process.env,
  dependencies: ProbeDependencies = {},
): Promise<number> {
  const write =
    dependencies.write ??
    ((line, failed) => (failed ? process.stderr : process.stdout).write(line + '\n'));
  try {
    const env = loadWorkerEnv(source);
    if (!env.DATABASE_URL) throw new ImportDatabaseProbeError('DATABASE_URL_MISSING');
    const result: ImportDatabaseProbeResult = await (
      dependencies.probe ?? probeImportWorkerDatabase
    )({
      url: env.DATABASE_URL,
      poolMax: env.DATABASE_POOL_MAX,
      ssl: env.DATABASE_SSL,
      sslCaFile: env.DATABASE_SSL_CA_FILE,
    });
    write(
      JSON.stringify({
        service: 'cdr-pim-worker',
        check: 'import-database',
        status: 'ok',
        ...result,
      }),
      false,
    );
    return 0;
  } catch (error) {
    // Never emit the URL, a raw driver error or a stack containing credentials/endpoints.
    const code =
      error instanceof ImportDatabaseProbeError
        ? error.code
        : error instanceof Error && error.name === 'EnvironmentValidationError'
          ? 'INVALID_WORKER_ENVIRONMENT'
          : 'IMPORT_DATABASE_PROBE_FAILED';
    write(
      JSON.stringify({
        service: 'cdr-pim-worker',
        check: 'import-database',
        status: 'failed',
        code,
      }),
      true,
    );
    return 1;
  }
}

if (require.main === module)
  void runImportDatabaseProbe().then((code) => {
    process.exitCode = code;
  });
