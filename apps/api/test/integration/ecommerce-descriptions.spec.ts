import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUuid } from '@cdr/shared';
import { DrizzleEcommerceDescription } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-ecommerce-description';
import type { EcommerceDescription } from '../../src/modules/catalog-schema/domain/ports/ecommerce-description.port';
import type { AuditEntry } from '../../src/modules/audit/domain/entities/audit-entry';
import { createTestDatabase, type TestDatabase } from './database.helper';
const productId = newUuid(),
  now = new Date('2026-11-09T15:00:00Z');
describe('ecommerce description persistence', () => {
  let database: TestDatabase, repository: DrizzleEcommerceDescription;
  beforeAll(async () => {
    database = await createTestDatabase();
    repository = new DrizzleEcommerceDescription(database.db);
  });
  beforeEach(async () => {
    await database.truncateAll();
    await database.sql`INSERT INTO products(id, sku, name, status) VALUES (${productId}, 'ECOM-1', 'Producto', 'draft')`;
  });
  afterAll(() => database?.close());
  const entry = (id = newUuid()): AuditEntry => ({
    id,
    resourceType: 'product',
    resourceId: productId,
    action: 'updated',
    actorId: 'admin',
    source: 'api:ecommerce-description',
    correlationId: newUuid(),
    occurredAt: now,
    changes: { textVersion: { after: 1 } },
  });
  const value = (version = 1): EcommerceDescription => ({
    productId,
    variantKey: 'industrial:industrial',
    titulo: 'Rodamiento SKF',
    descripcion: 'Texto aprobado.',
    status: 'approved',
    origin: 'edited',
    model: null,
    fingerprint: 'test-source-fingerprint',
    version,
    updatedAt: now.toISOString(),
    updatedBy: 'admin@example.test',
    approvedAt: now.toISOString(),
    approvedBy: 'admin@example.test',
  });
  it('persists across reads, batches by product and protects optimistic updates', async () => {
    await repository.save(value(), 0, entry());
    expect(await repository.get(productId, value().variantKey)).toMatchObject(value());
    expect(await repository.getMany([productId, productId])).toHaveLength(1);
    await expect(repository.save(value(), 0, entry())).rejects.toThrow('Otra persona');
    await expect(repository.save(value(2), 9, entry())).rejects.toThrow('Otra persona');
    await repository.save({ ...value(2), descripcion: 'Texto revisado.' }, 1, entry());
    expect(await repository.get(productId, value().variantKey)).toMatchObject({
      version: 2,
      descripcion: 'Texto revisado.',
    });
  });
  it('rolls back the text when its immutable audit event fails', async () => {
    const audit = entry();
    await repository.save(value(), 0, audit);
    await expect(repository.save(value(2), 1, audit)).rejects.toThrow();
    expect(await repository.get(productId, value().variantKey)).toMatchObject({ version: 1 });
  });
});
