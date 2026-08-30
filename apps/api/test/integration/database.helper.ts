import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import { schema } from '../../src/database/schema';
import { runMigrations } from '../../src/database/migrator';

/**
 * Shared plumbing for integration tests.
 *
 * These tests run against a real PostgreSQL with pgvector — the behaviours under test
 * (upserts, cascading deletes, partial unique indexes, cosine distance, HNSW) simply do
 * not exist in a fake, so testing them against one would prove nothing.
 *
 *   docker compose up -d postgres
 *   pnpm --filter @cdr/api test:integration
 */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Start the database with `docker compose up -d postgres` ' +
        'and copy .env.example to .env.',
    );
  }
  return url;
}

export interface TestDatabase {
  readonly sql: postgres.Sql;
  readonly db: ReturnType<typeof drizzle>;
  truncateAll(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const sql = postgres(testDatabaseUrl(), { max: 4, onnotice: () => undefined, prepare: false });
  await runMigrations(sql);

  return {
    sql,
    db: drizzle(sql, { schema }),
    /**
     * Truncating with CASCADE and RESTART IDENTITY between tests is far faster than
     * dropping and re-migrating, and keeps every test independent of ordering.
     */
    async truncateAll(): Promise<void> {
      await sql.unsafe(`
        TRUNCATE TABLE
          product_embeddings,
          equivalence_group_members,
          equivalence_groups,
          product_identifiers,
          products
        RESTART IDENTITY CASCADE
      `);
    },
    async close(): Promise<void> {
      await sql.end({ timeout: 5 });
    },
  };
}

/**
 * Asserts that a database operation was rejected by a specific named constraint.
 *
 * Drizzle wraps driver errors, so the constraint name is not in `error.message` — it is on
 * the `postgres.js` error further down the `cause` chain. Matching the *name* rather than a
 * message substring also keeps the assertion meaningful if the wrapper's text changes.
 */
export async function expectConstraintViolation(
  operation: Promise<unknown>,
  constraintName: string,
): Promise<void> {
  let caught: unknown;
  try {
    await operation;
  } catch (error) {
    caught = error;
  }

  if (caught === undefined) {
    throw new Error(`Expected the operation to violate "${constraintName}", but it succeeded.`);
  }

  const names: string[] = [];
  for (let error: unknown = caught; error != null; error = (error as { cause?: unknown }).cause) {
    const name = (error as { constraint_name?: string }).constraint_name;
    if (name) names.push(name);
  }

  if (!names.includes(constraintName)) {
    throw new Error(
      `Expected constraint "${constraintName}" to be violated, but got [${names.join(', ') || 'none'}].\n` +
        `Original error: ${String(caught)}`,
    );
  }
}
