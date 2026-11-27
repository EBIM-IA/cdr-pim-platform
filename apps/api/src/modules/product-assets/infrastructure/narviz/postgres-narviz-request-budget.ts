import { newUuid } from '@cdr/shared';
import type { TransactionSql } from 'postgres';

import type { Sql } from '../../../../database/drizzle.client';
import { EcommerceImageSourceError } from '../../domain/ports/ecommerce-image-source.port';
import type { NarvizRequestBudget } from './narviz-request-budget';

const MAX_UNITS_PER_MINUTE = 120;
const REQUEST_WINDOW_MS = 60_000;
const MAX_ACTIVE_DOWNLOADS = 2;
// The HTTP adapter bounds one download and its retries within this lease.
const DOWNLOAD_LEASE_MS = 60_000;

interface Entry {
  readonly kind: 'request' | 'download' | 'cooldown';
  readonly units: number;
  readonly expiresAt: number;
}

/** Coordinates quotas across API replicas without holding a database connection during HTTP calls. */
export class PostgresNarvizRequestBudget implements NarvizRequestBudget {
  constructor(private readonly sql: Sql) {}

  async reserve(units: number): Promise<void> {
    await this.withLock(async (tx, now, entries) => {
      const requests = entries.filter((entry) => entry.kind === 'request');
      const cooldown = entries.find((entry) => entry.kind === 'cooldown');
      let availableAt = cooldown?.expiresAt ?? now;
      let spent = requests.reduce((total, request) => total + request.units, 0);
      for (const request of requests) {
        if (spent + units <= MAX_UNITS_PER_MINUTE) break;
        spent -= request.units;
        availableAt = Math.max(availableAt, request.expiresAt);
      }
      if (availableAt > now) throw rateLimited(availableAt, now);

      const expiry = now + REQUEST_WINDOW_MS;
      await tx`
        INSERT INTO narviz_request_budget (id, kind, units, expires_at)
        VALUES (${newUuid()}, 'request', ${units}, to_timestamp(${expiry}::double precision / 1000))
      `;
    });
  }

  async pause(delayMs: number): Promise<void> {
    await this.withLock(async (tx, now) => {
      const expiry = now + delayMs;
      await tx`
        INSERT INTO narviz_request_budget (id, kind, expires_at)
        VALUES (${newUuid()}, 'cooldown', to_timestamp(${expiry}::double precision / 1000))
        ON CONFLICT (kind) WHERE kind = 'cooldown' DO UPDATE
        SET expires_at = GREATEST(narviz_request_budget.expires_at, EXCLUDED.expires_at)
      `;
    });
  }

  async withDownload<T>(operation: () => Promise<T>): Promise<T> {
    const leaseId = newUuid();
    await this.withLock(async (tx, now, entries) => {
      const downloads = entries.filter((entry) => entry.kind === 'download');
      const earliest = downloads[0];
      if (earliest && downloads.length >= MAX_ACTIVE_DOWNLOADS) {
        throw rateLimited(earliest.expiresAt, now);
      }

      const expiry = now + DOWNLOAD_LEASE_MS;
      await tx`
        INSERT INTO narviz_request_budget (id, kind, expires_at)
        VALUES (${leaseId}, 'download', to_timestamp(${expiry}::double precision / 1000))
      `;
    });

    try {
      return await operation();
    } finally {
      // An expired lease can be replaced even if its original owner finishes late.
      // If PostgreSQL is temporarily unavailable, expiry still releases the slot.
      await this.sql`DELETE FROM narviz_request_budget WHERE id = ${leaseId}`.catch(
        () => undefined,
      );
    }
  }

  private async withLock(
    operation: (tx: TransactionSql, now: number, entries: readonly Entry[]) => Promise<void>,
  ): Promise<void> {
    try {
      await this.sql.begin(async (tx) => {
        await tx`SET LOCAL statement_timeout = '2000ms'`;
        await tx`SELECT pg_advisory_xact_lock(hashtext('cdr:narviz-request-budget'))`;
        const [clock] = await tx<{ now: number }[]>`
          SELECT (extract(epoch FROM clock_timestamp()) * 1000)::double precision AS now
        `;
        if (!clock) throw unavailable();
        const now = clock.now;
        await tx`
          DELETE FROM narviz_request_budget
          WHERE expires_at <= to_timestamp(${now}::double precision / 1000)
        `;
        const entries = await tx<Entry[]>`
          SELECT kind, units, (extract(epoch FROM expires_at) * 1000)::double precision AS "expiresAt"
          FROM narviz_request_budget
          ORDER BY expires_at
        `;
        await operation(tx, now, entries);
      });
    } catch (error) {
      if (error instanceof EcommerceImageSourceError) throw error;
      throw unavailable();
    }
  }
}

function rateLimited(availableAt: number, now: number): EcommerceImageSourceError {
  return new EcommerceImageSourceError({
    status: 429,
    upstreamCode: 'RATE_LIMITED',
    retryAfterSeconds: Math.ceil((availableAt - now) / 1_000),
  });
}

function unavailable(): EcommerceImageSourceError {
  return new EcommerceImageSourceError({ status: 503, upstreamCode: 'RATE_BUDGET_UNAVAILABLE' });
}
