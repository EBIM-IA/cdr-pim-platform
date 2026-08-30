import { getTableColumns, getTableName } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { schema } from '../../src/database/schema';
import { type TestDatabase, createTestDatabase } from './database.helper';

/**
 * Guards the one seam created by ADR-009.
 *
 * The authoritative schema is the hand-written SQL in `apps/api/drizzle/`; the Drizzle
 * table definitions are a typed *query* surface over it. Nothing in the toolchain forces
 * the two to agree, so this test does — by comparing every Drizzle column against
 * `information_schema` on a freshly migrated database.
 *
 * If this fails after you wrote a migration, the fix is to update the matching
 * `*.tables.ts` file. Never the other way round.
 */
describe('Drizzle schema matches the migrated database', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(() => database.close());

  it.each(Object.entries(schema))(
    '%s has the same columns in code and in PostgreSQL',
    async (_name, table) => {
      const tableName = getTableName(table as PgTable);
      const declared = Object.values(getTableColumns(table as PgTable))
        .map((column) => column.name)
        .sort();

      const actual = await database.sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
      ORDER BY column_name
    `;

      expect(actual.map((row) => row.column_name)).toEqual(declared);
    },
  );

  it('declares the embedding column as vector(1536), matching AI_EMBEDDING_DIMENSIONS', async () => {
    const [column] = await database.sql<{ udt_name: string }[]>`
      SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'product_embeddings' AND column_name = 'embedding'
    `;
    expect(column?.udt_name).toBe('vector');

    const [dimensions] = await database.sql<{ atttypmod: number }[]>`
      SELECT a.atttypmod
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      WHERE c.relname = 'product_embeddings' AND a.attname = 'embedding'
    `;
    expect(dimensions?.atttypmod).toBe(1536);
  });
});
