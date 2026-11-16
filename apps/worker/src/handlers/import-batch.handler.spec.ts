import { describe, expect, it, vi } from 'vitest';
import { createLogger, newUuid } from '@cdr/shared';
import { buildJobEnvelope } from '@cdr/messaging';
import { JobType } from '@cdr/contracts';
import { ImportBatchHandler } from './import-batch.handler';
import { RetryableJobError } from '../runtime/job-handler';
const env = {
  DATABASE_URL: 'postgres://local:local@localhost:5432/cdr_test',
  DATABASE_POOL_MAX: 2,
  DATABASE_SSL: false,
  DATABASE_SSL_CA_FILE: undefined,
  QUEUE_VISIBILITY_TIMEOUT_SECONDS: 120,
};
describe('SQS import handler', () => {
  it('defers a recoverable runtime failure beyond its execution lease instead of acknowledging it', async () => {
    const failure = new Error('database temporarily unavailable');
    const handler = new ImportBatchHandler(env, () => ({
      processBatch: vi.fn().mockRejectedValue(failure),
      close: vi.fn(),
    }));
    const batchId = newUuid();
    const envelope = buildJobEnvelope({
      type: JobType.IMPORT_BATCH,
      payload: { batchId },
      source: 'test',
      idempotencyKey: batchId,
    });
    await expect(
      handler.handle({ batchId }, envelope, {
        logger: createLogger({ service: 'test', environment: 'test', level: 'error' }),
        attempt: 1,
      }),
    ).rejects.toMatchObject({
      name: RetryableJobError.name,
      retryDelaySeconds: 120,
      cause: failure,
    });
  });
  it('rejects malformed identity and delegates validated jobs to one reusable runtime without starting HTTP', async () => {
    const processBatch = vi.fn(),
      close = vi.fn(),
      factory = vi.fn(() => ({ processBatch, close }));
    const handler = new ImportBatchHandler(env, factory);
    expect(() => handler.parse({ batchId: 'invalid' })).toThrow('contract');
    const batchId = newUuid(),
      envelope = buildJobEnvelope({
        type: JobType.IMPORT_BATCH,
        payload: { batchId },
        source: 'test',
        idempotencyKey: batchId,
      }),
      context = {
        logger: createLogger({ service: 'test', environment: 'test', level: 'error' }),
        attempt: 1,
      };
    await handler.handle(handler.parse(envelope.payload), envelope, context);
    await handler.handle(handler.parse(envelope.payload), envelope, context);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ executionLeaseMs: 90000 }));
    expect(processBatch).toHaveBeenCalledWith(batchId);
    await handler.close();
    expect(close).toHaveBeenCalledOnce();
  });
});
