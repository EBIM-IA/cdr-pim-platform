import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Component tests run on Vite's built-in esbuild transform with the automatic JSX runtime.
 * `@vitejs/plugin-react` is deliberately not used: its only extra value is Fast Refresh,
 * which is irrelevant in a test run, and its Vite peer range moves faster than Vitest's.
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    // Mirrors the `@/*` path mapping in tsconfig.json, which Vite does not read.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Next resolves this marker at build time; unit tests only need a side-effect-free module.
      'server-only': fileURLToPath(new URL('./src/test/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
  },
});
