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
import { TOKEN_SERVICE } from '../../src/modules/identity/domain/ports/token-service.port';
import { JwtAuthGuard } from '../../src/modules/identity/presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/modules/identity/presentation/guards/roles.guard';
import { ImportsController } from '../../src/modules/imports/presentation/imports.controller';
import { ERP_PRODUCT_SOURCE } from '../../src/modules/integrations/domain/ports/erp-product-source.port';
import { PRODUCT_VECTOR_INDEX } from '../../src/modules/search/domain/ports/product-vector-index.port';
import { SearchController } from '../../src/modules/search/presentation/search.controller';
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
  JWT_ACCESS_SECRET: 'bootstrap-test-access-secret-32-chars-min',
  JWT_REFRESH_SECRET: 'bootstrap-test-refresh-secret-32-chars-min',
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
    ['SearchController', SearchController],
    ['ImportsController', ImportsController],
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
    ['AUDIT_PORT', AUDIT_PORT],
    ['QUEUE_PORT', QUEUE_PORT],
    ['OBJECT_STORAGE', OBJECT_STORAGE],
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

  it('returns the shared error envelope for an unknown route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);

    expect(response.body.error).toMatchObject({
      code: expect.any(String),
      correlationId: expect.any(String),
      path: '/api/v1/does-not-exist',
    });
  });
});
