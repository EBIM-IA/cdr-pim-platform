import { assertUuid, newUuid } from '@cdr/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedDemoCatalog } from '../../src/database/demo-seed';
import { auditEntries, productAttributeValues, products } from '../../src/database/schema';
import { DrizzleCatalogAdministrationRepository } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-catalog-administration.repository';
import { DrizzleDynamicCatalogRepository } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-dynamic-catalog.repository';
import { type TestDatabase, createTestDatabase } from './database.helper';

describe('DrizzleCatalogAdministrationRepository', () => {
  let database: TestDatabase;
  let repository: DrizzleCatalogAdministrationRepository;

  beforeAll(async () => {
    database = await createTestDatabase();
    repository = new DrizzleCatalogAdministrationRepository(database.db);
  });
  beforeEach(async () => {
    await database.truncateAll();
    await seedDemoCatalog(database.db);
  });
  afterAll(() => database.close());

  it('lists all template versions and preserves inactive assignments in administration', async () => {
    const [template] = await repository.listTemplates();
    const detail = await repository.getTemplate(template!.id);
    expect(detail?.attributes).toHaveLength(6);
    expect(detail?.attributes?.every((attribute) => attribute.roleAccess.length === 3)).toBe(true);
  });

  it('deactivates and configures an assignment without deleting it and audits atomically', async () => {
    const [template] = await repository.listTemplates();
    const detail = await repository.getTemplate(template!.id);
    const attribute = detail!.attributes!.find((item) => item.key === 'descripcion_tecnica')!;
    const correlationId = newUuid();
    const result = await repository.updateTemplateAttribute({
      templateId: template!.id,
      attributeDefinitionId: attribute.id,
      active: false,
      includeInTechnicalSheet: true,
      roleAccess: [
        {
          role: 'VENTAS',
          canView: true,
          canEdit: false,
          canImport: false,
          canExport: false,
        },
      ],
      expectedUpdatedAt: attribute.updatedAt,
      audit: {
        actorId: 'admin-1',
        correlationId,
        occurredAt: new Date('2026-10-05T12:00:00.000Z'),
      },
    });
    expect(result.kind).toBe('updated');
    if (result.kind !== 'updated') throw new Error('Expected an updated result');
    expect(result.after).toMatchObject({ active: false, includeInTechnicalSheet: true });
    expect(await repository.getTemplate(template!.id)).toMatchObject({
      attributes: expect.arrayContaining([
        expect.objectContaining({ id: attribute.id, active: false }),
      ]),
    });
    const audit = await database.db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.correlationId, correlationId));
    expect(audit).toHaveLength(1);

    const permissionsOnly = await repository.updateTemplateAttribute({
      templateId: template!.id,
      attributeDefinitionId: attribute.id,
      roleAccess: [
        {
          role: 'VENTAS',
          canView: true,
          canEdit: false,
          canImport: false,
          canExport: true,
        },
      ],
      expectedUpdatedAt: result.after.updatedAt,
      audit: {
        actorId: 'admin-1',
        correlationId: newUuid(),
        occurredAt: new Date('2026-10-05T12:00:30.000Z'),
      },
    });
    expect(permissionsOnly).toMatchObject({
      kind: 'updated',
      after: {
        roleAccess: expect.arrayContaining([
          expect.objectContaining({ role: 'VENTAS', canExport: true }),
        ]),
      },
    });
    if (permissionsOnly.kind !== 'updated') throw new Error('Expected permissions update');
    expect(permissionsOnly.after.updatedAt.getTime()).toBeGreaterThan(
      result.after.updatedAt.getTime(),
    );

    await expect(
      repository.updateTemplateAttribute({
        templateId: template!.id,
        attributeDefinitionId: attribute.id,
        active: true,
        expectedUpdatedAt: attribute.updatedAt,
        audit: {
          actorId: 'admin-1',
          correlationId: 'stale-assignment',
          occurredAt: new Date('2026-10-05T12:01:00.000Z'),
        },
      }),
    ).resolves.toMatchObject({ kind: 'version_conflict' });
  });

  it('rolls back a product value when the audit insert fails', async () => {
    const [product] = await database.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.sku, '6202-2RSR-L038-C3'));
    const productId = assertUuid(product!.id, 'productId');
    const catalog = new DrizzleDynamicCatalogRepository(database.db);
    const assignment = await catalog.findProductAttributeAssignment(
      productId,
      'descripcion_tecnica',
      ['COMPRAS'],
    );
    const before = await database.db
      .select()
      .from(productAttributeValues)
      .where(
        and(
          eq(productAttributeValues.productId, productId),
          eq(productAttributeValues.attributeDefinitionId, assignment!.definition.id),
        ),
      );

    await database.sql
      .unsafe(
        `
      CREATE OR REPLACE FUNCTION fail_catalog_audit_for_test()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.correlation_id = 'force-audit-failure' THEN
          RAISE EXCEPTION 'forced audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER audit_entries_fail_catalog_test
        BEFORE INSERT ON audit_entries
        FOR EACH ROW EXECUTE FUNCTION fail_catalog_audit_for_test();
    `,
      )
      .simple();
    try {
      await expect(
        catalog.updateAttribute({
          productId,
          attributeKey: 'descripcion_tecnica',
          value: 'Cambio que debe revertirse',
          source: 'manual',
          expectedVersion: before[0]!.version,
          roles: ['COMPRAS'],
          now: new Date('2026-10-05T13:00:00.000Z'),
          audit: { actorId: 'buyer-1', correlationId: 'force-audit-failure' },
        }),
      ).rejects.toThrow();
    } finally {
      await database.sql
        .unsafe(
          `
        DROP TRIGGER IF EXISTS audit_entries_fail_catalog_test ON audit_entries;
        DROP FUNCTION IF EXISTS fail_catalog_audit_for_test();
      `,
        )
        .simple();
    }
    const after = await database.db
      .select()
      .from(productAttributeValues)
      .where(
        and(
          eq(productAttributeValues.productId, productId),
          eq(productAttributeValues.attributeDefinitionId, assignment!.definition.id),
        ),
      );
    expect(after).toEqual(before);
  });
});
