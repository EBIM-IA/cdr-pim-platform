import { OBJECT_STORAGE } from '@cdr/storage';
import { QUEUE_PORT } from '@cdr/messaging';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { EMBEDDING_PROVIDER } from '../../src/modules/ai/domain/ports/embedding-provider.port';
import { AUDIT_PORT } from '../../src/modules/audit/domain/ports/audit.port';
import { PRODUCT_REPOSITORY } from '../../src/modules/catalog/domain/ports/product-repository.port';
import { ProductsController } from '../../src/modules/catalog/presentation/products.controller';
import { EQUIVALENCE_GROUP_REPOSITORY } from '../../src/modules/equivalences/domain/ports/equivalence-group-repository.port';
import { HealthController } from '../../src/modules/health/presentation/health.controller';
import { Role } from '../../src/modules/identity/domain/entities/role';
import { CREDENTIAL_VERIFIER } from '../../src/modules/identity/domain/ports/credential-verifier.port';
import {
  TOKEN_SERVICE,
  type TokenServicePort,
} from '../../src/modules/identity/domain/ports/token-service.port';
import { AuthController } from '../../src/modules/identity/presentation/auth.controller';
import { JwtAuthGuard } from '../../src/modules/identity/presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/modules/identity/presentation/guards/roles.guard';
import { ImportsController } from '../../src/modules/imports/presentation/imports.controller';
import { ERP_PRODUCT_SOURCE } from '../../src/modules/integrations/domain/ports/erp-product-source.port';
import { PRODUCT_VECTOR_INDEX } from '../../src/modules/search/domain/ports/product-vector-index.port';
import { SearchController } from '../../src/modules/search/presentation/search.controller';
import { WORKSPACE_READ_MODEL } from '../../src/modules/workspaces/domain/ports/workspace-read-model.port';
import { WorkspacesController } from '../../src/modules/workspaces/presentation/workspaces.controller';
import { API_ENV, CLOCK, DATABASE, DATABASE_SQL, LOGGER } from '../../src/shared/tokens';

/**
 * Application bootstrap regression test.
 *
 * ── Why this file exists ────────────────────────────────────────────────────────
 * Finding C-1 of the foundation audit: an `import type` on a constructor-injected class
 * erases the import at runtime, so `emitDecoratorMetadata` writes `Function` into
 * `design:paramtypes` and Nest throws `UnknownDependenciesException` at bootstrap.
 *
 * The defect compiled, typechecked, linted clean and passed all 119 tests — because not one
 * of them ever built the DI container. This test closes that gap: it assembles the REAL
 * `AppModule` through the real Nest injector, which is the only thing that exercises
 * decorator metadata.
 *
 * If someone reintroduces a type-only import on an injected class, `compile()` throws here
 * and CI fails, instead of the container crash-looping in ECS.
 *
 * No database, queue or AI provider is contacted: `postgres.js` connects lazily, and the
 * default drivers are the in-memory/fake ones. No TCP port is opened either — supertest
 * drives the HTTP adapter in-process.
 */

// Set before `AppModule` is instantiated: ConfigModule validates the environment eagerly.
// These are throwaway values that never leave the process.
const TEST_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  LOG_LEVEL: 'error',
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
};

describe('AppModule bootstrap', () => {
  let app: INestApplication;

  beforeAll(async () => {
    Object.assign(process.env, TEST_ENV);

    // This single call is the regression guard: it resolves every provider in every module
    // through the Nest injector, using the same decorator metadata production uses.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    (
      app.getHttpAdapter().getInstance() as {
        set(setting: string, value: number): void;
      }
    ).set('trust proxy', 1);
    app.setGlobalPrefix('/api/v1');
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it('resolves the whole dependency graph', () => {
    expect(app).toBeDefined();
  });

  /**
   * Every controller whose constructor is injected BY TYPE — exactly the shape C-1 broke.
   * Resolving them proves `design:paramtypes` carries real classes, not `Function`.
   */
  it.each([
    ['ProductsController', ProductsController],
    ['HealthController', HealthController],
    ['AuthController', AuthController],
    ['SearchController', SearchController],
    ['ImportsController', ImportsController],
    ['WorkspacesController', WorkspacesController],
  ])('resolves %s with its type-injected dependencies', (_name, controller) => {
    expect(app.get(controller)).toBeInstanceOf(controller);
  });

  it.each([
    ['JwtAuthGuard', JwtAuthGuard],
    ['RolesGuard', RolesGuard],
  ])('resolves %s (injects Reflector by type)', (_name, guard) => {
    expect(app.get(guard)).toBeInstanceOf(guard);
  });

  /** Every published port must be bound to an adapter. A missing binding fails here. */
  it.each([
    ['PRODUCT_REPOSITORY', PRODUCT_REPOSITORY],
    ['PRODUCT_VECTOR_INDEX', PRODUCT_VECTOR_INDEX],
    ['EMBEDDING_PROVIDER', EMBEDDING_PROVIDER],
    ['EQUIVALENCE_GROUP_REPOSITORY', EQUIVALENCE_GROUP_REPOSITORY],
    ['ERP_PRODUCT_SOURCE', ERP_PRODUCT_SOURCE],
    ['TOKEN_SERVICE', TOKEN_SERVICE],
    ['CREDENTIAL_VERIFIER', CREDENTIAL_VERIFIER],
    ['AUDIT_PORT', AUDIT_PORT],
    ['QUEUE_PORT', QUEUE_PORT],
    ['OBJECT_STORAGE', OBJECT_STORAGE],
    ['WORKSPACE_READ_MODEL', WORKSPACE_READ_MODEL],
    ['API_ENV', API_ENV],
    ['LOGGER', LOGGER],
    ['CLOCK', CLOCK],
    ['DATABASE', DATABASE],
    ['DATABASE_SQL', DATABASE_SQL],
  ])('binds the %s port to an adapter', (_name, token) => {
    expect(app.get(token, { strict: false })).toBeDefined();
  });

  /**
   * Smoke test through the real HTTP pipeline — middleware, router and controller — without
   * opening a port. Liveness is used deliberately: it must not touch any dependency.
   */
  it('serves GET /api/v1/health/live through the real HTTP stack', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);

    expect(response.body).toMatchObject({ status: 'ok', service: expect.any(String) });
    // The correlation middleware must be wired for every route, health included.
    expect(response.headers['x-correlation-id']).toBeTypeOf('string');
  });

  it('protects the API by default with 401, not 403', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/products').expect(401);

    expect(response.body.error).toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Missing bearer token',
    });
  });

  it('returns 403 when an authenticated VIEWER attempts an EDITOR mutation', async () => {
    const tokens = app.get<TokenServicePort>(TOKEN_SERVICE);
    const { accessToken } = await tokens.issue({
      id: 'bootstrap-viewer',
      email: 'bootstrap-viewer@casadelruliman.com',
      roles: [Role.Viewer],
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(403);

    expect(response.body.error).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Insufficient role',
      details: { required: 'EDITOR' },
    });
  });

  it('authenticates the local account and exposes the current actor', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: TEST_ENV.AUTH_LOCAL_EMAIL,
        password: TEST_ENV.AUTH_LOCAL_PASSWORD,
      })
      .expect(200);

    expect(login.body).toMatchObject({
      actor: {
        id: TEST_ENV.AUTH_LOCAL_USER_ID,
        email: TEST_ENV.AUTH_LOCAL_EMAIL,
        roles: ['ADMIN'],
      },
      accessToken: expect.any(String),
      expiresIn: '15m',
    });
    expect(login.body).not.toHaveProperty('refreshToken');

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${login.body.accessToken as string}`)
      .expect(200);

    expect(me.body).toEqual({ actor: login.body.actor });
  });

  it('does not reveal which local credential was invalid', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_ENV.AUTH_LOCAL_EMAIL, password: 'definitely-wrong' })
      .expect(401);

    expect(response.body.error).toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Invalid email or password',
    });
  });

  it('returns the shared error envelope for an unknown route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);

    expect(response.body.error).toMatchObject({
      code: expect.any(String),
      correlationId: expect.any(String),
      path: '/api/v1/does-not-exist',
    });
  });

  it('rate-limits repeated login attempts by account and client IP', async () => {
    const clientIp = '198.51.100.24';
    const credentials = {
      email: 'rate-limit-target@example.test',
      password: 'definitely-wrong',
    };

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('x-forwarded-for', clientIp)
        .send(credentials)
        .expect(401);
    }

    const blocked = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', clientIp)
      .send(credentials)
      .expect(429);

    expect(blocked.headers['retry-after']).toBeTypeOf('string');
    expect(blocked.body.error).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });
});
