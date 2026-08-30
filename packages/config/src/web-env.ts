import { z } from 'zod';

import { parseEnv } from './env-error';

/**
 * Next.js configuration.
 *
 * `API_BASE_URL` is used by Server Components / route handlers and can point at an
 * internal address (e.g. the ALB's private DNS). `NEXT_PUBLIC_API_BASE_URL` is inlined
 * into the browser bundle, so it must be a publicly reachable URL and MUST NOT contain
 * anything secret.
 */
export const webEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'test', 'qas', 'prd']).default('local'),
  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default('http://localhost:3001'),
  NEXT_PUBLIC_APP_NAME: z.string().default('Casa del Rulimán · PIM'),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function loadWebEnv(source: NodeJS.ProcessEnv = process.env): WebEnv {
  return parseEnv(webEnvSchema, source);
}
