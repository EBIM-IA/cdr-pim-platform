import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  probe: vi.fn(),
  queue: vi.fn(),
  health: vi.fn(),
  consume: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@cdr/api/import-worker', () => ({ probeImportWorkerDatabase: runtime.probe }));
vi.mock('@cdr/config', () => ({
  loadWorkerEnv: () => ({
    APP_ENV: 'qas',
    DATABASE_URL: 'postgres://worker:private@database/private',
    DATABASE_POOL_MAX: 5,
    DATABASE_SSL: true,
    DATABASE_SSL_CA_FILE: '/app/certs/rds-global-bundle.pem',
    QUEUE_DRIVER: 'sqs',
    SQS_JOBS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/private/jobs',
    WORKER_PORT: 3002,
  }),
}));
vi.mock('@cdr/messaging', () => ({
  SqsQueueAdapter: class {
    constructor() {
      runtime.queue();
    }
  },
  InMemoryQueueAdapter: class {},
}));
vi.mock('@cdr/shared', () => ({
  createLogger: () => runtime.logger,
  sanitizeLogText: (message: string) => message,
}));
vi.mock('./health-server', () => ({ startHealthServer: runtime.health }));
vi.mock('./handlers/import-batch.handler', () => ({ ImportBatchHandler: class {} }));
vi.mock('./handlers/ai-embedding.handler', () => ({ AiEmbeddingHandler: class {} }));
vi.mock('./handlers/skeleton-ping.handler', () => ({ SkeletonPingHandler: class {} }));
vi.mock('./runtime/handler-registry', () => ({
  HandlerRegistry: class {
    register() {
      return this;
    }
  },
}));
vi.mock('./runtime/consumer', () => ({
  JobConsumer: class {
    start = runtime.consume;
  },
}));

describe('Hosted worker database startup gate', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(process, 'on').mockReturnValue(process);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    runtime.consume.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('does not create SQS, expose health or consume until the exact hosted database passes', async () => {
    let resolveProbe!: (result: unknown) => void;
    runtime.probe.mockImplementation(() => new Promise((resolve) => (resolveProbe = resolve)));
    await import('./main');
    expect(runtime.probe).toHaveBeenCalledExactlyOnceWith({
      url: 'postgres://worker:private@database/private',
      poolMax: 5,
      ssl: true,
      sslCaFile: '/app/certs/rds-global-bundle.pem',
    });
    expect(runtime.queue).not.toHaveBeenCalled();
    expect(runtime.health).not.toHaveBeenCalled();
    expect(runtime.consume).not.toHaveBeenCalled();

    resolveProbe({
      connected: true,
      tlsEnabled: true,
      readOnly: true,
      importSchemaReady: true,
    });
    await vi.waitFor(() => expect(runtime.consume).toHaveBeenCalledOnce());
    expect(runtime.health).toHaveBeenCalledOnce();
    expect(runtime.queue).toHaveBeenCalledOnce();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('exits before any SQS or HTTP startup when the import schema is unavailable', async () => {
    runtime.probe.mockRejectedValue(new Error('IMPORT_SCHEMA_NOT_READY'));
    await import('./main');
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(1));
    expect(runtime.queue).not.toHaveBeenCalled();
    expect(runtime.health).not.toHaveBeenCalled();
    expect(runtime.consume).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'Fatal error during worker bootstrap:',
      'Error: IMPORT_SCHEMA_NOT_READY',
    );
  });
});
