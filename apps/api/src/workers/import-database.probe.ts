import { createDatabase, type DatabaseOptions } from '../database/drizzle.client';

export type ImportDatabaseProbeCode =
  | 'DATABASE_URL_MISSING'
  | 'DATABASE_CONNECTION_FAILED'
  | 'DATABASE_AUTHENTICATION_FAILED'
  | 'DATABASE_PERMISSION_DENIED'
  | 'DATABASE_TLS_VERIFICATION_FAILED'
  | 'DATABASE_CA_BUNDLE_UNAVAILABLE'
  | 'DATABASE_TLS_REQUIRED'
  | 'DATABASE_READ_ONLY_REQUIRED'
  | 'IMPORT_SCHEMA_NOT_READY'
  | 'DATABASE_QUERY_TIMEOUT'
  | 'DATABASE_PROBE_TIMEOUT'
  | 'IMPORT_DATABASE_PROBE_FAILED';

export class ImportDatabaseProbeError extends Error {
  constructor(
    readonly code: ImportDatabaseProbeCode,
    cause?: unknown,
  ) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'ImportDatabaseProbeError';
  }
}

export interface ImportDatabaseProbeResult {
  readonly connected: true;
  readonly tlsEnabled: boolean;
  readonly readOnly: true;
  readonly importSchemaReady: true;
}

function safeFailure(error: unknown): ImportDatabaseProbeError {
  if (error instanceof ImportDatabaseProbeError) return error;
  const code = (error as { code?: string } | null)?.code;
  const codes: Record<string, ImportDatabaseProbeCode> = {
    '42P01': 'IMPORT_SCHEMA_NOT_READY',
    '42703': 'IMPORT_SCHEMA_NOT_READY',
    '42501': 'DATABASE_PERMISSION_DENIED',
    '28P01': 'DATABASE_AUTHENTICATION_FAILED',
    '28000': 'DATABASE_AUTHENTICATION_FAILED',
    '57014': 'DATABASE_QUERY_TIMEOUT',
    ECONNREFUSED: 'DATABASE_CONNECTION_FAILED',
    ECONNRESET: 'DATABASE_CONNECTION_FAILED',
    ETIMEDOUT: 'DATABASE_CONNECTION_FAILED',
    ENOTFOUND: 'DATABASE_CONNECTION_FAILED',
    CERT_HAS_EXPIRED: 'DATABASE_TLS_VERIFICATION_FAILED',
    SELF_SIGNED_CERT_IN_CHAIN: 'DATABASE_TLS_VERIFICATION_FAILED',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'DATABASE_TLS_VERIFICATION_FAILED',
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'DATABASE_TLS_VERIFICATION_FAILED',
    ERR_TLS_CERT_ALTNAME_INVALID: 'DATABASE_TLS_VERIFICATION_FAILED',
  };
  if (code && codes[code]) return new ImportDatabaseProbeError(codes[code], error);
  if (error instanceof Error && error.message.startsWith('DATABASE_SSL_CA_FILE '))
    return new ImportDatabaseProbeError('DATABASE_CA_BUNDLE_UNAVAILABLE', error);
  return new ImportDatabaseProbeError('IMPORT_DATABASE_PROBE_FAILED', error);
}

/** Real worker connection and schema check; no jobs, HTTP, migrations or catalog writes. */
export async function probeImportWorkerDatabase(
  options: DatabaseOptions,
  connect = createDatabase,
): Promise<ImportDatabaseProbeResult> {
  let connection: ReturnType<typeof createDatabase> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let result: ImportDatabaseProbeResult | undefined;
  let failure: ImportDatabaseProbeError | undefined;
  try {
    connection = connect(options);
    const sql = connection.sql;
    const probe = sql.begin('read only', async (transaction) => {
      await transaction`SELECT set_config('statement_timeout', '10000', true)`;
      const [session] = await transaction<
        {
          connected: boolean;
          tlsEnabled: boolean;
          readOnly: boolean;
        }[]
      >`
        SELECT 1 = 1 AS connected,
          COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS "tlsEnabled",
          current_setting('transaction_read_only') = 'on' AS "readOnly"
      `;
      if (!session?.connected) throw new ImportDatabaseProbeError('DATABASE_CONNECTION_FAILED');
      if (!session.readOnly) throw new ImportDatabaseProbeError('DATABASE_READ_ONLY_REQUIRED');
      if (options.ssl && !session.tlsEnabled)
        throw new ImportDatabaseProbeError('DATABASE_TLS_REQUIRED');
      // LIMIT 0 checks table/column existence and SELECT permission without returning any row data.
      await transaction`
        SELECT e.batch_id, e.status, e.actor, e.processed_rows, e.total_rows,
          e.queued_at, e.started_at, e.updated_at, e.completed_at, e.lease_until,
          e.lease_token, e.error, e.dispatched_at,
          b.id, b.target, b.format, b.original_file_name, b.source_file_format,
          b.status, b.idempotency_key, b.payload_hash, b.category_code, b.created_by,
          b.total_rows, b.valid_rows, b.invalid_rows, b.created_at, b.confirmed_at,
          b.processing_started_at,
          r.batch_id, r.row_number, r.valid, r.data, r.metadata, r.errors, r.created_at
        FROM public.import_executions e
        CROSS JOIN public.import_batches b
        CROSS JOIN public.import_rows r
        LIMIT 0
      `;
      return {
        connected: true,
        tlsEnabled: session.tlsEnabled,
        readOnly: true,
        importSchemaReady: true,
      } as const;
    });
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new ImportDatabaseProbeError('DATABASE_PROBE_TIMEOUT')),
        30_000,
      );
      timer.unref?.();
    });
    result = await Promise.race([probe, deadline]);
  } catch (error) {
    failure = safeFailure(error);
  } finally {
    if (timer) clearTimeout(timer);
    try {
      await connection?.sql.end({ timeout: 5 });
    } catch (error) {
      failure ??= safeFailure(error);
    }
  }
  if (failure) throw failure;
  if (!result) throw new ImportDatabaseProbeError('IMPORT_DATABASE_PROBE_FAILED');
  return result;
}
