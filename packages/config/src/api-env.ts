import { z } from 'zod';

import { aiEnvSchema } from './ai';
import {
  awsEnvSchema,
  baseEnvSchema,
  booleanEnv,
  queueDriverSchema,
  storageDriverSchema,
} from './common';
import { parseEnv } from './env-error';

const apiOnlySchema = z.object({
  SERVICE_NAME: z.string().default('cdr-pim-api'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),

  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_SSL: booleanEnv(false),
  /** Number of trusted reverse-proxy hops. Keep at zero when connecting directly. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  /** Comma-separated list of allowed browser origins. Never `*` in QAS/PRD. */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  SWAGGER_ENABLED: booleanEnv(false),

  /**
   * Local credentials are an intentionally temporary source until CDR chooses its real
   * identity provider. They are required environment values: no credential is embedded in
   * source code or silently invented by a default.
   */
  AUTH_MODE: z.literal('local').default('local'),
  AUTH_LOCAL_USER_ID: z.string().min(1).max(120),
  AUTH_LOCAL_EMAIL: z.string().email().max(254),
  AUTH_LOCAL_PASSWORD: z.string().min(12).max(1_024),
  AUTH_LOCAL_ROLES: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((role) => role.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(['ADMIN', 'EDITOR', 'VIEWER'])).min(1)),

  JWT_ACCESS_SECRET: z.string().min(32),
  // `<number><unit>` (ms format). Constrained here so the JWT adapter can rely on the
  // shape instead of hoping the operator typed something the signing library accepts.
  JWT_ACCESS_TTL: z
    .string()
    .regex(/^\d+(ms|s|m|h|d|w|y)$/, 'must be a duration such as "15m" or "7d"')
    .default('15m'),
  JWT_ISSUER: z.string().min(1).max(200).default('cdr-pim-api'),
  JWT_AUDIENCE: z.string().min(1).max(200).default('cdr-pim-web'),
  JWT_ALGORITHM: z.literal('HS256').default('HS256'),

  /** Application-layer limits complement, but do not replace, an edge WAF/rate limiter. */
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  RATE_LIMIT_GLOBAL: z.coerce.number().int().min(1).max(100_000).default(120),
  RATE_LIMIT_DEFAULT: z.coerce.number().int().min(1).max(100_000).default(60),
  RATE_LIMIT_LOGIN: z.coerce.number().int().min(1).max(1_000).default(5),
  RATE_LIMIT_LOGIN_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(300_000),
  RATE_LIMIT_LOGIN_BLOCK_MS: z.coerce.number().int().min(1_000).max(86_400_000).default(300_000),
  RATE_LIMIT_AI: z.coerce.number().int().min(1).max(10_000).default(10),
  RATE_LIMIT_INDEX: z.coerce.number().int().min(1).max(10_000).default(5),
  QUEUE_DRIVER: queueDriverSchema.default('memory'),
  SQS_JOBS_QUEUE_URL: z.string().optional(),

  STORAGE_DRIVER: storageDriverSchema.default('memory'),
  S3_BUCKET_ASSETS: z.string().optional(),
  S3_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().max(3_600).default(900),
});

const durationUnitMs = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  y: 31_536_000_000,
} as const;

const LOCAL_JWT_PLACEHOLDER = 'local-development-only-access-secret-change-me';

function durationMilliseconds(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d|w|y)$/.exec(value);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1]) * durationUnitMs[match[2] as keyof typeof durationUnitMs];
}

export const apiEnvSchema = baseEnvSchema
  .merge(awsEnvSchema)
  .merge(aiEnvSchema)
  .merge(apiOnlySchema)
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.APP_ENV !== 'qas' && env.APP_ENV !== 'prd') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_ENV'],
        message: 'must be qas or prd when NODE_ENV=production',
      });
    }
    if (durationMilliseconds(env.JWT_ACCESS_TTL) > 3_600_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACCESS_TTL'],
        message: 'must not exceed one hour',
      });
    }
    if (env.QUEUE_DRIVER === 'sqs' && !env.SQS_JOBS_QUEUE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SQS_JOBS_QUEUE_URL'],
        message: 'is required when QUEUE_DRIVER=sqs',
      });
    }
    if (env.STORAGE_DRIVER === 's3' && !env.S3_BUCKET_ASSETS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['S3_BUCKET_ASSETS'],
        message: 'is required when STORAGE_DRIVER=s3',
      });
    }
    if (env.AI_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENAI_API_KEY'],
        message: 'is required when AI_PROVIDER=openai',
      });
    }
    // Guard-rails that only apply once we are outside a developer laptop.
    if (env.APP_ENV === 'qas' || env.APP_ENV === 'prd') {
      if (env.NODE_ENV !== 'production') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['NODE_ENV'],
          message: 'must be production in qas/prd',
        });
      }
      // Local static credentials are only a development bridge. Until an enterprise
      // identity source is implemented, QAS/PRD refuse to start instead of falling back.
      if (env.AUTH_MODE === 'local') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_MODE'],
          message: '"local" is allowed only when APP_ENV is local/test',
        });
      }
      if (env.JWT_ACCESS_SECRET === LOCAL_JWT_PLACEHOLDER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message: 'must not use the local-development placeholder in qas/prd',
        });
      }
      if (env.QUEUE_DRIVER !== 'sqs') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['QUEUE_DRIVER'],
          message: 'must be "sqs" in qas/prd — the in-memory queue loses messages on restart',
        });
      }
      if (!env.DATABASE_SSL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_SSL'],
          message: 'must be true in qas/prd',
        });
      }
      if (env.TRUST_PROXY_HOPS < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['TRUST_PROXY_HOPS'],
          message: 'must explicitly trust the load balancer hop in qas/prd',
        });
      }
      if (env.AWS_ENDPOINT_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AWS_ENDPOINT_URL'],
          message: 'must be unset in qas/prd',
        });
      }
      if (env.OPENAI_BASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['OPENAI_BASE_URL'],
          message: 'must be unset in qas/prd',
        });
      }
      if (env.STORAGE_DRIVER !== 's3') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_DRIVER'],
          message: 'must be "s3" in qas/prd',
        });
      }
      if (env.SWAGGER_ENABLED) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SWAGGER_ENABLED'],
          message: 'must be false in qas/prd',
        });
      }
      if (env.CORS_ORIGINS.trim() === '*') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message: 'wildcard CORS is not allowed in qas/prd',
        });
      }
      for (const origin of parseCorsOrigins(env.CORS_ORIGINS)) {
        if (!origin.startsWith('https://')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['CORS_ORIGINS'],
            message: 'every origin must use https in qas/prd',
          });
          break;
        }
      }
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  return parseEnv(apiEnvSchema, source);
}

export function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
