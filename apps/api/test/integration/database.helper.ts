import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import { schema } from '../../src/database/schema';
import { runMigrations } from '../../src/database/migrator';

const TEST_DATABASE_NAME_PATTERN = /(^|[_-])test([_-]|$)/i;
const TEST_RESET_ADVISORY_LOCK = 4_871_206;

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
  return assertSafeTestDatabaseUrl(url);
}

/**
 * Destructive integration-test helpers must never be able to target an operational database.
 * Validate the database name without echoing credentials from the connection string in errors.
 */
export function assertSafeTestDatabaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL connection URL.');
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('TEST_DATABASE_URL must use the postgres:// or postgresql:// protocol.');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!databaseName || !TEST_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      `Refusing destructive integration-test cleanup for database "${databaseName || '(missing)'}". ` +
        'The TEST_DATABASE_URL database name must contain "test" as a separate segment.',
    );
  }

  return value;
}

function databaseNameFromUrl(value: string): string {
  return decodeURIComponent(new URL(value).pathname.replace(/^\//, ''));
}

export interface TestDatabase {
  readonly sql: postgres.Sql;
  readonly db: ReturnType<typeof drizzle>;
  truncateAll(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const url = testDatabaseUrl();
  const expectedDatabaseName = databaseNameFromUrl(url);
  const sql = postgres(url, { max: 4, onnotice: () => undefined, prepare: false });
  await runMigrations(sql);

  const [connection] = await sql<{ databaseName: string }[]>`
    SELECT current_database() AS "databaseName"
  `;
  if (
    connection?.databaseName !== expectedDatabaseName ||
    !TEST_DATABASE_NAME_PATTERN.test(connection.databaseName)
  ) {
    await sql.end({ timeout: 5 });
    throw new Error(
      `TEST_DATABASE_URL resolved to unexpected database "${connection?.databaseName ?? '(unknown)'}"; ` +
        `expected the validated test database "${expectedDatabaseName}".`,
    );
  }

  return {
    sql,
    db: drizzle(sql, { schema }),
    /**
     * Truncating with CASCADE and RESTART IDENTITY between tests is far faster than
     * dropping and re-migrating, and keeps every test independent of ordering. The
     * append-only audit triggers stay immutable in every deployed environment: only their
     * TRUNCATE guards are disabled, transactionally, on the validated test database.
     */
    async truncateAll(): Promise<void> {
      await sql.begin(async (tx) => {
        // Vitest already serialises spec files. The database lock also serialises resets if
        // two integration-test processes happen to target the same database concurrently.
        await tx`SELECT pg_advisory_xact_lock(${TEST_RESET_ADVISORY_LOCK})`;
        await tx
          .unsafe(
            `
              ALTER TABLE audit_change_items
                DISABLE TRIGGER audit_change_items_no_truncate;
              ALTER TABLE audit_entries
                DISABLE TRIGGER audit_entries_no_truncate;

              TRUNCATE TABLE
                audit_change_items,
                audit_entries,
                catalog_categories,
                attribute_definitions,
                product_embeddings,
                equivalence_group_members,
                equivalence_groups,
                product_identifiers,
                products
              RESTART IDENTITY CASCADE;

              ALTER TABLE audit_change_items
                ENABLE TRIGGER audit_change_items_no_truncate;
              ALTER TABLE audit_entries
                ENABLE TRIGGER audit_entries_no_truncate;
            `,
          )
          .simple();
      });
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
