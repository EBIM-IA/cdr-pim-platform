import { type ApiEnv, loadApiEnv } from '@cdr/config';
import { JobType, type JobEnvelope } from '@cdr/contracts';
import {
  InMemoryQueueAdapter,
  QUEUE_PORT,
  type PublishResult,
  type QueuePort,
} from '@cdr/messaging';
import { DependencyUnavailableError, type Logger } from '@cdr/shared';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { Role } from '../../src/modules/identity/domain/entities/role';
import {
  TOKEN_SERVICE,
  type TokenServicePort,
} from '../../src/modules/identity/domain/ports/token-service.port';
import { API_ENV, LOGGER } from '../../src/shared/tokens';

/**
 * AX integration (TEMPORARY QAS MOCK) through the real HTTP pipeline: global guards,
 * throttler, correlation middleware, body parser, exception filter and the dedicated
 * machine guard. No database, no SQS — the queue is an in-memory double we can make fail.
 */

// Throwaway values that never leave the process. Not credentials of any environment.
const AX_TOKEN = 'ax-bootstrap-test-token-'.padEnd(64, '0');
const TEST_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  LOG_LEVEL: 'debug',
  DATABASE_URL: 'postgres://cdr:not-used@127.0.0.1:5432/cdr_pim_bootstrap',
  DATABASE_SSL: 'false',
  AUTH_MODE: 'local',
  AUTH_LOCAL_USER_ID: 'bootstrap-admin',
  AUTH_LOCAL_EMAIL: 'bootstrap-admin@casadelruliman.com',
  AUTH_LOCAL_PASSWORD: 'bootstrap-local-password',
  AUTH_LOCAL_ROLES: 'ADMIN',
  JWT_ACCESS_SECRET: 'bootstrap-test-access-secret-32-chars-min',
  QUEUE_DRIVER: 'memory',
  STORAGE_DRIVER: 'memory',
  AI_PROVIDER: 'fake',
  SWAGGER_ENABLED: 'false',
  AX_INTEGRATION_MODE: 'mock',
  AX_INTEGRATION_AUTH_MODE: 'static_bearer',
  AX_INTEGRATION_TOKEN: AX_TOKEN,
  RATE_LIMIT_GLOBAL: '1000',
  RATE_LIMIT_DEFAULT: '1000',
};

const PATH = '/api/v1/productos/sincronizar';

const batch = {
  idLote: 'AX-20260928-000001',
  fechaEnvio: '2026-09-28T15:30:00Z',
  sistemaOrigen: 'SISMETIC_AX',
  productos: [
    {
      codigoArticulo: '000123',
      codigoProveedor: 'PRV-01',
      codigoUnificador: 'UNI-9',
      codigoLinea: 'RODAMIENTOS',
      tipoAplicacion: 'AUTOMOTRIZ',
      marca: 'SKF',
      fechaModificacion: '2026-09-28T15:00:00Z',
    },
    { codigoArticulo: '000456', codigoProveedor: 'PRV-02', codigoLinea: 'SELLOS' },
  ],
};

/** In-memory queue that can be told to fail like an unreachable SQS. */
class SwitchableQueue implements QueuePort {
  readonly inner = new InMemoryQueueAdapter();
  failing = false;
  publish(envelope: JobEnvelope): Promise<PublishResult> {
    if (this.failing) return Promise.reject(new DependencyUnavailableError('sqs:sendMessage'));
    return this.inner.publish(envelope);
  }
  publishBatch(envelopes: readonly JobEnvelope[]): Promise<PublishResult[]> {
    return Promise.all(envelopes.map((envelope) => this.publish(envelope)));
  }
}

/** Captures everything the API logs, serialised exactly as it would reach CloudWatch. */
const logLines: string[] = [];
const recordingLogger: Logger = {
  debug: (message, meta) => logLines.push(JSON.stringify({ message, ...meta })),
  info: (message, meta) => logLines.push(JSON.stringify({ message, ...meta })),
  warn: (message, meta) => logLines.push(JSON.stringify({ message, ...meta })),
  error: (message, meta) =>
    logLines.push(
      JSON.stringify({ message, ...meta }, (_k, v: unknown) =>
        v instanceof Error ? { name: v.name, message: v.message } : v,
      ),
    ),
  child: () => recordingLogger,
};

let ipCounter = 0;
/** A fresh client address per test so the per-IP throttler never couples two tests. */
const nextIp = () => `198.51.100.${(ipCounter += 1)}`;

async function createApp(overrides?: { env?: ApiEnv; queue?: QueuePort }) {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LOGGER)
    .useValue(recordingLogger);
  if (overrides?.queue) builder = builder.overrideProvider(QUEUE_PORT).useValue(overrides.queue);
  if (overrides?.env) builder = builder.overrideProvider(API_ENV).useValue(overrides.env);
  const app = (await builder.compile()).createNestApplication();
  (app.getHttpAdapter().getInstance() as { set(setting: string, value: number): void }).set(
    'trust proxy',
    1,
  );
  app.setGlobalPrefix('/api/v1');
  await app.init();
  return app;
}

describe('POST /api/v1/productos/sincronizar (QAS mock)', () => {
  let app: INestApplication;
  const queue = new SwitchableQueue();

  beforeAll(async () => {
    Object.assign(process.env, TEST_ENV);
    app = await createApp({ queue });
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    queue.failing = false;
    queue.inner.clear();
  });

  const post = (ip = nextIp()) =>
    request(app.getHttpServer()).post(PATH).set('x-forwarded-for', ip);

  it('accepts a valid batch with 202 and the exact contractual body', async () => {
    const response = await post()
      .set('authorization', `Bearer ${AX_TOKEN}`)
      .send(batch)
      .expect(202);

    expect(Object.keys(response.body).sort()).toEqual(
      ['correlationId', 'estado', 'fechaRecepcion', 'idLote', 'registrosRecibidos'].sort(),
    );
    expect(response.body).toMatchObject({
      idLote: batch.idLote,
      estado: 'RECIBIDO',
      registrosRecibidos: 2,
      fechaRecepcion: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    });
    expect(response.headers['x-cdr-qas-mock']).toBe('true');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-correlation-id']).toBe(response.body.correlationId);
  });

  it('propagates an inbound X-Correlation-Id to the response and the job', async () => {
    const response = await post()
      .set('authorization', `Bearer ${AX_TOKEN}`)
      .set('x-correlation-id', 'sismetic-trace-0001')
      .send(batch)
      .expect(202);

    expect(response.body.correlationId).toBe('sismetic-trace-0001');
    expect(response.headers['x-correlation-id']).toBe('sismetic-trace-0001');
    expect(queue.inner.pending[0]?.correlationId).toBe('sismetic-trace-0001');
  });

  it('publishes one AX_BATCH_RECEIVED job carrying metadata only', async () => {
    await post().set('authorization', `Bearer ${AX_TOKEN}`).send(batch).expect(202);

    expect(queue.inner.pending).toHaveLength(1);
    const [envelope] = queue.inner.pending;
    expect(envelope).toMatchObject({
      type: JobType.AX_BATCH_RECEIVED,
      idempotencyKey: `ax-batch-received:${batch.idLote}`,
      payload: { idLote: batch.idLote, registrosRecibidos: 2, sistemaOrigen: 'SISMETIC_AX' },
    });
    expect(JSON.stringify(envelope)).not.toContain('000123');
  });

  it('accepts the same idLote again: no idempotency yet (IDEMPOTENCY_NOT_IMPLEMENTED_YET)', async () => {
    await post().set('authorization', `Bearer ${AX_TOKEN}`).send(batch).expect(202);
    await post().set('authorization', `Bearer ${AX_TOKEN}`).send(batch).expect(202);
    expect(queue.inner.pending).toHaveLength(2);
  });

  it('answers 401 without a token, and publishes nothing', async () => {
    const response = await post().send(batch).expect(401);
    expect(response.body.error).toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Missing bearer token',
      correlationId: expect.any(String),
      path: PATH,
    });
    expect(response.headers['x-cdr-qas-mock']).toBe('true');
    expect(queue.inner.pending).toHaveLength(0);
  });

  it('answers 401 for a wrong token', async () => {
    const response = await post()
      .set('authorization', 'Bearer not-the-token')
      .send(batch)
      .expect(401);
    expect(response.body.error).toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Invalid integration token',
    });
  });

  it('answers 401 for a valid HUMAN JWT, even an ADMIN one', async () => {
    const { accessToken } = await app.get<TokenServicePort>(TOKEN_SERVICE).issue({
      id: 'bootstrap-admin',
      email: 'bootstrap-admin@casadelruliman.com',
      roles: [Role.Admin],
    });
    await post().set('authorization', `Bearer ${accessToken}`).send(batch).expect(401);
    expect(queue.inner.pending).toHaveLength(0);
  });

  it('does not let the AX token reach a human endpoint', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('authorization', `Bearer ${AX_TOKEN}`)
      .expect(401);
  });

  it('answers 400 with the shared envelope for a schema violation', async () => {
    const response = await post()
      .set('authorization', `Bearer ${AX_TOKEN}`)
      .send({ ...batch, productos: [{ ...batch.productos[0], codigoArticulo: 123 }] })
      .expect(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: {
        issues: [
          { path: 'productos.0.codigoArticulo', message: 'Expected string, received number' },
        ],
      },
      correlationId: expect.any(String),
      timestamp: expect.any(String),
      path: PATH,
    });
    expect(queue.inner.pending).toHaveLength(0);
  });

  it('answers 400 for malformed JSON, still with a correlation id', async () => {
    const response = await post()
      .set('authorization', `Bearer ${AX_TOKEN}`)
      .set('content-type', 'application/json')
      .set('x-correlation-id', 'sismetic-bad-json')
      .send('{"idLote": "AX-1",')
      .expect(400);
    expect(response.body.error).toMatchObject({
      code: 'BAD_REQUEST',
      correlationId: 'sismetic-bad-json',
      path: PATH,
    });
    expect(response.headers['x-correlation-id']).toBe('sismetic-bad-json');
  });

  it('answers 400 for an empty productos array', async () => {
    await post()
      .set('authorization', `Bearer ${AX_TOKEN}`)
      .send({ ...batch, productos: [] })
      .expect(400);
  });

  it('answers 413, not 500, for a body over the technical limit', async () => {
    const huge = {
      ...batch,
      productos: Array.from({ length: 2_000 }, (_, i) => ({
        codigoArticulo: String(i).padStart(10, '0'),
        codigoProveedor: 'PRV-01',
        codigoLinea: 'RODAMIENTOS',
        tipoAplicacion: 'AUTOMOTRIZ',
        marca: 'SKF',
      })),
    };
    const response = await post().set('authorization', `Bearer ${AX_TOKEN}`).send(huge).expect(413);
    expect(response.body.error).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds the size limit',
      correlationId: expect.any(String),
    });
    expect(response.headers['x-correlation-id']).toBe(response.body.error.correlationId);
  });

  it('answers 503 when the event cannot be delivered to the queue', async () => {
    queue.failing = true;
    const response = await post()
      .set('authorization', `Bearer ${AX_TOKEN}`)
      .send(batch)
      .expect(503);
    expect(response.body.error).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });

  it('rate-limits the integration route in its own bucket with 429', async () => {
    const ip = nextIp();
    const limit = loadApiEnv(TEST_ENV).RATE_LIMIT_INTEGRATION;
    for (let attempt = 1; attempt <= limit; attempt += 1) {
      await post(ip).set('authorization', `Bearer ${AX_TOKEN}`).send(batch).expect(202);
    }
    const blocked = await post(ip)
      .set('authorization', `Bearer ${AX_TOKEN}`)
      .send(batch)
      .expect(429);
    expect(blocked.body.error).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(blocked.headers['retry-after']).toBeTypeOf('string');

    // The human login bucket of the same client is untouched.
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', ip)
      .send({ email: 'nobody@example.test', password: 'definitely-wrong' })
      .expect(401);
  });

  it('never writes the token, the authorization header or product values to the logs', async () => {
    logLines.length = 0;
    await post().set('authorization', `Bearer ${AX_TOKEN}`).send(batch).expect(202);
    await post().set('authorization', `Bearer ${AX_TOKEN}x`).send(batch).expect(401);
    await post()
      .set('authorization', `Bearer ${AX_TOKEN}`)
      .send({ ...batch, productos: [] })
      .expect(400);
    queue.failing = true;
    await post().set('authorization', `Bearer ${AX_TOKEN}`).send(batch).expect(503);

    const logged = logLines.join('\n');
    expect(logged).toContain('AX batch received');
    expect(logged).not.toContain(AX_TOKEN);
    expect(logged.toLowerCase()).not.toContain('bearer');
    for (const value of ['000123', '000456', 'PRV-01', 'RODAMIENTOS']) {
      expect(logged).not.toContain(value);
    }
  });
});

describe('POST /api/v1/productos/sincronizar with the integration disabled', () => {
  let app: INestApplication;

  beforeAll(async () => {
    Object.assign(process.env, TEST_ENV);
    const env = loadApiEnv({
      ...TEST_ENV,
      AX_INTEGRATION_MODE: 'disabled',
      AX_INTEGRATION_AUTH_MODE: 'disabled',
      AX_INTEGRATION_TOKEN: undefined,
    });
    app = await createApp({ env });
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it('answers 404 like a route that does not exist', async () => {
    const response = await request(app.getHttpServer())
      .post(PATH)
      .set('authorization', `Bearer ${AX_TOKEN}`)
      .send(batch)
      .expect(404);
    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND', path: PATH });
    expect(response.headers['x-cdr-qas-mock']).toBeUndefined();
  });
});
