import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Integration tests. These require a real PostgreSQL with pgvector:
 *
 *   docker compose up -d postgres
 *   TEST_DATABASE_URL=postgres://cdr:cdr@localhost:5432/cdr_pim_test pnpm test:integration
 *
 * They are a separate Turbo task (never cached) so the default `pnpm test` stays
 * hermetic and fast.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    // Migrations and truncation are shared state; run suites one at a time.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
