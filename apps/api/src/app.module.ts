import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { DatabaseModule } from './database/database.module';
import { AiModule } from './modules/ai/ai.module';
import { AuditModule } from './modules/audit/audit.module';
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
import { CorrelationIdMiddleware } from './shared/http/correlation-id.middleware';
import { LoggerModule } from './shared/logging/logger.module';
import { PlatformModule } from './shared/platform.module';

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
 * must opt out explicitly with `@Public()`. QAS/PRD reject the temporary local credential
 * adapter at configuration time until the customer's identity provider is implemented.
 */
@Module({
  imports: [
    // Cross-cutting infrastructure
    ConfigModule,
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
    WorkspacesModule,
  ],
  providers: [
    // The single translator from internal failures to HTTP responses, registered globally
    // so no controller can accidentally leak a stack trace.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: establish the actor before checking its role.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Applied to every route, including health, so even a failed probe is traceable.
    // Express 5 (NestJS 11) requires named wildcards; '{*splat}' also matches the root path.
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*splat}');
  }
}
