import { z } from 'zod';

import { parseEnv } from './env-error';

/**
 * Next.js configuration.
 *
 * `API_BASE_URL` is read at RUNTIME by Server Components and route handlers, and may point
 * at an internal address (e.g. the ALB's private DNS).
 *
 * There is deliberately no `NEXT_PUBLIC_API_BASE_URL`: `NEXT_PUBLIC_*` values are inlined
 * into the client bundle at BUILD time, so one would bake a single environment into the
 * image and make it unpromotable (audit finding H-3). Browser-side API access must go
 * through a Next route handler instead. Whatever is added here is public by construction
 * and must never carry a secret.
 */
export const webEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['local', 'test', 'qas', 'prd']).default('local'),
    API_BASE_URL: z.string().url().default('http://localhost:3001'),
    NEXT_PUBLIC_APP_NAME: z.string().default('Casa del Rulimán · PIM'),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV !== 'qas' && env.APP_ENV !== 'prd') return;

    if (env.NODE_ENV !== 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['NODE_ENV'],
        message: 'must be production in qas/prd',
      });
    }
    const api = new URL(env.API_BASE_URL);
    if (api.hostname === 'localhost' || api.hostname === '127.0.0.1') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['API_BASE_URL'],
        message: 'must not target localhost in qas/prd',
      });
    }
    if (api.username || api.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['API_BASE_URL'],
        message: 'must not contain embedded credentials',
      });
    }
  });

export type WebEnv = z.infer<typeof webEnvSchema>;

export function loadWebEnv(source: NodeJS.ProcessEnv = process.env): WebEnv {
  return parseEnv(webEnvSchema, source);
}
