import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { ApiEnv } from '@cdr/config';

import { DatabaseModule } from './database/database.module';
import { AiModule } from './modules/ai/ai.module';
import { AuditModule } from './modules/audit/audit.module';
import { AxIntegrationModule } from './modules/ax-integration/ax-integration.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { EquivalencesModule } from './modules/equivalences/equivalences.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { JwtAuthGuard } from './modules/identity/presentation/guards/jwt-auth.guard';
import { RolesGuard } from './modules/identity/presentation/guards/roles.guard';
import { ImportsModule } from './modules/imports/imports.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { SearchModule } from './modules/search/search.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { ConfigModule } from './shared/config/config.module';
import { AllExceptionsFilter } from './shared/http/all-exceptions.filter';
import { ApiThrottlerGuard } from './shared/http/api-throttler.guard';
import { CorrelationIdMiddleware } from './shared/http/correlation-id.middleware';
import {
  actorOrIpTracker,
  globalRateLimitKey,
  hasRateLimitProfile,
  loginAccountTracker,
} from './shared/http/rate-limit';
import { LoggerModule } from './shared/logging/logger.module';
import { PlatformModule } from './shared/platform.module';
import { API_ENV } from './shared/tokens';

/**
 * Composition root of the modular monolith.
 *
 * Every entry in `imports` is a bounded context. They are assembled in one process today
 * and could be extracted into separate deployables later without rewriting them, because
 * none of them reaches into another's internals — the only shared surface is the small set
 * of ports each module explicitly exports (ADR-001).
 *
 * Two bounded contexts appear in the documentation but not here: `categories` and
 * `attributes`. They currently hold domain types only, with no persistence and no
 * endpoints, so registering an empty Nest module would be noise. See
 * `docs/architecture/MODULE_ARCHITECTURE.md` for the status of each context.
 *
 * Authentication is fail-closed: both guards are global and the small set of public routes
 * must opt out explicitly with `@Public()`. The AX integration route is public only to the
 * HUMAN guards; it carries its own machine guard (`AxIntegrationRoute`). QAS/PRD reject the temporary local credential
 * adapter at configuration time until the customer's identity provider is implemented.
 */
@Module({
  imports: [
    // Cross-cutting infrastructure
    ConfigModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => ({
        throttlers: [
          {
            name: 'global',
            ttl: env.RATE_LIMIT_WINDOW_MS,
            limit: env.RATE_LIMIT_GLOBAL,
            getTracker: actorOrIpTracker,
            generateKey: globalRateLimitKey,
          },
          {
            name: 'default',
            ttl: env.RATE_LIMIT_WINDOW_MS,
            limit: env.RATE_LIMIT_DEFAULT,
            getTracker: actorOrIpTracker,
          },
          {
            name: 'login-account',
            ttl: env.RATE_LIMIT_LOGIN_WINDOW_MS,
            limit: env.RATE_LIMIT_LOGIN,
            blockDuration: env.RATE_LIMIT_LOGIN_BLOCK_MS,
            getTracker: loginAccountTracker,
            skipIf: (context) => !hasRateLimitProfile(context, 'login'),
          },
          {
            name: 'login-ip',
            ttl: env.RATE_LIMIT_LOGIN_WINDOW_MS,
            limit: env.RATE_LIMIT_LOGIN,
            blockDuration: env.RATE_LIMIT_LOGIN_BLOCK_MS,
            skipIf: (context) => !hasRateLimitProfile(context, 'login'),
          },
          {
            name: 'ai',
            ttl: env.RATE_LIMIT_WINDOW_MS,
            limit: env.RATE_LIMIT_AI,
            getTracker: actorOrIpTracker,
            skipIf: (context) => !hasRateLimitProfile(context, 'ai'),
          },
          {
            name: 'index',
            ttl: env.RATE_LIMIT_WINDOW_MS,
            limit: env.RATE_LIMIT_INDEX,
            getTracker: actorOrIpTracker,
            skipIf: (context) => !hasRateLimitProfile(context, 'index'),
          },
          {
            // System integrations (AX). Its own bucket, keyed by client IP — never shared
            // with the human login buckets. TEMPORARY QAS OPERATIONAL LIMIT, not P-10.
            name: 'integration',
            ttl: env.RATE_LIMIT_WINDOW_MS,
            limit: env.RATE_LIMIT_INTEGRATION,
            getTracker: actorOrIpTracker,
            skipIf: (context) => !hasRateLimitProfile(context, 'integration'),
          },
        ],
      }),
    }),
    LoggerModule,
    DatabaseModule,
    PlatformModule,
    AuditModule,
    // Bounded contexts
    HealthModule,
    IdentityModule,
    CatalogModule,
    EquivalencesModule,
    AiModule,
    SearchModule,
    ImportsModule,
    IntegrationsModule,
    AxIntegrationModule,
    WorkspacesModule,
  ],
  providers: [
    // The single translator from internal failures to HTTP responses, registered globally
    // so no controller can accidentally leak a stack trace.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: establish the actor before checking its role.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ApiThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Applied to every route, including health, so even a failed probe is traceable.
    // Express 5 (NestJS 11) requires named wildcards; '{*splat}' also matches the root path.
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*splat}');
  }
}
