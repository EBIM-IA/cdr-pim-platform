import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const config = (phase: string): NextConfig => ({
  reactStrictMode: true,
  // Dev and production builds must never share output. Running `next build` while the local
  // server is active otherwise replaces manifests that `next dev` still has open.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next-build',
  // `standalone` emits a self-contained server bundle, which is what keeps the Docker
  // image small enough to be worth pulling on every ECS deployment.
  output: 'standalone',
  // The monorepo root, so the standalone trace follows the symlinked workspace packages.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // Workspace packages ship as CommonJS with declarations; Next needs to be told to
  // compile them rather than treat them as pre-built external ESM.
  transpilePackages: ['@cdr/contracts', '@cdr/config'],
  poweredByHeader: false,
  eslint: {
    // Linting is a dedicated pipeline step (`pnpm lint`) using the workspace's flat config.
    // Letting `next build` run its own pass as well would report the same code twice under
    // a different rule set.
    ignoreDuringBuilds: true,
  },
});

export default config;
