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
    expect(() => loadApiEnv(withoutPassword)).toThrow(/AUTH_LOCAL_PASSWORD/);
    expect(() => loadApiEnv({ ...minimal, AUTH_LOCAL_ROLES: 'SUPERUSER' })).toThrow(
      /AUTH_LOCAL_ROLES/,
    );
  });

  it('refuses local authentication in qas and prd', () => {
    for (const APP_ENV of ['qas', 'prd']) {
      expect(() =>
        loadApiEnv({
          ...minimal,
          APP_ENV,
          QUEUE_DRIVER: 'sqs',
          SQS_JOBS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/1/cdr-pim-jobs',
        }),
      ).toThrow(/AUTH_MODE.*local.*local\/test/s);
    }
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
      /DATABASE_SSL.*TRUST_PROXY_HOPS.*AWS_ENDPOINT_URL.*OPENAI_BASE_URL.*STORAGE_DRIVER.*SWAGGER_ENABLED.*CORS_ORIGINS/s,
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
