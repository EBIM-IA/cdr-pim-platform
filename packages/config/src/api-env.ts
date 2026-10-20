import { z } from 'zod';

import { aiEnvSchema, resolveAiCapabilityProviders } from './ai';
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
  /**
   * PEM bundle of the certificate authorities trusted for the database connection. With
   * DATABASE_SSL=true the server certificate chain AND hostname are verified (verify-full)
   * against exactly this bundle. The API image ships the AWS RDS global bundle and points
   * this variable at it; QAS/PRD refuse to start without it.
   */
  DATABASE_SSL_CA_FILE: z.string().min(1).optional(),
  /**
   * Number of trusted reverse-proxy hops in front of the API. Keep at zero when connecting
   * directly. QAS/PRD have exactly one: the ALB, or the web BFF that forwards the client
   * address it received from the ALB.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  /** Comma-separated list of allowed browser origins. Never `*` in QAS/PRD. */
  CORS_ORIGINS: z.string().default('http://localhost:3100'),
  SWAGGER_ENABLED: booleanEnv(false),

  /**
   * Local credentials are an intentionally temporary source until CDR chooses its real
   * identity provider. When AUTH_MODE=local they are required environment values: no
   * credential is embedded in source code or silently invented by a default.
   *
   * local/test: allowed. qas: allowed only with ALLOW_LOCAL_AUTH_IN_QAS=true, a temporary
   * and explicit opt-in until the corporate IdP exists. prd: never, whatever the flag says.
   */
  AUTH_MODE: z.enum(['local']).default('local'),
  ALLOW_LOCAL_AUTH_IN_QAS: booleanEnv(false),
  AUTH_LOCAL_USER_ID: z.string().min(1).max(120).optional(),
  AUTH_LOCAL_EMAIL: z.string().email().max(254).optional(),
  AUTH_LOCAL_PASSWORD: z.string().min(12).max(1_024).optional(),
  AUTH_LOCAL_ROLES: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((role) => role.trim())
        .filter(Boolean),
    )
    .pipe(
      z.array(z.enum(['ADMINISTRADOR', 'COMPRAS', 'VENTAS', 'ADMIN', 'EDITOR', 'VIEWER'])).min(1),
    )
    .optional(),

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
    if (
      Object.values(resolveAiCapabilityProviders(env)).includes('openai') &&
      !env.OPENAI_API_KEY
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENAI_API_KEY'],
        message: 'is required when any AI capability provider is openai',
      });
    }
    if (env.OPENAI_TIMEOUT_MS * (env.OPENAI_MAX_RETRIES + 1) > 35_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENAI_TIMEOUT_MS'],
        message: 'times total attempts must not exceed the 35000ms provider budget',
      });
    }
    // One variable per check, in this exact shape: cdr-pim-infrastructure derives its
    // conditional requirements from it (scripts/check-platform-contract.py).
    if (env.AUTH_MODE === 'local' && !env.AUTH_LOCAL_USER_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_LOCAL_USER_ID'],
        message: 'is required when AUTH_MODE=local',
      });
    }
    if (env.AUTH_MODE === 'local' && !env.AUTH_LOCAL_EMAIL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_LOCAL_EMAIL'],
        message: 'is required when AUTH_MODE=local',
      });
    }
    if (env.AUTH_MODE === 'local' && !env.AUTH_LOCAL_PASSWORD) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_LOCAL_PASSWORD'],
        message: 'is required when AUTH_MODE=local',
      });
    }
    if (env.AUTH_MODE === 'local' && !env.AUTH_LOCAL_ROLES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_LOCAL_ROLES'],
        message: 'is required when AUTH_MODE=local',
      });
    }
    // Local static credentials are only a development bridge. PRD refuses them outright; QAS
    // accepts them only behind an explicit, temporary opt-in. Anything else fails closed.
    if (env.APP_ENV === 'prd' && env.AUTH_MODE === 'local') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_MODE'],
        message: '"local" is never allowed in prd',
      });
    }
    if (!env.ALLOW_LOCAL_AUTH_IN_QAS && env.APP_ENV === 'qas' && env.AUTH_MODE === 'local') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_MODE'],
        message: '"local" requires ALLOW_LOCAL_AUTH_IN_QAS=true in qas',
      });
    }
    if (env.APP_ENV === 'prd' && env.ALLOW_LOCAL_AUTH_IN_QAS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ALLOW_LOCAL_AUTH_IN_QAS'],
        message: 'must not be set in prd',
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
      // The public trust store does not contain the RDS CAs: without an explicit bundle a
      // verify-full connection cannot succeed, and nothing may fall back to "require".
      if (!env.DATABASE_SSL_CA_FILE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_SSL_CA_FILE'],
          message: 'must point at the database CA bundle in qas/prd',
        });
      }
      // Exactly one hop. Zero would rate-limit every user as the proxy's address; more than
      // one would let a client choose its own address by prepending X-Forwarded-For entries.
      if (env.TRUST_PROXY_HOPS !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['TRUST_PROXY_HOPS'],
          message: 'must be exactly 1 (the load balancer or web BFF hop) in qas/prd',
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
