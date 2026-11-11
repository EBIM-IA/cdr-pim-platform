import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Sql } from '../../../../database/drizzle.client';
import { DATABASE_SQL } from '../../../../shared/tokens';
import type { SearchTelemetryPort } from '../../domain/ports/search-telemetry.port';
@Injectable()
export class PostgresSearchTelemetryAdapter implements SearchTelemetryPort {
  private readonly logger = new Logger(PostgresSearchTelemetryAdapter.name);
  constructor(@Inject(DATABASE_SQL) private readonly sql: Sql) {}
  async record(query: string, results: number, channel: 'variants' | 'semantic'): Promise<void> {
    try {
      const normalized = query.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es').slice(0, 300);
      if (!normalized) return;
      await this
        .sql`INSERT INTO search_events(id,query,result_count,channel) VALUES (${randomUUID()}::uuid,${normalized},${Math.max(0, results)},${channel})`;
    } catch {
      // A failed statistics write must not turn an otherwise successful catalog search into an error.
      // Do not log the raw query or database exception: they can contain user input.
      this.logger.warn('Search telemetry could not be persisted');
    }
  }
}
