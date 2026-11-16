import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, newUuid } from '@cdr/shared';
import { createAuditEntry } from '../../src/modules/audit/domain/entities/audit-entry';
import { DrizzleTechnicalSheetVisibility } from '../../src/modules/product-assets/infrastructure/persistence/drizzle-technical-sheet-visibility';
import { createTestDatabase, type TestDatabase } from './database.helper';

describe('Per-SKU technical sheet visibility', () => {
  let database: TestDatabase;
  let repository: DrizzleTechnicalSheetVisibility;
  const productId = newUuid();
  const audit = () =>
    createAuditEntry({
      resourceType: 'product',
      resourceId: productId,
      action: 'updated',
      actorId: 'admin',
      source: 'test',
      correlationId: newUuid(),
      occurredAt: new Date(),
      changes: { technicalSheetVisible: { before: true, after: false } },
    });
  beforeAll(async () => {
    database = await createTestDatabase();
    repository = new DrizzleTechnicalSheetVisibility(database.db);
  });
  beforeEach(async () => {
    await database.truncateAll();
    await database.sql`INSERT INTO products(id, sku, name, status) VALUES (${productId}, 'VIS-1', 'Visibilidad', 'published')`;
  });
  afterAll(async () => {
    if (database) await database.close();
  });

  it('defaults existing products to visible and persists a single concurrent audited change', async () => {
    expect(await repository.get(productId)).toEqual({ productId, visible: true, version: 0 });
    const results = await Promise.allSettled([
      repository.save({ productId, visible: false, version: 0 }, audit()),
      repository.save({ productId, visible: false, version: 0 }, audit()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: expect.any(ConflictError),
    });
    expect(await repository.get(productId)).toEqual({ productId, visible: false, version: 1 });
    const rows = await database.sql`SELECT * FROM audit_entries WHERE resource_id = ${productId}`;
    expect(rows).toHaveLength(1);
  });

  it('rolls back the visibility if the append-only audit fails', async () => {
    const event = audit();
    await repository.save({ productId, visible: false, version: 0 }, event);
    await expect(
      repository.save({ productId, visible: true, version: 1 }, event),
    ).rejects.toThrow();
    expect(await repository.get(productId)).toMatchObject({ visible: false, version: 1 });
  });
});
