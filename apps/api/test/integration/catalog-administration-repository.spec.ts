import { assertUuid, newUuid, ValidationError } from '@cdr/shared';
import { adminCatalogCategorySchema, adminTemplateSchema } from '@cdr/contracts';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedDemoCatalog } from '../../src/database/demo-seed';
import { CLIENT_TEMPLATE_MANIFEST } from '../../src/database/client-template-manifest';
import {
  auditEntries,
  productAttributeValues,
  templateAssetRequirements,
} from '../../src/database/schema';
import { DrizzleCatalogAdministrationRepository } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-catalog-administration.repository';
import { DrizzleDynamicCatalogRepository } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-dynamic-catalog.repository';
import {
  toAdminCategoryDto,
  toAdminTemplateDto,
} from '../../src/modules/catalog-schema/presentation/catalog-administration.presenter';
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
  afterAll(() => database?.close());

  it('returns persisted SKU totals per category, including descendants and empty branches', async () => {
    const categories = await repository.listCategories(true);
    expect(
      categories
        .filter((category) => !category.parentId)
        .reduce((total, category) => total + (category.skuCount ?? 0), 0),
    ).toBe(CLIENT_TEMPLATE_MANIFEST.source.productCount);
    expect(categories.some((category) => category.skuCount === 0)).toBe(true);
    const leaf = categories.find(
      (category) =>
        category.skuCount && !categories.some((child) => child.parentId === category.id),
    )!;
    expect(leaf).toBeTruthy();
    expect(adminCatalogCategorySchema.parse(toAdminCategoryDto(leaf)).skuCount).toBe(leaf.skuCount);
    const parent = categories.find((category) => category.id === leaf.parentId);
    if (parent) expect(parent.skuCount).toBeGreaterThanOrEqual(leaf.skuCount!);
  });

  it('exposes required and optional active asset policies on one admin template without inactive or other-template policies', async () => {
    const [selected, other] = await repository.listTemplates();
    expect(selected).toBeTruthy();
    expect(other).toBeTruthy();
    await database.db
      .delete(templateAssetRequirements)
      .where(eq(templateAssetRequirements.templateId, selected!.id));
    await database.db.insert(templateAssetRequirements).values([
      { templateId: selected!.id, typeCode: 'FT', required: true, active: true },
      { templateId: selected!.id, typeCode: 'PLANO', required: false, active: true },
      { templateId: selected!.id, typeCode: 'CERT', required: true, active: false },
    ]);
    await database.db
      .insert(templateAssetRequirements)
      .values({ templateId: other!.id, typeCode: 'CERT', required: true, active: true })
      .onConflictDoUpdate({
        target: [templateAssetRequirements.templateId, templateAssetRequirements.typeCode],
        set: { required: true, active: true },
      });
    const detail = await repository.getTemplate(selected!.id);
    expect(detail?.assetRequirements).toEqual([
      { type: 'FT', required: true },
      { type: 'PLANO', required: false },
    ]);
    const dto = adminTemplateSchema.parse(toAdminTemplateDto(detail!));
    expect(dto.assetRequirements).toEqual(detail!.assetRequirements);
    expect(await repository.getTemplate(newUuid())).toBeNull();
    await database.db
      .update(templateAssetRequirements)
      .set({ active: false })
      .where(eq(templateAssetRequirements.templateId, selected!.id));
    expect((await repository.getTemplate(selected!.id))?.assetRequirements).toEqual([]);
  });

  it('keeps the SKU identity in publication while allowing other ERP fields to be deselected', async () => {
    const templates = await repository.listTemplates();
    const template = await repository.getTemplate(templates[0]!.id);
    const identity = template!.attributes!.find(
      (attribute) => attribute.key === 'codigo_articulo',
    )!;
    expect(identity).toBeTruthy();
    await expect(
      repository.updateTemplateAttribute({
        templateId: template!.id,
        attributeDefinitionId: identity.id,
        publishable: false,
        expectedUpdatedAt: identity.updatedAt,
        audit: {
          actorId: 'admin-publication',
          correlationId: newUuid(),
          occurredAt: new Date(identity.updatedAt.getTime() + 1000),
        },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    const provider = template!.attributes!.find(
      (attribute) => attribute.key === 'codigo_proveedor',
    )!;
    await expect(
      repository.updateTemplateAttribute({
        templateId: template!.id,
        attributeDefinitionId: provider.id,
        publishable: false,
        expectedUpdatedAt: provider.updatedAt,
        audit: {
          actorId: 'admin-publication',
          correlationId: newUuid(),
          occurredAt: new Date(provider.updatedAt.getTime() + 1000),
        },
      }),
    ).resolves.toMatchObject({ kind: 'updated', after: { publishable: false } });
  });

  it('persists publication selection independently of PDF policy with audit and stale-write protection', async () => {
    const { template, attribute } = await findAdminAttribute(repository, true);
    expect(attribute.publishable).toBe(true);
    const correlationId = newUuid();
    const result = await repository.updateTemplateAttribute({
      templateId: template.id,
      attributeDefinitionId: attribute.id,
      publishable: false,
      expectedUpdatedAt: attribute.updatedAt,
      audit: {
        actorId: 'admin-publication',
        correlationId,
        occurredAt: new Date(attribute.updatedAt.getTime() + 1000),
      },
    });
    expect(result).toMatchObject({
      kind: 'updated',
      after: { publishable: false, includeInTechnicalSheet: attribute.includeInTechnicalSheet },
    });
    expect(
      (await repository.getTemplate(template.id))?.attributes?.find(
        (item) => item.id === attribute.id,
      )?.publishable,
    ).toBe(false);
    const [audit] = await database.db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.correlationId, correlationId));
    expect(audit?.changes.configuration).toMatchObject({
      before: { publishable: true },
      after: { publishable: false },
    });
    const stale = await repository.updateTemplateAttribute({
      templateId: template.id,
      attributeDefinitionId: attribute.id,
      publishable: true,
      expectedUpdatedAt: attribute.updatedAt,
      audit: {
        actorId: 'admin-publication',
        correlationId: newUuid(),
        occurredAt: new Date(attribute.updatedAt.getTime() + 2000),
      },
    });
    expect(stale.kind).toBe('version_conflict');
    expect(
      (await repository.getTemplate(template.id))?.attributes?.find(
        (item) => item.id === attribute.id,
      )?.publishable,
    ).toBe(false);
  });

  it('lists all template versions and preserves inactive assignments in administration', async () => {
    const templates = await repository.listTemplates();
    const templateCountRows = await database.sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM attribute_templates
    `;
    const persistedTemplateCount = templateCountRows[0]!.count;
    const [selectedAssignment] = await database.sql<
      { templateId: string; attributeDefinitionId: string; assignmentCount: number }[]
    >`
      SELECT
        taa.template_id AS "templateId",
        taa.attribute_definition_id AS "attributeDefinitionId",
        (
          SELECT COUNT(*)::int
          FROM template_attribute_assignments all_taa
          WHERE all_taa.template_id = taa.template_id
        ) AS "assignmentCount"
      FROM template_attribute_assignments taa
      ORDER BY taa.template_id, taa.position, taa.attribute_definition_id
      LIMIT 1
    `;
    expect(selectedAssignment).toBeTruthy();
    await database.sql`
      UPDATE template_attribute_assignments
      SET active = false
      WHERE template_id = ${selectedAssignment!.templateId}
        AND attribute_definition_id = ${selectedAssignment!.attributeDefinitionId}
    `;

    expect(templates).toHaveLength(persistedTemplateCount);
    const detail = await repository.getTemplate(assertUuid(selectedAssignment!.templateId));
    expect(detail?.attributes).toHaveLength(selectedAssignment!.assignmentCount);
    expect(detail?.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: selectedAssignment!.attributeDefinitionId, active: false }),
      ]),
    );
    expect(detail?.attributes?.every((attribute) => attribute.roleAccess.length === 3)).toBe(true);
  });

  it('deactivates and configures an assignment without deleting it and audits atomically', async () => {
    const { template, attribute } = await findAdminAttribute(repository);
    const correlationId = newUuid();
    const firstMutationAt = new Date(attribute.updatedAt.getTime() + 1_000);
    const result = await repository.updateTemplateAttribute({
      templateId: template.id,
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
        occurredAt: firstMutationAt,
      },
    });
    expect(result.kind).toBe('updated');
    if (result.kind !== 'updated') throw new Error('Expected an updated result');
    expect(result.after).toMatchObject({ active: false, includeInTechnicalSheet: true });
    expect(await repository.getTemplate(template.id)).toMatchObject({
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
      templateId: template.id,
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
        occurredAt: new Date(firstMutationAt.getTime() + 1_000),
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
        templateId: template.id,
        attributeDefinitionId: attribute.id,
        active: true,
        expectedUpdatedAt: attribute.updatedAt,
        audit: {
          actorId: 'admin-1',
          correlationId: 'stale-assignment',
          occurredAt: new Date(firstMutationAt.getTime() + 2_000),
        },
      }),
    ).resolves.toMatchObject({ kind: 'version_conflict' });
  });

  it('rolls back a product value when the audit insert fails', async () => {
    const [fixture] = await database.sql<{ productId: string; attributeKey: string }[]>`
      SELECT p.id AS "productId", ad.key AS "attributeKey"
      FROM products p
      JOIN product_template_assignments pta ON pta.product_id = p.id
      JOIN template_attribute_assignments taa
        ON taa.template_id = pta.template_id AND taa.active = true
      JOIN attribute_definitions ad
        ON ad.id = taa.attribute_definition_id
        AND ad.active = true
        AND ad.source_authority = 'pim'
        AND ad.data_type = 'text'
      JOIN template_attribute_role_access access
        ON access.template_id = taa.template_id
        AND access.attribute_definition_id = taa.attribute_definition_id
        AND access.role = 'COMPRAS'
        AND access.can_view = true
        AND access.can_edit = true
      JOIN product_attribute_values pav
        ON pav.product_id = p.id
        AND pav.attribute_definition_id = ad.id
        AND pav.deleted_at IS NULL
      ORDER BY p.sku, taa.position, ad.key
      LIMIT 1
    `;
    expect(fixture).toBeTruthy();
    const productId = assertUuid(fixture!.productId, 'productId');
    const catalog = new DrizzleDynamicCatalogRepository(database.db);
    const assignment = await catalog.findProductAttributeAssignment(
      productId,
      fixture!.attributeKey,
      ['COMPRAS'],
    );
    expect(assignment).toBeTruthy();
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
          attributeKey: fixture!.attributeKey,
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

async function findAdminAttribute(
  repository: DrizzleCatalogAdministrationRepository,
  excludeIdentity = false,
) {
  for (const template of await repository.listTemplates()) {
    const detail = await repository.getTemplate(template.id);
    const attribute = detail?.attributes?.find(
      (candidate) =>
        candidate.active &&
        (!excludeIdentity ||
          !['codigoarticulo', 'sku'].includes(candidate.key.replace(/_/gu, '').toLowerCase())),
    );
    if (attribute) return { template, attribute };
  }
  throw new Error('Expected at least one active template attribute assignment');
}
