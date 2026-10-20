import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { defaultMigrationsDir, readMigrations, runMigrations } from '../../src/database/migrator';
import { testDatabaseUrl } from './database.helper';

/**
 * Migration guarantees.
 *
 * These are the properties that keep QAS and PRD in step. Losing any one of them turns a
 * routine deployment into a schema divergence that is expensive to unpick, so each is
 * asserted rather than assumed.
 */
describe('migration runner', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = postgres(testDatabaseUrl(), { max: 2, onnotice: () => undefined, prepare: false });
    // The last test inspects the shared test database, so make sure it is migrated
    // regardless of which spec file happens to run first.
    await runMigrations(sql);
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it('applies every migration to a clean database and records them', async () => {
    // A throwaway database, so "clean" really means clean.
    const name = `cdr_pim_migrate_${Date.now()}`;
    await sql.unsafe(`CREATE DATABASE ${name}`);
    const target = postgres(testDatabaseUrl().replace(/\/[^/]+$/, `/${name}`), {
      max: 1,
      onnotice: () => undefined,
      prepare: false,
    });

    try {
      const result = await runMigrations(target);
      expect(result.applied.length).toBeGreaterThanOrEqual(9);
      expect(result.skipped).toEqual([]);

      const tables = await target<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name
      `;
      expect(tables.map((row) => row.table_name)).toEqual([
        'attribute_definitions',
        'attribute_templates',
        'audit_change_items',
        'audit_entries',
        'catalog_categories',
        'catalog_product_readiness',
        'cdr_schema_migrations',
        'code_affixes',
        'equivalence_group_members',
        'equivalence_groups',
        'external_homologs',
        'group_applications',
        'group_oem_codes',
        'import_batches',
        'import_rows',
        'product_assets',
        'product_attribute_values',
        'product_embeddings',
        'product_identifiers',
        'product_template_assignments',
        'products',
        'template_asset_requirements',
        'template_attribute_assignments',
        'template_attribute_role_access',
      ]);

      const auditId = randomUUID();
      await target`
        INSERT INTO audit_entries (
          id, resource_type, resource_id, action, actor_id, source,
          correlation_id, occurred_at, changes
        ) VALUES (
          ${auditId}, 'product', 'p-1', 'created', 'user-1', 'api',
          'correlation-1', now(), ${target.json({ sku: { after: '6202' } })}
        )
      `;
      await expect(
        target`UPDATE audit_entries SET resource_id = 'tampered' WHERE id = ${auditId}`,
      ).rejects.toThrow(/append-only/);
      await expect(target`DELETE FROM audit_entries WHERE id = ${auditId}`).rejects.toThrow(
        /append-only/,
      );
      await expect(target`TRUNCATE TABLE audit_entries CASCADE`).rejects.toThrow(/append-only/);

      // Re-running is a no-op: the deployment pipeline runs this on every release.
      const second = await runMigrations(target);
      expect(second.applied).toEqual([]);
      expect(second.skipped.length).toBe(result.applied.length);
    } finally {
      await target.end({ timeout: 5 });
      await sql.unsafe(`DROP DATABASE ${name} WITH (FORCE)`);
    }
  });

  it('refuses to run when an already-applied migration has been edited', async () => {
    const name = `cdr_pim_immutable_${Date.now()}`;
    await sql.unsafe(`CREATE DATABASE ${name}`);
    const target = postgres(testDatabaseUrl().replace(/\/[^/]+$/, `/${name}`), {
      max: 1,
      onnotice: () => undefined,
      prepare: false,
    });

    // Copy the real migrations into a scratch directory we are allowed to tamper with.
    const scratch = await mkdtemp(path.join(tmpdir(), 'cdr-migrations-'));
    const source = defaultMigrationsDir();
    for (const file of await readdir(source)) {
      await writeFile(path.join(scratch, file), await readFile(path.join(source, file)));
    }

    try {
      await runMigrations(target, scratch);

      // Someone "just tweaks" a migration that already ran in QAS.
      const tampered = path.join(scratch, '0001_core_catalog.sql');
      await writeFile(tampered, `${await readFile(tampered, 'utf8')}\n-- innocent comment\n`);

      await expect(runMigrations(target, scratch)).rejects.toThrow(
        /was modified after being applied/,
      );
    } finally {
      await target.end({ timeout: 5 });
      await sql.unsafe(`DROP DATABASE ${name} WITH (FORCE)`);
    }
  });

  it('enforces the NNNN_snake_case_name.sql convention', async () => {
    const scratch = await mkdtemp(path.join(tmpdir(), 'cdr-migrations-bad-'));
    await writeFile(path.join(scratch, 'add-some-table.sql'), 'SELECT 1;');

    await expect(readMigrations(scratch)).rejects.toThrow(/NNNN_snake_case_name\.sql/);
  });

  it('creates the pgvector extension and the HNSW index', async () => {
    const extensions = await sql<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;
    expect(extensions).toHaveLength(1);

    const indexes = await sql<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'product_embeddings' AND indexname = 'product_embeddings_hnsw_cosine_idx'
    `;
    expect(indexes[0]?.indexdef).toContain('USING hnsw');
    expect(indexes[0]?.indexdef).toContain('vector_cosine_ops');
  });
});
