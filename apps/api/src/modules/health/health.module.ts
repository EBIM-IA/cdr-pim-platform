import { Module } from '@nestjs/common';

import { CheckReadinessUseCase } from './application/check-readiness.use-case';
import { HEALTH_INDICATORS, type HealthIndicatorPort } from './domain/ports/health-indicator.port';
import { DatabaseHealthIndicator } from './infrastructure/database-health.indicator';
import { HealthController } from './presentation/health.controller';

/**
 * The indicator list is the extension point: register another `HealthIndicatorPort`
 * implementation here and readiness picks it up with no other change.
 */
@Module({
  controllers: [HealthController],
  providers: [
    DatabaseHealthIndicator,
    {
      provide: HEALTH_INDICATORS,
      inject: [DatabaseHealthIndicator],
      useFactory: (database: DatabaseHealthIndicator): HealthIndicatorPort[] => [database],
    },
    CheckReadinessUseCase,
  ],
})
export class HealthModule {}
