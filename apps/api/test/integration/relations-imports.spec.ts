import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertUuid } from '@cdr/shared';

import { GroupApplication } from '../../src/modules/applications/domain/entities/group-application';
import { DrizzleGroupApplicationRepository } from '../../src/modules/applications/infrastructure/persistence/drizzle-group-application.repository';
import { DrizzleExternalHomologRepository } from '../../src/modules/equivalences/infrastructure/persistence/drizzle-external-homolog.repository';
import { ImportBatch } from '../../src/modules/imports/domain/entities/import-batch';
import { DrizzleImportBatchRepository } from '../../src/modules/imports/infrastructure/persistence/drizzle-import-batch.repository';
import { type TestDatabase, createTestDatabase } from './database.helper';

const productId = assertUuid('10000000-0000-4000-8000-000000000001');
const groupId = assertUuid('20000000-0000-4000-8000-000000000001');
const now = new Date('2026-10-05T10:00:00.000Z');

describe('group relationships and imports persistence', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  beforeEach(async () => {
    await database.sql.unsafe(`
      TRUNCATE TABLE import_batches, group_applications, external_homologs,
        equivalence_group_members, equivalence_groups, products RESTART IDENTITY CASCADE
    `);
    await database.sql`
      INSERT INTO products (id, sku, name, status)
      VALUES (${productId}, 'D1672', 'Pastilla D1672', 'published')
    `;
    await database.sql`
      INSERT INTO equivalence_groups (id, code, name, kind)
      VALUES (${groupId}, 'D1672', 'D1672', 'interchange')
    `;
    await database.sql`
      INSERT INTO equivalence_group_members (group_id, product_id, role)
      VALUES (${groupId}, ${productId}, 'member')
    `;
  });

  afterAll(() => database.close());

  it('resolves applications inherited by a product through its unified-code group', async () => {
    const repository = new DrizzleGroupApplicationRepository(database.db);
    await repository.save(
      GroupApplication.create(
        { groupId, unifiedCode: 'D1672', make: 'Toyota', model: 'Hilux' },
        now,
      ),
    );

    const rows = await repository.list({ productId, includeInactive: false });
    expect(rows.map((row) => row.toSnapshot())).toEqual([
      expect.objectContaining({ unifiedCode: 'D1672', make: 'Toyota', model: 'Hilux' }),
    ]);
  });

  it('expands only active and approved external homologs to commercial SKUs', async () => {
    await database.sql`
      INSERT INTO external_homologs
        (id, equivalence_group_id, external_code, external_brand, active, approval_status)
      VALUES
        ('30000000-0000-4000-8000-000000000001', ${groupId}, 'OEM-42', 'BOSCH', true, 'approved'),
        ('30000000-0000-4000-8000-000000000002', ${groupId}, 'OEM-42', 'PENDING', true, 'pending'),
        ('30000000-0000-4000-8000-000000000003', ${groupId}, 'OEM-42', 'INACTIVE', false, 'approved')
    `;
    const repository = new DrizzleExternalHomologRepository(database.db);

    const matches = await repository.searchEligible('oem-42');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.homolog.toSnapshot()).toMatchObject({ externalBrand: 'BOSCH' });
    expect(matches[0]?.products).toEqual([expect.objectContaining({ sku: 'D1672' })]);
  });

  it('returns the original durable preview for a repeated idempotency key', async () => {
    const repository = new DrizzleImportBatchRepository(database.db);
    const first = ImportBatch.preview(
      {
        target: 'homologs',
        format: 'json',
        idempotencyKey: 'relations-test-1',
        payloadHash: 'same-hash',
        categoryCode: null,
        createdBy: 'admin',
        rows: [{ rowNumber: 1, valid: true, data: { externalCode: 'OEM-42' }, errors: [] }],
      },
      now,
    );
    const replay = ImportBatch.preview(
      {
        target: 'homologs',
        format: 'json',
        idempotencyKey: 'relations-test-1',
        payloadHash: 'same-hash',
        categoryCode: null,
        createdBy: 'admin',
        rows: [{ rowNumber: 1, valid: true, data: { externalCode: 'OEM-42' }, errors: [] }],
      },
      now,
    );

    const saved = await repository.savePreview(first);
    const repeated = await repository.savePreview(replay);
    expect(repeated.toSnapshot().id).toBe(saved.toSnapshot().id);
  });
});
