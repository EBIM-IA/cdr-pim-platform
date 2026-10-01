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

  /** Comma-separated list of allowed browser origins. Never `*` in QAS/PRD. */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  SWAGGER_ENABLED: booleanEnv(true),

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
  QUEUE_DRIVER: queueDriverSchema.default('memory'),
  SQS_JOBS_QUEUE_URL: z.string().optional(),

  STORAGE_DRIVER: storageDriverSchema.default('memory'),
  S3_BUCKET_ASSETS: z.string().optional(),
  S3_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
});

export const apiEnvSchema = baseEnvSchema
  .merge(awsEnvSchema)
  .merge(aiEnvSchema)
  .merge(apiOnlySchema)
  .superRefine((env, ctx) => {
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
      // Local static credentials are only a development bridge. Until an enterprise
      // identity source is implemented, QAS/PRD refuse to start instead of falling back.
      if (env.AUTH_MODE === 'local') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_MODE'],
          message: '"local" is allowed only when APP_ENV is local/test',
        });
      }
      if (env.QUEUE_DRIVER !== 'sqs') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['QUEUE_DRIVER'],
          message: 'must be "sqs" in qas/prd — the in-memory queue loses messages on restart',
        });
      }
      if (env.CORS_ORIGINS.trim() === '*') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message: 'wildcard CORS is not allowed in qas/prd',
        });
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
