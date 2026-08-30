import { z } from 'zod';

/**
 * Deployment environment. Distinct from `NODE_ENV` on purpose: NestJS/Next only care
 * about `production` vs `development`, whereas QAS and PRD are two *production-mode*
 * builds of the same image differing only by configuration.
 */
export const appEnvironmentSchema = z.enum(['local', 'test', 'qas', 'prd']);
export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;

export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

/**
 * Boolean environment variable.
 *
 * `z.coerce.boolean()` is NOT usable here: it applies JavaScript's `Boolean()`, so the
 * string "false" — the single most common way to disable a flag — evaluates to `true`.
 * That silently turned on TLS against a plaintext local database until an integration run
 * caught it. This parser accepts only explicit, unambiguous spellings and rejects anything
 * else at boot instead of guessing.
 */
export function booleanEnv(defaultValue: boolean) {
  return z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'])])
    .default(defaultValue)
    .transform((value) =>
      typeof value === 'boolean' ? value : ['true', '1', 'yes', 'on'].includes(value),
    );
}

export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: appEnvironmentSchema.default('local'),
  LOG_LEVEL: logLevelSchema.default('info'),
  /** Populated by CI with the git SHA; surfaced on /health/live for traceability. */
  APP_VERSION: z.string().default('0.0.0-local'),
});

/** Where async messages actually go. `memory` is for unit tests only. */
export const queueDriverSchema = z.enum(['sqs', 'memory']);
export const storageDriverSchema = z.enum(['s3', 'memory']);

export const awsEnvSchema = z.object({
  AWS_REGION: z.string().default('us-east-1'),
  /**
   * Override for LocalStack during local development. MUST be empty in QAS/PRD so the
   * SDK resolves the real AWS endpoints.
   */
  AWS_ENDPOINT_URL: z.string().url().optional(),
});
