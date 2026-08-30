import { Inject, Injectable } from '@nestjs/common';

import { DATABASE_SQL } from '../../../shared/tokens';
import type { Sql } from '../../../database/drizzle.client';
import type { HealthCheckResult, HealthIndicatorPort } from '../domain/ports/health-indicator.port';

/**
 * PostgreSQL readiness probe.
 *
 * `SELECT 1` is intentionally the whole check: it proves the pool can hand out a working
 * connection, which is the only thing readiness is allowed to assert. A heavier query would
 * turn a slow table into a false "not ready" and have ECS cycle healthy tasks.
 */
@Injectable()
export class DatabaseHealthIndicator implements HealthIndicatorPort {
  readonly name = 'database';

  constructor(@Inject(DATABASE_SQL) private readonly sql: Sql) {}

  async check(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.sql`SELECT 1`;
      return { name: this.name, status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      return {
        name: this.name,
        status: 'down',
        latencyMs: Date.now() - start,
        // Never echo the driver message: it can contain the host, user and database name.
        detail: error instanceof Error ? error.name : 'unknown error',
      };
    }
  }
}
