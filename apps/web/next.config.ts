import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
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
};

export default config;
