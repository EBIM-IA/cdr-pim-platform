# syntax=docker/dockerfile:1.7
# =============================================================================
# apps/worker — background job consumer
# =============================================================================
#   docker build -f docker/worker.Dockerfile -t cdr-pim-worker .   (context: repo root)
# =============================================================================

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS deps
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
    pnpm install --frozen-lockfile --filter @cdr/worker... --filter .

FROM deps AS build
COPY . .
# `...` builds the app together with its workspace dependencies, in topological
# order — and only those, which is exactly the set the filtered install provided.
RUN pnpm --filter @cdr/worker... run build
RUN pnpm deploy --filter @cdr/worker --prod --legacy /output

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
USER node
WORKDIR /app

COPY --from=build --chown=node:node /output/node_modules ./node_modules
COPY --from=build --chown=node:node /output/dist ./dist

EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3002)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# No init system and no shell wrapper: the process must receive SIGTERM directly so its
# graceful-drain handler runs before ECS escalates to SIGKILL.
CMD ["node", "dist/main.js"]
