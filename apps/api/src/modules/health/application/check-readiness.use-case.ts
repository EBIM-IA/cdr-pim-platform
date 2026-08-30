import { Inject, Injectable } from '@nestjs/common';

import {
  HEALTH_INDICATORS,
  type HealthCheckResult,
  type HealthIndicatorPort,
} from '../domain/ports/health-indicator.port';

export interface ReadinessReport {
  readonly status: 'up' | 'down';
  readonly checks: HealthCheckResult[];
}

@Injectable()
export class CheckReadinessUseCase {
  constructor(
    @Inject(HEALTH_INDICATORS) private readonly indicators: readonly HealthIndicatorPort[],
  ) {}

  async execute(): Promise<ReadinessReport> {
    // Run in parallel: readiness must answer inside the load balancer's timeout.
    const checks = await Promise.all(this.indicators.map((indicator) => indicator.check()));
    return {
      status: checks.every((check) => check.status === 'up') ? 'up' : 'down',
      checks,
    };
  }
}
