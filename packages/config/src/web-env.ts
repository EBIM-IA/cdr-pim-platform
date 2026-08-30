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
export const webEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'test', 'qas', 'prd']).default('local'),
  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  NEXT_PUBLIC_APP_NAME: z.string().default('Casa del Rulimán · PIM'),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function loadWebEnv(source: NodeJS.ProcessEnv = process.env): WebEnv {
  return parseEnv(webEnvSchema, source);
}
