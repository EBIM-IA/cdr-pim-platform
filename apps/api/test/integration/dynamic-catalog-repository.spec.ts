import { assertUuid, newUuid } from '@cdr/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedDemoCatalog } from '../../src/database/demo-seed';
import { equivalenceGroupMembers, products } from '../../src/database/schema';
import { PostgresAuditAdapter } from '../../src/modules/audit/infrastructure/persistence/postgres-audit.adapter';
import { AttributeValueSource } from '../../src/modules/catalog-schema/domain/entities/catalog-schema';
import { DrizzleDynamicCatalogRepository } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-dynamic-catalog.repository';
import { productTemplateAssignments } from '../../src/modules/catalog-schema/infrastructure/persistence/catalog-schema.tables';
import { type TestDatabase, createTestDatabase } from './database.helper';

describe('DrizzleDynamicCatalogRepository', () => {
  let database: TestDatabase;
  let repository: DrizzleDynamicCatalogRepository;

  beforeAll(async () => {
    database = await createTestDatabase();
    repository = new DrizzleDynamicCatalogRepository(database.db);
  });
  beforeEach(async () => {
    await database.truncateAll();
    await seedDemoCatalog(database.db);
  });
  afterAll(() => database.close());

  it('discovers active categories and filters every schema by role access', async () => {
    const categories = await repository.listActiveCategories(['COMPRAS']);
    expect(categories).toHaveLength(7);

    const purchasing = await repository.getActiveSchema(categories[0]!.id, ['COMPRAS']);
    const sales = await repository.getActiveSchema(categories[0]!.id, ['VENTAS']);
    expect(purchasing?.attributes).toHaveLength(6);
    expect(
      purchasing?.attributes.find((attribute) => attribute.key === 'descripcion_tecnica')
        ?.permissions.edit,
    ).toBe(true);
    expect(
      purchasing?.attributes
        .filter((attribute) => attribute.sourceAuthority === 'erp')
        .every((attribute) => !attribute.permissions.edit),
    ).toBe(true);
    expect(sales?.attributes.every((attribute) => !attribute.permissions.edit)).toBe(true);
    expect(await repository.listActiveCategories(['UNKNOWN'])).toEqual([]);
  });

  it('lists products using dynamic searchable-attribute filters', async () => {
    const category = (await repository.listActiveCategories(['COMPRAS'])).find(
      (item) => item.slug === 'pastillas-de-freno',
    );
    const result = await repository.listGrid({
      categoryId: category!.id,
      roles: ['COMPRAS'],
      page: 1,
      pageSize: 25,
      filters: [{ key: 'codigo_proveedor', operator: 'contains', value: 'CARBON' }],
    });
    expect(result).toMatchObject({ total: 1, items: [{ sku: 'D1672' }] });
    expect(result.items[0]?.attributes.codigo_proveedor?.value).toContain('CARBON');
  });

  it('enforces optimistic concurrency and replicates configured values in codigoUnificador', async () => {
    const [primary] = await database.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.sku, 'D1672'));
    const [template] = await database.db
      .select({ templateId: productTemplateAssignments.templateId })
      .from(productTemplateAssignments)
      .where(eq(productTemplateAssignments.productId, primary!.id));
    const [membership] = await database.db
      .select({ groupId: equivalenceGroupMembers.groupId })
      .from(equivalenceGroupMembers)
      .where(eq(equivalenceGroupMembers.productId, primary!.id));
    const primaryId = assertUuid(primary!.id, 'productId');
    const replicaId = newUuid();
    await database.db.insert(products).values({
      id: replicaId,
      sku: 'D1672-REPLICA',
      name: 'Producto homólogo de prueba',
      status: 'draft',
    });
    await database.db.insert(productTemplateAssignments).values({
      productId: replicaId,
      templateId: template!.templateId,
    });
    await database.db.insert(equivalenceGroupMembers).values({
      groupId: membership!.groupId,
      productId: replicaId,
      role: 'member',
    });

    const updated = await repository.updateAttribute({
      productId: primaryId,
      attributeKey: 'codigo_unificador',
      value: 'D1672-NUEVO',
      source: AttributeValueSource.Manual,
      expectedVersion: 1,
      roles: ['COMPRAS'],
      now: new Date('2026-10-05T10:00:00.000Z'),
      audit: { actorId: 'buyer-1', correlationId: 'correlation-1' },
    });
    expect(updated.kind).toBe('updated');
    if (updated.kind !== 'updated') throw new Error('Expected an updated result');
    expect(updated.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: primaryId,
          after: expect.objectContaining({ version: 2, value: 'D1672-NUEVO' }),
        }),
        expect.objectContaining({
          productId: replicaId,
          after: expect.objectContaining({ version: 1, value: 'D1672-NUEVO' }),
        }),
      ]),
    );
    const audit = await new PostgresAuditAdapter(database.db).listChanges({
      page: 1,
      pageSize: 25,
      sku: 'D1672',
      field: 'codigo_unificador',
      source: 'manual',
    });
    expect(audit).toMatchObject({
      total: 1,
      items: [{ resourceType: 'product', resourceId: primaryId, after: 'D1672-NUEVO' }],
    });

    await expect(
      repository.updateAttribute({
        productId: primaryId,
        attributeKey: 'codigo_unificador',
        value: 'STALE',
        source: AttributeValueSource.Manual,
        expectedVersion: 1,
        roles: ['COMPRAS'],
        now: new Date('2026-10-05T10:01:00.000Z'),
        audit: { actorId: 'buyer-1', correlationId: 'correlation-2' },
      }),
    ).resolves.toEqual({ kind: 'version_conflict', actualVersion: 2 });
  });
});
