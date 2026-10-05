import { z } from 'zod';

import { aiEnvSchema } from './ai';
import { awsEnvSchema, baseEnvSchema, queueDriverSchema, storageDriverSchema } from './common';
import { parseEnv } from './env-error';

const workerOnlySchema = z.object({
  SERVICE_NAME: z.string().default('cdr-pim-worker'),
  /** The worker exposes health over HTTP so ECS can run the same probe shape as the API. */
  PORT: z.coerce.number().int().min(1).max(65_535).default(3002),

  DATABASE_URL: z.string().url().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(5),

  QUEUE_DRIVER: queueDriverSchema.default('memory'),
  SQS_JOBS_QUEUE_URL: z.string().optional(),

  /** SQS long polling. 20s is the maximum and the cheapest option. */
  QUEUE_WAIT_TIME_SECONDS: z.coerce.number().int().min(0).max(20).default(20),
  QUEUE_MAX_MESSAGES: z.coerce.number().int().min(1).max(10).default(10),
  /** Must exceed the slowest handler, otherwise SQS redelivers work still in flight. */
  QUEUE_VISIBILITY_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(120),
  /**
   * In-process retries before the message is released back to SQS. The authoritative
   * retry/DLQ policy lives in the queue's redrive policy (Terraform), not here.
   */
  QUEUE_MAX_HANDLER_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  QUEUE_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(200),
  /** Grace period for in-flight handlers on SIGTERM, below the ECS stop timeout. */
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),

  STORAGE_DRIVER: storageDriverSchema.default('memory'),
  S3_BUCKET_ASSETS: z.string().optional(),
  S3_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().max(3_600).default(900),
});

export const workerEnvSchema = baseEnvSchema
  .merge(awsEnvSchema)
  .merge(aiEnvSchema)
  .merge(workerOnlySchema)
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.APP_ENV !== 'qas' && env.APP_ENV !== 'prd') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_ENV'],
        message: 'must be qas or prd when NODE_ENV=production',
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
    if (env.APP_ENV === 'qas' || env.APP_ENV === 'prd') {
      if (env.NODE_ENV !== 'production') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['NODE_ENV'],
          message: 'must be production in qas/prd',
        });
      }
      if (env.QUEUE_DRIVER !== 'sqs') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['QUEUE_DRIVER'],
          message: 'must be "sqs" in qas/prd',
        });
      }
      if (env.STORAGE_DRIVER !== 's3') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_DRIVER'],
          message: 'must be "s3" in qas/prd',
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
    }
  });

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  return parseEnv(workerEnvSchema, source);
}
