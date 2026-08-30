# syntax=docker/dockerfile:1.7
# =============================================================================
# apps/api — NestJS
# =============================================================================
# Build context is the MONOREPO ROOT, because the app depends on workspace packages:
#   docker build -f docker/api.Dockerfile -t cdr-pim-api .
#
# `pnpm deploy` in the final stage produces a self-contained node_modules with the
# workspace packages copied in rather than symlinked, which is what makes the runtime
# image work without the rest of the repository.
# =============================================================================

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# ---- dependencies ----------------------------------------------------------
FROM base AS deps
# Only the manifests, so this layer is cached until a dependency actually changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json          packages/config/
COPY packages/contracts/package.json       packages/contracts/
COPY packages/eslint-config/package.json   packages/eslint-config/
COPY packages/messaging/package.json       packages/messaging/
COPY packages/shared/package.json          packages/shared/
COPY packages/storage/package.json         packages/storage/
COPY packages/tsconfig/package.json        packages/tsconfig/
COPY apps/api/package.json                 apps/api/
COPY apps/web/package.json                 apps/web/
COPY apps/worker/package.json              apps/worker/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @cdr/api... --filter .

# ---- build -----------------------------------------------------------------
FROM deps AS build
COPY . .
# `...` builds the app together with its workspace dependencies, in topological
# order — and only those, which is exactly the set the filtered install provided.
RUN pnpm --filter @cdr/api... run build
# Collapse the workspace into a portable, production-only tree.
RUN pnpm deploy --filter @cdr/api --prod --legacy /output

# ---- runtime ---------------------------------------------------------------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
# Alpine ships `node` as uid 1000; run unprivileged.
USER node
WORKDIR /app

COPY --from=build --chown=node:node /output/node_modules ./node_modules
COPY --from=build --chown=node:node /output/dist ./dist
# Migrations are shipped inside the image so the migration task runs the exact SQL that
# matches this build. `migrator.ts` resolves them relative to the working directory.
COPY --from=build --chown=node:node /repo/apps/api/drizzle ./drizzle

EXPOSE 3001
# Node's own fetch — no curl/wget in the image, and nothing extra to keep patched.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
