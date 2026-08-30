# syntax=docker/dockerfile:1.7
# =============================================================================
# apps/web — Next.js
# =============================================================================
#   docker build -f docker/web.Dockerfile -t cdr-pim-web .   (context: repo root)
#
# The image is ENVIRONMENT-AGNOSTIC, so it follows the same build-once-promote rule as the
# api and worker images (audit finding H-3).
#
# That holds because every API call is made server-side, by `createServerApiClient()`, which
# reads `API_BASE_URL` from the environment at RUNTIME. No `NEXT_PUBLIC_*` value carrying an
# environment-specific URL is baked into the bundle.
#
# If a browser-side component ever needs to call the API directly, do NOT reintroduce a
# `NEXT_PUBLIC_API_BASE_URL` build arg: that would bake QAS into the artefact and make it
# unpromotable. Proxy through a Next route handler, or serve the value at runtime.
# See docs/architecture/DEPLOYMENT_STRATEGY.md.
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
    pnpm install --frozen-lockfile --filter @cdr/web... --filter .

FROM deps AS build
# The only inlined public value is the application name, identical in every environment.
ARG NEXT_PUBLIC_APP_NAME="Casa del Rulimán · PIM"
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
# `...` builds the app together with its workspace dependencies, in topological
# order — and only those, which is exactly the set the filtered install provided.
RUN pnpm --filter @cdr/web... run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
USER node
WORKDIR /app

# `output: 'standalone'` produces a minimal server plus only the node_modules it traced.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
