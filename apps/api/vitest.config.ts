import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Unit + architecture tests. No external services: everything runs against fakes.
 * SWC is required because NestJS depends on `emitDecoratorMetadata`, which esbuild
 * (Vitest's default transformer) does not produce.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.spec.ts', 'test/architecture/**/*.spec.ts', 'test/bootstrap/**/*.spec.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'], include: ['src/**'] },
  },
});
