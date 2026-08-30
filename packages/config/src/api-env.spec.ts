import { describe, expect, it } from 'vitest';

import { loadApiEnv } from './api-env';
import { EnvironmentValidationError } from './env-error';

const minimal = {
  DATABASE_URL: 'postgres://cdr:cdr@localhost:5432/cdr_pim',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
} as NodeJS.ProcessEnv;

describe('loadApiEnv', () => {
  it('applies safe local defaults', () => {
    const env = loadApiEnv(minimal);
    expect(env.APP_ENV).toBe('local');
    expect(env.QUEUE_DRIVER).toBe('memory');
    expect(env.AI_PROVIDER).toBe('fake');
    expect(env.AI_EMBEDDING_DIMENSIONS).toBe(1536);
  });

  it('rejects a short JWT secret', () => {
    expect(() => loadApiEnv({ ...minimal, JWT_ACCESS_SECRET: 'short' })).toThrow(
      EnvironmentValidationError,
    );
  });

  it('refuses the in-memory queue outside local development', () => {
    expect(() => loadApiEnv({ ...minimal, APP_ENV: 'prd', QUEUE_DRIVER: 'memory' })).toThrow(
      /must be "sqs" in qas\/prd/,
    );
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
