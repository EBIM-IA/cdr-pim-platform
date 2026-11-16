import { createImportBatchRuntime, type ImportBatchRuntime } from '@cdr/api/import-worker';
import {
  importBatchPayloadSchema,
  JobType,
  type ImportBatchPayload,
  type JobEnvelope,
} from '@cdr/contracts';
import type { WorkerEnv } from '@cdr/config';
import type { JobContext, JobHandler } from '../runtime/job-handler';
import { PermanentJobError, RetryableJobError } from '../runtime/job-handler';
/** SQS owns work distribution, retry and DLQ; PostgreSQL owns progress and idempotency. */
export class ImportBatchHandler implements JobHandler<ImportBatchPayload> {
  readonly type = JobType.IMPORT_BATCH;
  private runtime: ImportBatchRuntime | undefined;
  constructor(
    private readonly env: Pick<
      WorkerEnv,
      | 'DATABASE_URL'
      | 'DATABASE_POOL_MAX'
      | 'DATABASE_SSL'
      | 'DATABASE_SSL_CA_FILE'
      | 'QUEUE_VISIBILITY_TIMEOUT_SECONDS'
    >,
    private readonly createRuntime = createImportBatchRuntime,
  ) {}
  parse(payload: Record<string, unknown>) {
    const parsed = importBatchPayloadSchema.safeParse(payload);
    if (!parsed.success)
      throw new PermanentJobError('IMPORT_BATCH payload does not match its contract');
    return parsed.data;
  }
  async handle(payload: ImportBatchPayload, _envelope: JobEnvelope, context: JobContext) {
    if (!this.env.DATABASE_URL)
      throw new Error('IMPORT_BATCH requires a configured worker database connection');
    this.runtime ??= this.createRuntime({
      url: this.env.DATABASE_URL,
      poolMax: this.env.DATABASE_POOL_MAX,
      ssl: this.env.DATABASE_SSL,
      sslCaFile: this.env.DATABASE_SSL_CA_FILE,
      executionLeaseMs: Math.max(1000, Math.floor(this.env.QUEUE_VISIBILITY_TIMEOUT_SECONDS * 750)),
    });
    try {
      await this.runtime.processBatch(payload.batchId);
    } catch (error) {
      // The DB execution lease is shorter than broker visibility. Waiting this long
      // allows recovery instead of exhausting the retry budget on our own live claim.
      throw new RetryableJobError(
        'La importación requiere un nuevo intento del broker.',
        this.env.QUEUE_VISIBILITY_TIMEOUT_SECONDS,
        { cause: error },
      );
    }
    context.logger.info('Import batch execution settled', { batchId: payload.batchId });
  }
  async close() {
    await this.runtime?.close();
  }
}
