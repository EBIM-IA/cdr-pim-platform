import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type postgres from 'postgres';

const MIGRATIONS_TABLE = 'cdr_schema_migrations';

/**
 * Migrations live in `apps/api/drizzle`, resolved relative to the process working
 * directory rather than to `__dirname`. That single definition then holds for every
 * execution mode we support — `tsx` from the package root, the compiled `dist/` bundle,
 * Vitest (which transpiles to ESM, where `__dirname` does not exist) and the Docker image,
 * whose WORKDIR is the package root.
 */
export function defaultMigrationsDir(): string {
  return path.resolve(process.cwd(), 'drizzle');
}

export interface MigrationFile {
  readonly version: string;
  readonly name: string;
  readonly checksum: string;
  readonly sql: string;
}

export interface MigrationResult {
  readonly applied: string[];
  readonly skipped: string[];
}

const FILENAME_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export async function readMigrations(directory = defaultMigrationsDir()): Promise<MigrationFile[]> {
  const entries = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();

  const migrations: MigrationFile[] = [];
  for (const entry of entries) {
    const match = FILENAME_PATTERN.exec(entry);
    if (!match) {
      throw new Error(
        `Migration "${entry}" does not follow the required NNNN_snake_case_name.sql convention.`,
      );
    }
    const sql = await readFile(path.join(directory, entry), 'utf8');
    migrations.push({
      version: match[1] as string,
      name: match[2] as string,
      checksum: createHash('sha256').update(sql).digest('hex'),
      sql,
    });
  }

  const versions = migrations.map((m) => m.version);
  const duplicate = versions.find((v, i) => versions.indexOf(v) !== i);
  if (duplicate) {
    throw new Error(`Duplicate migration version ${duplicate}. Versions must be unique.`);
  }

  return migrations;
}

/**
 * Applies pending migrations inside a transaction, one file at a time.
 *
 * Two properties are deliberately enforced here rather than left to convention:
 *
 *  1. **Immutability** — the SHA-256 of every already-applied file is re-checked. Editing a
 *     migration that has run in any environment is a hard error, because QAS and PRD would
 *     silently diverge otherwise.
 *  2. **Advisory locking** — concurrently starting ECS tasks would otherwise race to run
 *     the same DDL. A session-level advisory lock makes the migration step safe to run from
 *     every task, or from a one-off task, without coordination.
 */
export async function runMigrations(
  sql: postgres.Sql,
  directory = defaultMigrationsDir(),
): Promise<MigrationResult> {
  const migrations = await readMigrations(directory);

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version     text PRIMARY KEY,
      name        text NOT NULL,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  // 4_871_205 is an arbitrary but fixed namespace for "cdr-pim schema migrations".
  await sql`SELECT pg_advisory_lock(4871205)`;
  try {
    const rows = await sql.unsafe<{ version: string; name: string; checksum: string }[]>(
      `SELECT version, name, checksum FROM ${MIGRATIONS_TABLE}`,
    );
    const applied = new Map(rows.map((row) => [row.version, row]));

    for (const [version, row] of applied) {
      const known = migrations.find((m) => m.version === version);
      if (!known) {
        throw new Error(
          `Migration ${version}_${row.name} is recorded in the database but missing from ` +
            `${directory}. Applied migrations must never be deleted.`,
        );
      }
      if (known.checksum !== row.checksum) {
        throw new Error(
          `Migration ${version}_${known.name} was modified after being applied ` +
            `(expected checksum ${row.checksum}, found ${known.checksum}). ` +
            `Applied migrations are immutable — add a new migration instead.`,
        );
      }
    }

    const result: MigrationResult = { applied: [], skipped: [] };
    for (const migration of migrations) {
      const id = `${migration.version}_${migration.name}`;
      if (applied.has(migration.version)) {
        (result.skipped as string[]).push(id);
        continue;
      }
      await sql.begin(async (tx) => {
        // `.simple()` uses the simple query protocol, which is the only one that accepts a
        // multi-statement script in a single round trip.
        await tx.unsafe(migration.sql).simple();
        await tx.unsafe(
          `INSERT INTO ${MIGRATIONS_TABLE} (version, name, checksum) VALUES ($1, $2, $3)`,
          [migration.version, migration.name, migration.checksum],
        );
      });
      (result.applied as string[]).push(id);
    }
    return result;
  } finally {
    await sql`SELECT pg_advisory_unlock(4871205)`;
  }
}
