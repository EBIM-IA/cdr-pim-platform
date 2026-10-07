import { assertUuid, newUuid } from '@cdr/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedDemoCatalog } from '../../src/database/demo-seed';
import {
  attributeDefinitions,
  attributeTemplates,
  equivalenceGroupMembers,
  equivalenceGroups,
  groupApplications,
  productAttributeValues,
  productAssets,
  products,
  templateAttributeAssignments,
  templateAttributeRoleAccess,
} from '../../src/database/schema';
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
    expect(categories).toHaveLength(32);

    const brakePads = categories.find((category) => category.slug === 'pastillas-de-freno');
    const purchasing = await repository.getActiveSchema(brakePads!.id, ['COMPRAS']);
    const sales = await repository.getActiveSchema(brakePads!.id, ['VENTAS']);
    expect(purchasing?.attributes.length).toBeGreaterThan(6);
    expect(
      purchasing?.attributes.some(
        (attribute) => attribute.sourceAuthority === 'pim' && attribute.permissions.edit,
      ),
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
      filters: [{ key: 'codigo_proveedor', operator: 'contains', value: 'D1672-CARBON' }],
    });
    expect(result).toMatchObject({ total: 1, items: [{ sku: 'D1672' }] });
    expect(result.items[0]?.attributes.codigo_proveedor?.value).toContain('CARBON');
  });

  it('builds a role-filtered workbook union with applicability and attribute-value search', async () => {
    const [product] = await database.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.sku, 'D1672'));
    const [assignment] = await database.db
      .select({ templateId: productTemplateAssignments.templateId })
      .from(productTemplateAssignments)
      .where(eq(productTemplateAssignments.productId, product!.id));
    const definitionId = newUuid();
    await database.db.insert(attributeDefinitions).values({
      id: definitionId,
      key: 'material_exclusivo_prueba',
      label: 'Material exclusivo',
      dataType: 'text',
      sourceAuthority: 'pim',
    });
    await database.db.insert(templateAttributeAssignments).values({
      templateId: assignment!.templateId,
      attributeDefinitionId: definitionId,
      position: 99,
      searchable: true,
    });
    await database.db.insert(templateAttributeRoleAccess).values({
      templateId: assignment!.templateId,
      attributeDefinitionId: definitionId,
      role: 'COMPRAS',
      canView: true,
      canEdit: true,
      canImport: true,
      canExport: true,
    });
    await database.db.insert(productAttributeValues).values({
      productId: product!.id,
      attributeDefinitionId: definitionId,
      valueText: 'Cerámica exclusiva CDR',
      source: 'manual',
      version: 1,
    });
    const missingRequiredId = newUuid();
    await database.db.insert(attributeDefinitions).values({
      id: missingRequiredId,
      key: 'requerido_faltante_prueba',
      label: 'Requerido faltante',
      dataType: 'text',
      sourceAuthority: 'pim',
    });
    await database.db.insert(templateAttributeAssignments).values({
      templateId: assignment!.templateId,
      attributeDefinitionId: missingRequiredId,
      position: 100,
      required: true,
    });
    const [membership] = await database.db
      .select({ groupId: equivalenceGroupMembers.groupId })
      .from(equivalenceGroupMembers)
      .where(eq(equivalenceGroupMembers.productId, product!.id));
    await database.db.insert(groupApplications).values({
      id: newUuid(),
      groupId: membership!.groupId,
      vehicleType: 'INDUSTRIAL',
      make: 'FAG',
      model: 'Banco de prueba',
      active: true,
    });

    const all = await repository.listWorkbook({
      roles: ['COMPRAS'],
      page: 1,
      pageSize: 100,
      filters: [],
    });
    const exclusive = all.columns.find((column) => column.key === 'material_exclusivo_prueba');
    expect(exclusive).toMatchObject({
      applicableTemplateIds: [assignment!.templateId],
      permissions: { edit: true, export: true },
    });
    expect(all.items.find((item) => item.id === product!.id)?.attributes).toMatchObject({
      material_exclusivo_prueba: {
        applicable: true,
        value: 'Cerámica exclusiva CDR',
        version: 1,
      },
    });
    const productRow = all.items.find((item) => item.id === product!.id);
    expect(productRow).toMatchObject({
      applicationTypes: ['AUTOMOTRIZ', 'INDUSTRIAL'],
    });
    expect(productRow!.completeness).toBeGreaterThan(0);
    expect(productRow!.completeness).toBeLessThan(100);
    expect(all.facets.applicationTypes).toContain('INDUSTRIAL');
    expect(all.facets.applicationTypes).toContain('AUTOMOTRIZ');
    expect(
      all.items.find((item) => item.id !== product!.id)?.attributes.material_exclusivo_prueba,
    ).toEqual({ applicable: false });

    await expect(
      repository.listWorkbook({
        roles: ['COMPRAS'],
        page: 1,
        pageSize: 25,
        q: 'cerámica exclusiva',
        filters: [],
      }),
    ).resolves.toMatchObject({ total: 1, items: [{ sku: 'D1672' }] });
    await expect(
      repository.listWorkbook({
        roles: ['COMPRAS'],
        page: 1,
        pageSize: 25,
        q: 'D1672',
        applicationType: 'INDUSTRIAL',
        filters: [],
      }),
    ).resolves.toMatchObject({ total: 1, items: [{ sku: 'D1672' }] });
    await expect(
      repository.listWorkbook({
        roles: ['COMPRAS'],
        page: 1,
        pageSize: 25,
        q: 'D1672',
        applicationType: 'AUTOMOTRIZ',
        filters: [],
        columnFilters: [{ key: 'base:application', values: ['value:AUTOMOTRIZ, INDUSTRIAL'] }],
        sort: { key: 'base:application', direction: 'asc' },
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [{ sku: 'D1672', applicationTypes: ['AUTOMOTRIZ', 'INDUSTRIAL'] }],
    });

    const completenessBeforeAsset = productRow!.completeness;
    await database.db.insert(productAssets).values({
      id: newUuid(),
      productId: product!.id,
      kind: 'document',
      typeCode: 'FT',
      originalFilename: 'D1672__FT.pdf',
      objectKey: `products/${product!.id}/documents/ft-test.pdf`,
      bucket: 'integration-assets',
      mimeType: 'application/pdf',
      sizeBytes: 256,
      checksumSha256: 'workbook-required-asset',
      source: 'manual',
      uploadedBy: 'buyer-1',
    });
    const afterAsset = await repository.listWorkbook({
      roles: ['COMPRAS'],
      page: 1,
      pageSize: 100,
      filters: [],
    });
    expect(afterAsset.items.find((item) => item.id === product!.id)!.completeness).toBeGreaterThan(
      completenessBeforeAsset,
    );
    expect(
      (
        await repository.listWorkbook({
          roles: ['VENTAS'],
          page: 1,
          pageSize: 25,
          filters: [],
        })
      ).columns.some((column) => column.key === 'material_exclusivo_prueba'),
    ).toBe(false);
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
      attributeKey: 'tipo_indicador_de_desgaste',
      value: 'Sensor',
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
          after: expect.objectContaining({ version: 2, value: 'Sensor' }),
        }),
        expect.objectContaining({
          productId: replicaId,
          after: expect.objectContaining({ version: 1, value: 'Sensor' }),
        }),
      ]),
    );
    const audit = await new PostgresAuditAdapter(database.db).listChanges({
      page: 1,
      pageSize: 25,
      sku: 'D1672',
      field: 'tipo_indicador_de_desgaste',
      source: 'manual',
    });
    expect(audit).toMatchObject({
      total: 1,
      items: [{ resourceType: 'product', resourceId: primaryId, after: 'Sensor' }],
    });

    await expect(
      repository.updateAttribute({
        productId: primaryId,
        attributeKey: 'tipo_indicador_de_desgaste',
        value: 'STALE',
        source: AttributeValueSource.Manual,
        expectedVersion: 1,
        roles: ['COMPRAS'],
        now: new Date('2026-10-05T10:01:00.000Z'),
        audit: { actorId: 'buyer-1', correlationId: 'correlation-2' },
      }),
    ).resolves.toEqual({ kind: 'version_conflict', actualVersion: 2 });
  });

  it('keeps a versioned tombstone so delete and recreate cannot produce an ABA conflict', async () => {
    const [template] = await database.db
      .select({ id: attributeTemplates.id })
      .from(attributeTemplates)
      .where(eq(attributeTemplates.status, 'active'))
      .limit(1);
    const definition = { id: newUuid(), key: 'descripcion_tecnica_prueba' };
    await database.db.insert(attributeDefinitions).values({
      id: definition.id,
      key: definition.key,
      label: 'Descripción técnica de prueba',
      dataType: 'text',
      sourceAuthority: 'pim',
    });
    await database.db.insert(templateAttributeAssignments).values({
      templateId: template!.id,
      attributeDefinitionId: definition.id,
      position: 999,
      active: true,
      required: false,
      replicable: false,
    });
    await database.db.insert(templateAttributeRoleAccess).values({
      templateId: template!.id,
      attributeDefinitionId: definition.id,
      role: 'COMPRAS',
      canView: true,
      canEdit: true,
      canImport: true,
      canExport: true,
    });
    const productId = newUuid();
    await database.db.insert(products).values({
      id: productId,
      sku: 'ABA-TOMBSTONE',
      name: 'Producto para concurrencia ABA',
      status: 'draft',
    });
    await database.db.insert(productTemplateAssignments).values({
      productId,
      templateId: template!.id,
    });
    await database.db.insert(productAttributeValues).values({
      productId,
      attributeDefinitionId: definition.id,
      valueText: 'Valor inicial',
      source: 'manual',
      version: 1,
    });

    const deletedAt = new Date('2026-10-05T11:00:00.000Z');
    const deleted = await repository.updateAttribute({
      productId,
      attributeKey: definition.key,
      value: null,
      source: AttributeValueSource.Manual,
      expectedVersion: 1,
      roles: ['COMPRAS'],
      now: deletedAt,
      audit: { actorId: 'buyer-1', correlationId: 'aba-delete' },
    });
    expect(deleted).toMatchObject({
      kind: 'updated',
      changes: [{ productId, after: { value: null, version: 2 } }],
    });

    const [tombstone] = await database.db
      .select()
      .from(productAttributeValues)
      .where(
        and(
          eq(productAttributeValues.productId, productId),
          eq(productAttributeValues.attributeDefinitionId, definition.id),
        ),
      );
    expect(tombstone).toMatchObject({
      version: 2,
      valueText: null,
      valueNumber: null,
      valueBoolean: null,
      valueDate: null,
      valueJson: null,
      deletedAt,
    });
    expect(
      (await repository.getProductSheet(productId, ['COMPRAS']))?.product.attributes,
    ).toMatchObject({ descripcion_tecnica_prueba: { value: null, version: 2 } });

    await expect(
      repository.updateAttribute({
        productId,
        attributeKey: definition.key,
        value: 'Edición obsoleta',
        source: AttributeValueSource.Manual,
        expectedVersion: 1,
        roles: ['COMPRAS'],
        now: new Date('2026-10-05T11:01:00.000Z'),
        audit: { actorId: 'buyer-1', correlationId: 'aba-stale-recreate' },
      }),
    ).resolves.toEqual({ kind: 'version_conflict', actualVersion: 2 });

    await expect(
      repository.updateAttribute({
        productId,
        attributeKey: definition.key,
        value: 'Valor recreado',
        source: AttributeValueSource.Manual,
        expectedVersion: 2,
        roles: ['COMPRAS'],
        now: new Date('2026-10-05T11:02:00.000Z'),
        audit: { actorId: 'buyer-1', correlationId: 'aba-current-recreate' },
      }),
    ).resolves.toMatchObject({
      kind: 'updated',
      changes: [{ productId, after: { value: 'Valor recreado', version: 3 } }],
    });
  });

  it('replicates only to active, replicable, role-editable destinations and reopens required targets', async () => {
    const templates = await database.db
      .select({ id: attributeTemplates.id })
      .from(attributeTemplates)
      .where(eq(attributeTemplates.status, 'active'))
      .limit(5);
    const [
      sourceTemplate,
      inactiveTemplate,
      nonReplicableTemplate,
      readOnlyTemplate,
      requiredTemplate,
    ] = templates;
    const definition = { id: newUuid(), key: 'descripcion_replicable_prueba' };
    await database.db.insert(attributeDefinitions).values({
      id: definition.id,
      key: definition.key,
      label: 'Descripción replicable de prueba',
      dataType: 'text',
      sourceAuthority: 'pim',
    });
    const policyTemplates = [
      sourceTemplate!,
      inactiveTemplate!,
      nonReplicableTemplate!,
      readOnlyTemplate!,
      requiredTemplate!,
    ];
    await database.db.insert(templateAttributeAssignments).values(
      policyTemplates.map((template) => ({
        templateId: template.id,
        attributeDefinitionId: definition.id,
        position: 999,
        active: true,
        required: false,
        replicable: true,
      })),
    );
    await database.db.insert(templateAttributeRoleAccess).values(
      policyTemplates.map((template) => ({
        templateId: template.id,
        attributeDefinitionId: definition.id,
        role: 'COMPRAS',
        canView: true,
        canEdit: true,
        canImport: true,
        canExport: true,
      })),
    );
    const productIds = {
      source: newUuid(),
      eligible: newUuid(),
      inactive: newUuid(),
      nonReplicable: newUuid(),
      readOnly: newUuid(),
      required: newUuid(),
    };
    await database.db.insert(products).values(
      Object.entries(productIds).map(([kind, id]) => ({
        id,
        sku: `REPLICATION-${kind.toUpperCase()}`,
        name: `Destino de replicación ${kind}`,
        status: kind === 'required' ? 'published' : 'draft',
      })),
    );
    await database.db.insert(productTemplateAssignments).values([
      { productId: productIds.source, templateId: sourceTemplate!.id },
      { productId: productIds.eligible, templateId: sourceTemplate!.id },
      { productId: productIds.inactive, templateId: inactiveTemplate!.id },
      { productId: productIds.nonReplicable, templateId: nonReplicableTemplate!.id },
      { productId: productIds.readOnly, templateId: readOnlyTemplate!.id },
      { productId: productIds.required, templateId: requiredTemplate!.id },
    ]);
    const groupId = newUuid();
    await database.db.insert(equivalenceGroups).values({
      id: groupId,
      code: 'REPLICATION-POLICY',
      name: 'Política de destinos de replicación',
    });
    await database.db.insert(equivalenceGroupMembers).values(
      Object.entries(productIds).map(([kind, productId]) => ({
        groupId,
        productId,
        role: kind === 'source' ? 'primary' : 'member',
      })),
    );
    await database.db.insert(productAttributeValues).values(
      Object.entries(productIds).map(([kind, productId]) => ({
        productId,
        attributeDefinitionId: definition.id,
        valueText: `Valor ${kind}`,
        source: 'manual',
        version: 1,
      })),
    );
    await database.db
      .update(templateAttributeAssignments)
      .set({ active: false })
      .where(
        and(
          eq(templateAttributeAssignments.templateId, inactiveTemplate!.id),
          eq(templateAttributeAssignments.attributeDefinitionId, definition.id),
        ),
      );
    await database.db
      .update(templateAttributeAssignments)
      .set({ replicable: false })
      .where(
        and(
          eq(templateAttributeAssignments.templateId, nonReplicableTemplate!.id),
          eq(templateAttributeAssignments.attributeDefinitionId, definition.id),
        ),
      );
    await database.db
      .update(templateAttributeRoleAccess)
      .set({ canEdit: false })
      .where(
        and(
          eq(templateAttributeRoleAccess.templateId, readOnlyTemplate!.id),
          eq(templateAttributeRoleAccess.attributeDefinitionId, definition.id),
          eq(templateAttributeRoleAccess.role, 'COMPRAS'),
        ),
      );
    await database.db
      .update(templateAttributeAssignments)
      .set({ required: true })
      .where(
        and(
          eq(templateAttributeAssignments.templateId, requiredTemplate!.id),
          eq(templateAttributeAssignments.attributeDefinitionId, definition.id),
        ),
      );

    const result = await repository.updateAttribute({
      productId: productIds.source,
      attributeKey: definition.key,
      value: null,
      source: AttributeValueSource.Manual,
      expectedVersion: 1,
      roles: ['COMPRAS'],
      now: new Date('2026-10-05T12:00:00.000Z'),
      audit: { actorId: 'buyer-1', correlationId: 'destination-policy' },
    });
    expect(result.kind).toBe('updated');
    if (result.kind !== 'updated') throw new Error('Expected an updated result');
    expect(result.changes.map((change) => change.productId)).toEqual(
      expect.arrayContaining([productIds.source, productIds.eligible, productIds.required]),
    );
    expect(result.changes).toHaveLength(3);

    const values = await database.db
      .select({
        productId: productAttributeValues.productId,
        valueText: productAttributeValues.valueText,
        version: productAttributeValues.version,
        deletedAt: productAttributeValues.deletedAt,
      })
      .from(productAttributeValues)
      .where(
        and(
          inArray(productAttributeValues.productId, Object.values(productIds)),
          eq(productAttributeValues.attributeDefinitionId, definition.id),
        ),
      );
    const byProduct = new Map(values.map((value) => [value.productId, value]));
    for (const productId of [productIds.source, productIds.eligible, productIds.required]) {
      expect(byProduct.get(productId)).toMatchObject({
        valueText: null,
        version: 2,
        deletedAt: expect.any(Date),
      });
    }
    for (const productId of [productIds.inactive, productIds.nonReplicable, productIds.readOnly]) {
      expect(byProduct.get(productId)).toMatchObject({
        version: 1,
        deletedAt: null,
      });
    }
    const [requiredProduct] = await database.db
      .select({ status: products.status })
      .from(products)
      .where(eq(products.id, productIds.required));
    expect(requiredProduct?.status).toBe('in_review');
  });
});
