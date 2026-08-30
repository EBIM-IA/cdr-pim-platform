import { loadWebEnv } from '@cdr/config';

/**
 * Server-side configuration, validated once per process.
 *
 * Next.js inlines `NEXT_PUBLIC_*` at build time, so those values are baked into the client
 * bundle: they must never carry a secret. Everything else here is read only on the server.
 */
export const env = loadWebEnv();
