import { type ApiEnv, loadApiEnv } from '@cdr/config';
import { ConflictError, type Logger } from '@cdr/shared';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import {
  AX_INBOX_REPOSITORY,
  type AxInboxBatch,
  type AxInboxReceipt,
  type AxInboxRepositoryPort,
} from '../../src/modules/ax-integration/domain/ports/ax-inbox.repository.port';
import { Role } from '../../src/modules/identity/domain/entities/role';
import {
  TOKEN_SERVICE,
  type TokenServicePort,
} from '../../src/modules/identity/domain/ports/token-service.port';
import { API_ENV, LOGGER } from '../../src/shared/tokens';

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
  AX_INTEGRATION_MODE: 'inbound',
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
  ],
};

class MemoryInbox implements AxInboxRepositoryPort {
  batches: AxInboxBatch[] = [];

  clear(): void {
    this.batches = [];
  }

  async receive(input: AxInboxBatch): Promise<AxInboxReceipt> {
    const existing = this.batches.find((item) => item.idLote === input.idLote);
    if (existing) {
      if (existing.requestHash !== input.requestHash) throw new ConflictError('different payload');
      return receipt(existing);
    }
    this.batches.push(input);
    return receipt(input);
  }

  async findByExternalId(idLote: string): Promise<AxInboxReceipt | null> {
    const found = this.batches.find((item) => item.idLote === idLote);
    return found ? receipt(found) : null;
  }
}

const logLines: string[] = [];
const recordingLogger: Logger = {
  debug: (message, meta) => logLines.push(JSON.stringify({ message, ...meta })),
  info: (message, meta) => logLines.push(JSON.stringify({ message, ...meta })),
  warn: (message, meta) => logLines.push(JSON.stringify({ message, ...meta })),
  error: (message, meta) => logLines.push(JSON.stringify({ message, ...meta })),
  child: () => recordingLogger,
};

let ipCounter = 0;
const nextIp = () => `198.51.100.${(ipCounter += 1)}`;

async function createApp(inbox: AxInboxRepositoryPort, env?: ApiEnv) {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LOGGER)
    .useValue(recordingLogger)
    .overrideProvider(AX_INBOX_REPOSITORY)
    .useValue(inbox);
  if (env) builder = builder.overrideProvider(API_ENV).useValue(env);
  const app = (await builder.compile()).createNestApplication();
  (app.getHttpAdapter().getInstance() as { set(setting: string, value: number): void }).set(
    'trust proxy',
    1,
  );
  app.setGlobalPrefix('/api/v1');
  await app.init();
  return app;
}

describe('AX -> PIM inbound HTTP pipeline', () => {
  let app: INestApplication;
  const inbox = new MemoryInbox();

  beforeAll(async () => {
    Object.assign(process.env, TEST_ENV);
    app = await createApp(inbox);
  }, 30_000);

  afterAll(async () => app?.close());
  beforeEach(() => inbox.clear());

  const post = () => request(app.getHttpServer()).post(PATH).set('x-forwarded-for', nextIp());

  it('stores a valid batch and exposes its status', async () => {
    const response = await post()
      .set('authorization', `Bearer ${AX_TOKEN}`)
      .set('x-correlation-id', 'sismetic-trace-0001')
      .send(batch)
      .expect(202);

    expect(response.body).toMatchObject({
      idLote: batch.idLote,
      estado: 'RECIBIDO',
      registrosRecibidos: 1,
      correlationId: 'sismetic-trace-0001',
    });
    expect(response.headers['x-cdr-ax-inbound']).toBe('true');
    expect(inbox.batches).toHaveLength(1);

    const status = await request(app.getHttpServer())
      .get(`/api/v1/productos/sincronizaciones/${batch.idLote}`)
      .set('x-forwarded-for', nextIp())
      .set('authorization', `Bearer ${AX_TOKEN}`)
      .expect(200);
    expect(status.body).toMatchObject({
      idLote: batch.idLote,
      estado: 'RECIBIDO',
      sistemaOrigen: 'SISMETIC_AX',
      requestHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
  });

  it('is idempotent and rejects a changed retry', async () => {
    await post().set('authorization', `Bearer ${AX_TOKEN}`).send(batch).expect(202);
    await post().set('authorization', `Bearer ${AX_TOKEN}`).send(batch).expect(202);
    expect(inbox.batches).toHaveLength(1);
    await post()
      .set('authorization', `Bearer ${AX_TOKEN}`)
      .send({ ...batch, productos: [{ ...batch.productos[0], marca: 'OTHER' }] })
      .expect(409);
  });

  it('requires the machine token and rejects a human JWT', async () => {
    await post().send(batch).expect(401);
    const { accessToken } = await app.get<TokenServicePort>(TOKEN_SERVICE).issue({
      id: 'bootstrap-admin',
      email: 'bootstrap-admin@casadelruliman.com',
      roles: [Role.Admin],
    });
    await post().set('authorization', `Bearer ${accessToken}`).send(batch).expect(401);
  });

  it('validates the contract and never logs product values or the token', async () => {
    logLines.length = 0;
    await post()
      .set('authorization', `Bearer ${AX_TOKEN}`)
      .send({ ...batch, productos: [{ ...batch.productos[0], codigoArticulo: 123 }] })
      .expect(400);
    await post().set('authorization', `Bearer ${AX_TOKEN}`).send(batch).expect(202);
    const logged = logLines.join('\n');
    expect(logged).not.toContain(AX_TOKEN);
    expect(logged).not.toContain('000123');
    expect(logged).not.toContain('PRV-01');
  });
});

describe('AX receiver disabled', () => {
  let app: INestApplication;

  beforeAll(async () => {
    Object.assign(process.env, TEST_ENV);
    app = await createApp(
      new MemoryInbox(),
      loadApiEnv({
        ...TEST_ENV,
        AX_INTEGRATION_MODE: 'disabled',
        AX_INTEGRATION_AUTH_MODE: 'disabled',
        AX_INTEGRATION_TOKEN: undefined,
      }),
    );
  });

  afterAll(async () => app?.close());

  it('answers 404 like an unavailable route', async () => {
    await request(app.getHttpServer())
      .post(PATH)
      .set('authorization', `Bearer ${AX_TOKEN}`)
      .send(batch)
      .expect(404);
  });
});

function receipt(input: AxInboxBatch): AxInboxReceipt {
  return {
    idLote: input.idLote,
    fechaEnvio: input.fechaEnvio,
    sistemaOrigen: input.sistemaOrigen,
    requestHash: input.requestHash,
    receivedAt: input.receivedAt,
    correlationId: input.correlationId,
    recordCount: input.productos.length,
  };
}
