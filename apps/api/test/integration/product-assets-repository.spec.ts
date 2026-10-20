import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertUuid, newUuid } from '@cdr/shared';

import { AuditAction, type AuditEntry } from '../../src/modules/audit/domain/entities/audit-entry';
import { ProductAsset } from '../../src/modules/product-assets/domain/entities/product-asset';
import { DrizzleProductAssetRepository } from '../../src/modules/product-assets/infrastructure/persistence/drizzle-product-asset.repository';
import { type TestDatabase, createTestDatabase } from './database.helper';

const productId = assertUuid('10000000-0000-4000-8000-000000000009');
const now = new Date('2026-10-07T10:00:00.000Z');

describe('product asset repository unit of work', () => {
  let database: TestDatabase;
  let repository: DrizzleProductAssetRepository;

  beforeAll(async () => {
    database = await createTestDatabase();
    repository = new DrizzleProductAssetRepository(database.db);
  });

  beforeEach(async () => {
    await database.truncateAll();
    await database.sql`
      INSERT INTO products (id, sku, name, status)
      VALUES (${productId}, '6205-2RS1', 'Rodamiento 6205', 'draft')
    `;
  });

  afterAll(() => database?.close());

  it('commits metadata and field-level audit in one transaction', async () => {
    const asset = makeAsset('FT');
    await repository.saveReplacing(asset, 'buyer-1', now, (saved) =>
      auditEntry(newUuid(), saved.toSnapshot().id, 'created'),
    );

    const [metadata] = await database.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM product_assets WHERE deleted_at IS NULL
    `;
    const [audit] = await database.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM audit_entries WHERE resource_type = 'product_asset'
    `;
    const [changes] = await database.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM audit_change_items
    `;
    expect(metadata?.count).toBe(1);
    expect(audit?.count).toBe(1);
    expect(changes?.count).toBe(2);
  });

  it('rolls metadata back when the audit insert fails', async () => {
    const duplicateAuditId = newUuid();
    await database.sql`
      INSERT INTO audit_entries
        (id, resource_type, resource_id, action, actor_id, source, correlation_id, occurred_at, changes)
      VALUES
        (${duplicateAuditId}, 'test', 'occupied', 'created', 'test', 'test', 'test', ${now.toISOString()}, '{}'::jsonb)
    `;
    const asset = makeAsset('MSDS');
    await expect(
      repository.saveReplacing(asset, 'buyer-1', now, (saved) =>
        auditEntry(duplicateAuditId, saved.toSnapshot().id, 'created'),
      ),
    ).rejects.toBeDefined();

    const [metadata] = await database.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM product_assets WHERE id = ${asset.toSnapshot().id}
    `;
    expect(metadata?.count).toBe(0);
  });

  it('rolls a deletion back when its audit insert fails', async () => {
    const asset = makeAsset('FT');
    const duplicateAuditId = newUuid();
    await repository.saveReplacing(asset, 'buyer-1', now, (saved) =>
      auditEntry(duplicateAuditId, saved.toSnapshot().id, 'created'),
    );

    await expect(
      repository.softDelete(asset.toSnapshot().id, 'buyer-1', now, (deleted) =>
        auditEntry(duplicateAuditId, deleted.toSnapshot().id, 'deleted'),
      ),
    ).rejects.toBeDefined();

    expect(await repository.findById(asset.toSnapshot().id)).not.toBeNull();
  });
});

function makeAsset(type: 'FT' | 'MSDS'): ProductAsset {
  const id = newUuid();
  return ProductAsset.create({
    id,
    productId,
    sku: '6205-2RS1',
    type,
    filename: `6205-2RS1__${type}.pdf`,
    objectKey: `products/${productId}/documents/${id}.pdf`,
    bucket: 'test-assets',
    mimeType: 'application/pdf',
    size: 100,
    checksum: 'test-checksum',
    position: null,
    source: 'manual',
    uploadedBy: 'buyer-1',
    uploadedAt: now,
  });
}

function auditEntry(
  id: ReturnType<typeof newUuid>,
  resourceId: string,
  action: AuditEntry['action'],
): AuditEntry {
  return {
    id,
    resourceType: 'product_asset',
    resourceId,
    action: action === 'deleted' ? AuditAction.Deleted : AuditAction.Created,
    actorId: 'buyer-1',
    source: 'api',
    correlationId: newUuid(),
    occurredAt: now,
    changes: { filename: { after: 'asset.pdf' }, active: { after: action !== 'deleted' } },
  };
}
