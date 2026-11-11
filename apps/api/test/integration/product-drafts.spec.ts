import { ConflictError, newUuid } from '@cdr/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createAuditEntry } from '../../src/modules/audit/domain/entities/audit-entry';
import { DrizzleProductDraft } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-product-draft';
import { createTestDatabase, type TestDatabase } from './database.helper';

const productId = newUuid(),
  templateId = newUuid(),
  categoryId = newUuid();
const now = new Date('2026-11-10T15:00:00Z');
const audit = () =>
  createAuditEntry({
    resourceType: 'product_draft',
    resourceId: productId,
    action: 'updated',
    actorId: 'admin',
    source: 'api',
    correlationId: newUuid(),
    occurredAt: now,
    changes: { draft: { after: 'acero' } },
  });
const input = () => ({
  productId,
  templateId,
  actorId: 'admin',
  version: 0,
  updatedAt: now,
  entries: [{ attributeKey: 'material', draft: 'acero', expectedVersion: 4 }],
});

describe('durable product drafts', () => {
  let database: TestDatabase, repository: DrizzleProductDraft;
  beforeAll(async () => {
    database = await createTestDatabase();
    repository = new DrizzleProductDraft(database.db);
  });
  beforeEach(async () => {
    await database.truncateAll();
    await database.sql`INSERT INTO products(id,sku,name) VALUES (${productId}, 'DRAFT-1', 'Producto')`;
    await database.sql`INSERT INTO catalog_categories(id,slug,name,path) VALUES (${categoryId},'drafts','Drafts','drafts')`;
    await database.sql`INSERT INTO attribute_templates(id,category_id,variant_key,name,version,status) VALUES (${templateId},${categoryId},'draft','Drafts',1,'active')`;
  });
  afterAll(() => database?.close());

  it('persists privately across adapter instances and clearing retains concurrency protection', async () => {
    await repository.save(input(), audit());
    expect(await new DrizzleProductDraft(database.db).get(productId, 'admin')).toMatchObject({
      version: 1,
      entries: input().entries,
    });
    expect(await repository.get(productId, 'otro')).toBeNull();
    await repository.save({ ...input(), version: 1, entries: [] }, audit());
    await expect(repository.save(input(), audit())).rejects.toBeInstanceOf(ConflictError);
    expect(await repository.get(productId, 'admin')).toMatchObject({ version: 2, entries: [] });
    const [product] = await database.sql`SELECT status FROM products WHERE id=${productId}`;
    expect(product?.status).toBe('draft');
  });
  it('allows one concurrent initial writer and rolls back when audit cannot be written', async () => {
    const entry = audit();
    const outcomes = await Promise.allSettled([
      repository.save(input(), entry),
      repository.save(input(), audit()),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const [event] = await database.sql`SELECT id FROM audit_entries LIMIT 1`;
    await expect(
      repository.save({ ...input(), version: 1, entries: [] }, { ...entry, id: event!.id }),
    ).rejects.toThrow();
    expect(await repository.get(productId, 'admin')).toMatchObject({
      version: 1,
      entries: input().entries,
    });
  });
});
