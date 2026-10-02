import { describe, expect, it } from 'vitest';

import { loadApiEnv } from './api-env';
import { EnvironmentValidationError } from './env-error';

const minimal = {
  DATABASE_URL: 'postgres://cdr:cdr@localhost:5432/cdr_pim',
  AUTH_MODE: 'local',
  AUTH_LOCAL_USER_ID: 'local-admin',
  AUTH_LOCAL_EMAIL: 'admin@casadelruliman.com',
  AUTH_LOCAL_PASSWORD: 'a-safe-local-password',
  AUTH_LOCAL_ROLES: 'ADMIN',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
} as NodeJS.ProcessEnv;

/** A QAS configuration that satisfies every hosted guard-rail except the auth opt-in. */
const hostedQas = {
  ...minimal,
  NODE_ENV: 'production',
  APP_ENV: 'qas',
  JWT_ACCESS_SECRET: 'q'.repeat(48),
  DATABASE_SSL: 'true',
  DATABASE_SSL_CA_FILE: '/app/certs/rds-global-bundle.pem',
  TRUST_PROXY_HOPS: '1',
  QUEUE_DRIVER: 'sqs',
  SQS_JOBS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/1/cdr-pim-qas-jobs',
  STORAGE_DRIVER: 's3',
  S3_BUCKET_ASSETS: 'cdr-pim-qas-assets',
  CORS_ORIGINS: 'https://pim-qas.example.test',
} as NodeJS.ProcessEnv;

describe('loadApiEnv', () => {
  it('applies safe local defaults', () => {
    const env = loadApiEnv(minimal);
    expect(env.APP_ENV).toBe('local');
    expect(env.QUEUE_DRIVER).toBe('memory');
    expect(env.AI_PROVIDER).toBe('fake');
    expect(env.AI_EMBEDDING_DIMENSIONS).toBe(1536);
    expect(env.AUTH_LOCAL_ROLES).toEqual(['ADMIN']);
    expect(env.SWAGGER_ENABLED).toBe(false);
  });

  it('rejects a short JWT secret', () => {
    expect(() => loadApiEnv({ ...minimal, JWT_ACCESS_SECRET: 'short' })).toThrow(
      EnvironmentValidationError,
    );
  });

  it('caps access tokens at one hour', () => {
    expect(() => loadApiEnv({ ...minimal, JWT_ACCESS_TTL: '61m' })).toThrow(
      /JWT_ACCESS_TTL.*one hour/s,
    );
  });

  it('refuses production mode with local defaults', () => {
    expect(() => loadApiEnv({ ...minimal, NODE_ENV: 'production' })).toThrow(
      /APP_ENV.*qas or prd/s,
    );
  });

  it('refuses the in-memory queue outside local development', () => {
    expect(() => loadApiEnv({ ...minimal, APP_ENV: 'prd', QUEUE_DRIVER: 'memory' })).toThrow(
      /must be "sqs" in qas\/prd/,
    );
  });

  it('requires all local credentials from the environment', () => {
    const { AUTH_LOCAL_PASSWORD: _omitted, ...withoutPassword } = minimal;
    expect(() => loadApiEnv(withoutPassword)).toThrow(
      /AUTH_LOCAL_PASSWORD.*required when AUTH_MODE=local/s,
    );
    expect(() => loadApiEnv({ ...minimal, AUTH_LOCAL_ROLES: 'SUPERUSER' })).toThrow(
      /AUTH_LOCAL_ROLES/,
    );
  });

  describe('local authentication by environment', () => {
    it.each(['local', 'test'])('allows local authentication in %s', (APP_ENV) => {
      expect(loadApiEnv({ ...minimal, APP_ENV }).AUTH_MODE).toBe('local');
    });

    it('allows local authentication in qas only with the explicit opt-in', () => {
      const env = loadApiEnv({ ...hostedQas, ALLOW_LOCAL_AUTH_IN_QAS: 'true' });
      expect(env.AUTH_MODE).toBe('local');
      expect(env.ALLOW_LOCAL_AUTH_IN_QAS).toBe(true);
    });

    it.each([undefined, 'false', '0'])(
      'fails closed in qas when ALLOW_LOCAL_AUTH_IN_QAS=%s',
      (ALLOW_LOCAL_AUTH_IN_QAS) => {
        expect(() => loadApiEnv({ ...hostedQas, ALLOW_LOCAL_AUTH_IN_QAS })).toThrow(
          /AUTH_MODE.*"local" requires ALLOW_LOCAL_AUTH_IN_QAS=true in qas/s,
        );
      },
    );

    it('always refuses local authentication in prd, even with the qas opt-in', () => {
      expect(() => loadApiEnv({ ...hostedQas, APP_ENV: 'prd' })).toThrow(
        /AUTH_MODE.*never allowed in prd/s,
      );
      expect(() =>
        loadApiEnv({ ...hostedQas, APP_ENV: 'prd', ALLOW_LOCAL_AUTH_IN_QAS: 'true' }),
      ).toThrow(/AUTH_MODE.*never allowed in prd.*ALLOW_LOCAL_AUTH_IN_QAS.*must not be set/s);
    });

    it('rejects an unknown authentication mode instead of falling back', () => {
      expect(() => loadApiEnv({ ...minimal, AUTH_MODE: 'none' })).toThrow(/AUTH_MODE/);
    });
  });

  it('requires the database CA bundle in hosted environments', () => {
    const { DATABASE_SSL_CA_FILE: _omitted, ...withoutCa } = hostedQas;
    expect(() => loadApiEnv({ ...withoutCa, ALLOW_LOCAL_AUTH_IN_QAS: 'true' })).toThrow(
      /DATABASE_SSL_CA_FILE.*database CA bundle/s,
    );
  });

  it.each(['0', '2'])('requires exactly one trusted proxy hop in qas (got %s)', (hops) => {
    expect(() =>
      loadApiEnv({ ...hostedQas, ALLOW_LOCAL_AUTH_IN_QAS: 'true', TRUST_PROXY_HOPS: hops }),
    ).toThrow(/TRUST_PROXY_HOPS.*exactly 1/s);
  });

  it('refuses Swagger in hosted environments', () => {
    expect(() =>
      loadApiEnv({ ...hostedQas, ALLOW_LOCAL_AUTH_IN_QAS: 'true', SWAGGER_ENABLED: 'true' }),
    ).toThrow(/SWAGGER_ENABLED.*must be false/s);
  });

  it('refuses the documented local JWT placeholder in hosted environments', () => {
    expect(() =>
      loadApiEnv({
        ...minimal,
        NODE_ENV: 'production',
        APP_ENV: 'prd',
        JWT_ACCESS_SECRET: 'local-development-only-access-secret-change-me',
      }),
    ).toThrow(/JWT_ACCESS_SECRET.*local-development placeholder/s);
  });

  it('refuses wildcard CORS in prd', () => {
    expect(() =>
      loadApiEnv({
        ...minimal,
        APP_ENV: 'prd',
        QUEUE_DRIVER: 'sqs',
        SQS_JOBS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/1/cdr-pim-prd-jobs',
        CORS_ORIGINS: '*',
      }),
    ).toThrow(/wildcard CORS/);
  });

  it('reports every hosted-environment security guardrail that is not satisfied', () => {
    expect(() =>
      loadApiEnv({
        ...minimal,
        NODE_ENV: 'production',
        APP_ENV: 'prd',
        QUEUE_DRIVER: 'sqs',
        SQS_JOBS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/1/cdr-pim-prd-jobs',
        STORAGE_DRIVER: 'memory',
        DATABASE_SSL: 'false',
        TRUST_PROXY_HOPS: '0',
        SWAGGER_ENABLED: 'true',
        AWS_ENDPOINT_URL: 'http://localhost:4566',
        OPENAI_BASE_URL: 'https://proxy.example.test',
        CORS_ORIGINS: 'http://pim.example.test',
      }),
    ).toThrow(
      /DATABASE_SSL.*DATABASE_SSL_CA_FILE.*TRUST_PROXY_HOPS.*AWS_ENDPOINT_URL.*OPENAI_BASE_URL.*STORAGE_DRIVER.*SWAGGER_ENABLED.*CORS_ORIGINS/s,
    );
  });

  it('requires an OpenAI key only when OpenAI is actually selected', () => {
    expect(() => loadApiEnv({ ...minimal, AI_PROVIDER: 'openai' })).toThrow(/OPENAI_API_KEY/);
    expect(
      loadApiEnv({ ...minimal, AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' }).AI_PROVIDER,
    ).toBe('openai');
  });

  it('never includes a secret value in the error message', () => {
    try {
      loadApiEnv({ ...minimal, JWT_ACCESS_SECRET: 'leak-me' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).not.toContain('leak-me');
    }
  });
});

describe('boolean environment variables', () => {
  it('treats the string "false" as false, not as a truthy string', () => {
    // Regression guard: z.coerce.boolean() gets this wrong and would enable TLS against a
    // plaintext database.
    expect(loadApiEnv({ ...minimal, DATABASE_SSL: 'false' }).DATABASE_SSL).toBe(false);
    expect(loadApiEnv({ ...minimal, DATABASE_SSL: '0' }).DATABASE_SSL).toBe(false);
    expect(loadApiEnv({ ...minimal, DATABASE_SSL: 'true' }).DATABASE_SSL).toBe(true);
    expect(loadApiEnv({ ...minimal, SWAGGER_ENABLED: 'false' }).SWAGGER_ENABLED).toBe(false);
  });

  it('rejects an ambiguous value instead of guessing', () => {
    expect(() => loadApiEnv({ ...minimal, DATABASE_SSL: 'maybe' })).toThrow(
      EnvironmentValidationError,
    );
  });
});
