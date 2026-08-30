/* eslint-disable no-console -- standalone CLI: stdout is its user interface */
import postgres from 'postgres';

import { defaultMigrationsDir, runMigrations } from './migrator';

/**
 * Standalone migration runner.
 *
 * Run locally with `pnpm db:migrate`. In AWS it runs as a one-off ECS task from the very
 * same image as the API, *before* the new service revision is rolled out — never from
 * inside a serving container. See `docs/architecture/DEPLOYMENT_STRATEGY.md`.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(2);
  }

  const directory = process.argv[2] ?? defaultMigrationsDir();
  const sql = postgres(url, {
    max: 1,
    ssl: process.env.DATABASE_SSL === 'true' ? 'require' : false,
    // `CREATE EXTENSION IF NOT EXISTS` emits a NOTICE that postgres.js would otherwise
    // dump to the console as if it were a failure.
    onnotice: () => undefined,
  });

  try {
    const result = await runMigrations(sql, directory);
    for (const id of result.skipped) console.log(`  = ${id} (already applied)`);
    for (const id of result.applied) console.log(`  + ${id} applied`);
    console.log(
      result.applied.length === 0
        ? 'Database is up to date.'
        : `${result.applied.length} migration(s) applied.`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
