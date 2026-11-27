import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresNarvizRequestBudget } from '../../src/modules/product-assets/infrastructure/narviz/postgres-narviz-request-budget';
import { type TestDatabase, createTestDatabase } from './database.helper';

describe('PostgreSQL Narviz request budget', () => {
  let database: TestDatabase;
  let first: PostgresNarvizRequestBudget;
  let second: PostgresNarvizRequestBudget;

  beforeAll(async () => {
    database = await createTestDatabase();
    first = new PostgresNarvizRequestBudget(database.sql);
    second = new PostgresNarvizRequestBudget(database.sql);
  });

  beforeEach(async () => {
    await database.sql`TRUNCATE TABLE narviz_request_budget`;
  });

  afterAll(() => database?.close());

  it('serializes competing weighted reservations and restores capacity on expiry', async () => {
    const attempts = await Promise.allSettled([first.reserve(80), second.reserve(80)]);
    expect(attempts).toEqual(
      expect.arrayContaining([
        { status: 'fulfilled', value: undefined },
        {
          status: 'rejected',
          reason: expect.objectContaining({ status: 429, retryAfterSeconds: expect.any(Number) }),
        },
      ]),
    );
    await second.reserve(40);
    await expect(first.reserve(40)).rejects.toMatchObject({ status: 429 });

    await database.sql`
      UPDATE narviz_request_budget
      SET expires_at = clock_timestamp() - interval '1 second'
      WHERE kind = 'request' AND units = 40
    `;
    await second.reserve(40);
    await expect(first.reserve(1)).rejects.toMatchObject({ status: 429 });
  });

  it('propagates Retry-After without shortening a cooldown another replica set', async () => {
    await first.pause(20_000);
    await second.pause(1_000);
    await expect(second.reserve(1)).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 20,
    });

    await database.sql`
      UPDATE narviz_request_budget SET expires_at = clock_timestamp() - interval '1 second'
      WHERE kind = 'cooldown'
    `;
    await first.reserve(1);
  });

  it('shares download slots and releases a slot even when its download fails', async () => {
    const firstStarted = deferred<void>();
    const lastStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    const releaseLast = deferred<string>();
    const inflight = [
      first.withDownload(async () => {
        firstStarted.resolve();
        await releaseFirst.promise;
        throw new Error('download cancelled');
      }),
      second.withDownload(() => {
        lastStarted.resolve();
        return releaseLast.promise;
      }),
    ];
    try {
      await Promise.race([Promise.all([firstStarted.promise, lastStarted.promise]), ...inflight]);
      await expect(first.withDownload(async () => 'third')).rejects.toMatchObject({ status: 429 });
      releaseFirst.resolve();
      await expect(inflight[0]).rejects.toThrow('download cancelled');
      await expect(second.withDownload(async () => 'fourth')).resolves.toBe('fourth');
    } finally {
      releaseFirst.resolve();
      releaseLast.resolve('second');
      await Promise.allSettled(inflight);
    }
  });
});

function deferred<T>(): { resolve: (value: T) => void; promise: Promise<T> } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { resolve, promise };
}
