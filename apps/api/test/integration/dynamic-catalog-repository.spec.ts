import { assertUuid, newUuid } from '@cdr/shared';
import { catalogWorkbookResultSchema } from '@cdr/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedDemoCatalog } from '../../src/database/demo-seed';
import {
  attributeDefinitions,
  attributeTemplates,
  catalogCategories,
  equivalenceGroupMembers,
  equivalenceGroups,
  groupApplications,
  productAttributeValues,
  productAssets,
  products,
  templateAttributeAssignments,
  templateAttributeRoleAccess,
  templateAssetRequirements,
} from '../../src/database/schema';
import { PostgresAuditAdapter } from '../../src/modules/audit/infrastructure/persistence/postgres-audit.adapter';
import { AttributeValueSource } from '../../src/modules/catalog-schema/domain/entities/catalog-schema';
import { DrizzleDynamicCatalogRepository } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-dynamic-catalog.repository';
import { productTemplateAssignments } from '../../src/modules/catalog-schema/infrastructure/persistence/catalog-schema.tables';
import { toWorkbookResultDto } from '../../src/modules/catalog-schema/presentation/dynamic-catalog.presenter';
import { type TestDatabase, createTestDatabase } from './database.helper';

const BRAKE_PAD_CATEGORY_SLUG =
  'sistema-de-frenado-y-sus-partes-pastilla-de-freno-pastilla-de-freno';

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
    expect(categories).toHaveLength(52);

    const brakePads = categories.find((category) => category.slug === BRAKE_PAD_CATEGORY_SLUG);
    const purchasing = await repository.getActiveSchema(
      brakePads!.id,
      { templateId: brakePads!.templateId },
      ['COMPRAS'],
    );
    const sales = await repository.getActiveSchema(
      brakePads!.id,
      { variantKey: brakePads!.templateVariantKey },
      ['VENTAS'],
    );
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
    const additiveVariants = categories.filter(
      (category) => category.slug === 'mantenimiento-vehiculo-aditivo-aditivo',
    );
    expect(additiveVariants.map((category) => category.templateVariantKey)).toEqual([
      '42.1',
      '42.2',
      '42.3',
      '42.4',
      '42.5',
      '42.6',
    ]);
    expect(new Set(additiveVariants.map((category) => category.id)).size).toBe(1);
    const selectedVariant = additiveVariants.find(
      (category) => category.templateVariantKey === '42.6',
    );
    await expect(
      repository.getActiveSchema(
        selectedVariant!.id,
        { variantKey: selectedVariant!.templateVariantKey },
        ['COMPRAS'],
      ),
    ).resolves.toMatchObject({
      template: { id: selectedVariant!.templateId, variantKey: '42.6' },
    });
    expect(await repository.listActiveCategories(['UNKNOWN'])).toEqual([]);
  });

  it('lists products using dynamic searchable-attribute filters', async () => {
    const category = (await repository.listActiveCategories(['COMPRAS'])).find(
      (item) => item.slug === BRAKE_PAD_CATEGORY_SLUG,
    );
    const result = await repository.listGrid({
      categoryId: category!.id,
      selector: { templateId: category!.templateId },
      roles: ['COMPRAS'],
      page: 1,
      pageSize: 25,
      filters: [{ key: 'codigo_proveedor', operator: 'contains', value: 'D1672-CARBON' }],
    });
    expect(result).toMatchObject({ total: 1, items: [{ sku: 'D1672' }] });
    expect(result.items[0]?.attributes.codigo_proveedor?.value).toContain('CARBON');
  });

  it('returns only the assigned active document policies in the workbook and no policies for unclassified or retired-template SKU', async () => {
    const [fixture] = await database.db
      .select({ id: products.id, templateId: productTemplateAssignments.templateId })
      .from(products)
      .innerJoin(productTemplateAssignments, eq(productTemplateAssignments.productId, products.id))
      .where(eq(products.sku, 'D1672'));
    expect(fixture).toBeTruthy();
    await database.db
      .delete(templateAssetRequirements)
      .where(eq(templateAssetRequirements.templateId, fixture!.templateId));
    await database.db.insert(templateAssetRequirements).values([
      { templateId: fixture!.templateId, typeCode: 'FT', required: true, active: true },
      { templateId: fixture!.templateId, typeCode: 'FOTO', required: false, active: true },
      { templateId: fixture!.templateId, typeCode: 'CERT', required: true, active: false },
    ]);
    const options = { roles: ['COMPRAS'], page: 1, pageSize: 1, filters: [] };
    const result = await repository.listWorkbook({ ...options, q: 'D1672' });
    expect(result.items[0]?.assetRequirements).toEqual([
      { type: 'FOTO', required: false },
      { type: 'FT', required: true },
    ]);
    const dto = catalogWorkbookResultSchema.parse(toWorkbookResultDto(result, 1, 1));
    expect(dto.items[0]?.assetRequirements).toEqual(result.items[0]!.assetRequirements);
    const actualAssets = await database.db
      .select({ id: productAssets.id })
      .from(productAssets)
      .where(eq(productAssets.productId, fixture!.id));
    expect(actualAssets).toEqual([]);
    const pendingId = newUuid();
    await database.db.insert(products).values({
      id: pendingId,
      sku: 'NO-TEMPLATE-ASSET-POLICY',
      name: 'Unclassified asset-policy fixture',
      status: 'in_review',
    });
    const pending = await repository.listWorkbook({ ...options, q: 'NO-TEMPLATE-ASSET-POLICY' });
    expect(pending.items[0]).toMatchObject({
      id: pendingId,
      template: null,
      completeness: null,
      assetRequirements: [],
    });
    expect(Object.values(pending.items[0]!.attributes).every((cell) => !cell.applicable)).toBe(
      true,
    );
    await database.db
      .update(attributeTemplates)
      .set({ status: 'retired' })
      .where(eq(attributeTemplates.id, fixture!.templateId));
    const retired = await repository.listWorkbook({ ...options, q: 'D1672' });
    expect(retired.items[0]).toMatchObject({
      id: fixture!.id,
      template: null,
      completeness: null,
      assetRequirements: [],
    });
  });

  it('filters a parent category across its real descendants and all template variants', async () => {
    const [root] = await database.db
      .select()
      .from(catalogCategories)
      .where(eq(catalogCategories.slug, 'filtros'));
    expect(root?.active).toBe(true);
    const categories = await repository.listActiveCategories(['COMPRAS']);
    const filterTemplates = categories.filter((category) => category.slug.startsWith('filtros-'));
    expect(filterTemplates.length).toBeGreaterThan(3);
    expect(filterTemplates.every((category) => category.ancestors?.[0]?.id === root!.id)).toBe(
      true,
    );
    const expected = await database.db
      .select({ id: products.id, sku: products.sku, brand: products.brand })
      .from(products)
      .innerJoin(productTemplateAssignments, eq(productTemplateAssignments.productId, products.id))
      .where(
        inArray(
          productTemplateAssignments.templateId,
          filterTemplates.map((item) => item.templateId),
        ),
      )
      .orderBy(products.sku);
    const scope = {
      categoryId: root!.id as ReturnType<typeof assertUuid>,
      roles: ['COMPRAS'],
      filters: [],
    };
    const all = await repository.listWorkbook({ ...scope, page: 1, pageSize: 100 });
    const first = await repository.listWorkbook({ ...scope, page: 1, pageSize: 2 });
    const second = await repository.listWorkbook({ ...scope, page: 2, pageSize: 2 });

    expect(all.total).toBe(expected.length);
    expect(all.items.map((item) => item.id)).toEqual(expected.map((item) => item.id));
    expect(new Set(all.items.map((item) => item.id)).size).toBe(all.total);
    expect(first.total).toBe(all.total);
    expect(second.total).toBe(all.total);
    expect([...first.items, ...second.items].map((item) => item.id)).toEqual(
      expected.slice(0, 4).map((item) => item.id),
    );
    expect(all.facets.brands).toEqual(
      [...new Set(expected.map((item) => item.brand).filter(Boolean))].sort((left, right) =>
        left!.localeCompare(right!, 'es'),
      ),
    );
    expect(all.columns.length).toBeGreaterThan(5);
    expect(all.items.some((item) => item.template?.variantKey === '22.1')).toBe(true);
    expect(all.items.some((item) => item.template?.variantKey === '22.2')).toBe(true);

    const intermediateId = filterTemplates
      .find((item) => item.templateVariantKey === '22.1')!
      .ancestors!.at(-1)!.id;
    const air = await repository.listWorkbook({
      ...scope,
      categoryId: intermediateId,
      page: 1,
      pageSize: 100,
    });
    expect(new Set(air.items.map((item) => item.template?.variantKey))).toEqual(
      new Set(['22.1', '22.2']),
    );
    expect(air.total).toBe(air.items.length);
    expect(
      await repository.listWorkbook({ ...scope, categoryId: newUuid(), page: 1, pageSize: 25 }),
    ).toMatchObject({ total: 0, columns: [], items: [] });
  });

  it('keeps unclassified and inactive-template SKU searchable and paginated without editable cells', async () => {
    const unclassifiedId = newUuid();
    await database.db.insert(products).values({
      id: unclassifiedId,
      sku: 'UNCLASSIFIED-QA',
      name: 'Pendiente de clasificación',
      brand: 'QA BRAND',
      status: 'in_review',
    });
    const [inactiveProduct] = await database.db
      .select({ id: products.id, templateId: productTemplateAssignments.templateId })
      .from(products)
      .innerJoin(productTemplateAssignments, eq(productTemplateAssignments.productId, products.id))
      .where(eq(products.sku, 'D1672'));
    await database.db
      .update(attributeTemplates)
      .set({ status: 'retired' })
      .where(eq(attributeTemplates.id, inactiveProduct!.templateId));
    const options = { roles: ['COMPRAS'], page: 1, pageSize: 100, filters: [] };
    const all = await repository.listWorkbook(options);
    expect(all.total).toBe(98);
    const pending = all.items.find((item) => item.id === unclassifiedId);
    expect(pending).toMatchObject({
      category: null,
      template: null,
      completeness: null,
      assetRequirements: [],
    });
    expect(Object.values(pending!.attributes).every((cell) => !cell.applicable)).toBe(true);
    const inactive = all.items.find((item) => item.id === inactiveProduct!.id);
    expect(inactive?.category).not.toBeNull();
    expect(inactive).toMatchObject({ template: null, completeness: null, assetRequirements: [] });
    expect(Object.values(inactive!.attributes).every((cell) => !cell.applicable)).toBe(true);
    expect(all.facets.brands).toContain('QA BRAND');
    const search = await repository.listWorkbook({ ...options, q: 'UNCLASSIFIED-QA', pageSize: 1 });
    expect(search).toMatchObject({ total: 1, items: [{ id: unclassifiedId }] });
    const emptySecondPage = await repository.listWorkbook({
      ...options,
      q: 'UNCLASSIFIED-QA',
      page: 2,
      pageSize: 1,
    });
    expect(emptySecondPage).toMatchObject({ total: 1, items: [] });
    const notApplicable = await repository.listWorkbook({
      ...options,
      q: 'UNCLASSIFIED-QA',
      columnFilters: [
        { key: 'attribute:codigo_proveedor', values: ['__cdr_excel_not_applicable__'] },
      ],
    });
    expect(notApplicable.total).toBe(1);

    await database.db
      .update(attributeTemplates)
      .set({ status: 'active' })
      .where(eq(attributeTemplates.id, inactiveProduct!.templateId));
    await database.db
      .update(catalogCategories)
      .set({ active: false })
      .where(eq(catalogCategories.id, inactive!.category!.id));
    const inactiveCategory = await repository.listWorkbook({ ...options, q: 'D1672' });
    const inactiveCategoryProduct = inactiveCategory.items.find(
      (item) => item.id === inactiveProduct!.id,
    );
    expect(inactiveCategoryProduct).toMatchObject({
      template: null,
      completeness: null,
      assetRequirements: [],
    });
    expect(
      Object.values(inactiveCategoryProduct!.attributes).every((cell) => !cell.applicable),
    ).toBe(true);

    await database.db.update(attributeTemplates).set({ status: 'retired' });
    expect(await repository.listWorkbook({ ...options, q: 'UNCLASSIFIED-QA' })).toMatchObject({
      total: 1,
      columns: [],
      items: [{ id: unclassifiedId, template: null, completeness: null, attributes: {} }],
    });
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
    await database.db.insert(templateAttributeRoleAccess).values({
      templateId: assignment!.templateId,
      attributeDefinitionId: missingRequiredId,
      role: 'COMPRAS',
      canView: true,
      canEdit: true,
      canImport: true,
      canExport: true,
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
    await database.db
      .update(templateAttributeAssignments)
      .set({ publishable: false })
      .where(
        and(
          eq(templateAttributeAssignments.templateId, assignment!.templateId),
          eq(templateAttributeAssignments.attributeDefinitionId, definitionId),
        ),
      );
    const publicationSchema = await repository.getActiveSchema(
      productRow!.category!.id,
      { templateId: assignment!.templateId as ReturnType<typeof assertUuid> },
      ['COMPRAS'],
    );
    expect(
      publicationSchema?.attributes.find(
        (attribute) => attribute.key === 'material_exclusivo_prueba',
      )?.publishable,
    ).toBe(false);
    const publicationSheet = await repository.getProductSheet(
      product!.id as ReturnType<typeof assertUuid>,
      ['COMPRAS'],
    );
    expect(
      publicationSheet?.schema.attributes.find(
        (attribute) => attribute.key === 'material_exclusivo_prueba',
      )?.publishable,
    ).toBe(false);
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
    await expect(
      repository.listWorkbook({
        roles: ['COMPRAS'],
        page: 1,
        pageSize: 1,
        filters: [],
        columnFilters: [{ key: 'base:sku', expression: '*1672' }],
      }),
    ).resolves.toMatchObject({ total: 1, items: [{ sku: 'D1672' }] });
    await expect(
      repository.listWorkbook({
        roles: ['COMPRAS'],
        page: 1,
        pageSize: 1,
        filters: [],
        columnFilters: [{ key: 'attribute:material_exclusivo_prueba', expression: '*ceramica*' }],
      }),
    ).resolves.toMatchObject({ total: 1, items: [{ sku: 'D1672' }] });
    await expect(
      repository.listWorkbook({
        roles: ['COMPRAS'],
        page: 1,
        pageSize: 1,
        filters: [],
        columnFilters: [{ key: 'base:unifier', expression: '*sin-coincidencias*' }],
      }),
    ).resolves.toMatchObject({ total: 0, items: [] });
    await expect(
      repository.listWorkbook({
        roles: ['COMPRAS'],
        page: 1,
        pageSize: 1,
        q: 'D1672',
        filters: [],
        columnFilters: [{ key: 'base:sku', expression: '*_*' }],
      }),
    ).resolves.toMatchObject({ total: 0, items: [] });
    await expect(
      repository.listWorkbook({
        roles: ['COMPRAS'],
        page: 1,
        pageSize: 1,
        q: 'D1672',
        filters: [],
        columnFilters: [{ key: 'attribute:requerido_faltante_prueba', expression: '""' }],
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [{ sku: 'D1672', attributes: { requerido_faltante_prueba: { applicable: true } } }],
    });
    const notApplicable = await repository.listWorkbook({
      roles: ['COMPRAS'],
      page: 1,
      pageSize: 1,
      filters: [],
      columnFilters: [{ key: 'attribute:requerido_faltante_prueba', expression: '*no aplica*' }],
    });
    expect(notApplicable.total).toBeGreaterThan(0);
    expect(notApplicable.items[0]?.attributes.requerido_faltante_prueba).toEqual({
      applicable: false,
    });

    const completenessBeforeAsset = productRow!.completeness;
    const sheetBeforeAsset = await repository.getProductSheet(
      product!.id as ReturnType<typeof assertUuid>,
      ['COMPRAS'],
    );
    expect(sheetBeforeAsset?.completeness).toBe(completenessBeforeAsset);
    expect(sheetBeforeAsset!.completeness).toBeLessThan(100);
    expect(sheetBeforeAsset?.assetRequirements).toContainEqual({ type: 'FT', required: true });
    await database.db
      .insert(templateAssetRequirements)
      .values({
        templateId: assignment!.templateId,
        typeCode: 'CERT',
        required: true,
        active: false,
      })
      .onConflictDoUpdate({
        target: [templateAssetRequirements.templateId, templateAssetRequirements.typeCode],
        set: { active: false, required: true },
      });
    const activePolicies = await repository.getProductSheet(
      product!.id as ReturnType<typeof assertUuid>,
      ['COMPRAS'],
    );
    expect(
      activePolicies?.assetRequirements?.some((requirement) => requirement.type === 'CERT'),
    ).toBe(false);
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
      completenessBeforeAsset!,
    );
    const sheetAfterAsset = await repository.getProductSheet(
      product!.id as ReturnType<typeof assertUuid>,
      ['COMPRAS'],
    );
    expect(sheetAfterAsset?.completeness).toBe(
      afterAsset.items.find((item) => item.id === product!.id)!.completeness,
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

  it('filters incomplete readiness across the whole catalog without changing existing bands', async () => {
    const all = await repository.listWorkbook({
      roles: ['COMPRAS'],
      page: 1,
      pageSize: 100,
      filters: [],
    });
    const fixture = all.items.find((item) => item.template);
    expect(fixture?.template).toBeTruthy();
    // Make one template have no required attributes or assets: its assigned products score 100.
    await database.db
      .update(templateAttributeAssignments)
      .set({ required: false })
      .where(eq(templateAttributeAssignments.templateId, fixture!.template!.id));
    await database.db
      .update(templateAssetRequirements)
      .set({ required: false })
      .where(eq(templateAssetRequirements.templateId, fixture!.template!.id));
    const base = await repository.listWorkbook({
      roles: ['COMPRAS'],
      page: 1,
      pageSize: 100,
      filters: [],
    });
    const incomplete = await repository.listWorkbook({
      roles: ['COMPRAS'],
      page: 1,
      pageSize: 1,
      filters: [],
      completeness: 'incomplete',
    });
    expect(base.items.find((item) => item.id === fixture!.id)?.completeness).toBe(100);
    expect(incomplete.total).toBe(
      base.items.filter((item) => item.completeness !== null && item.completeness < 100).length,
    );
    expect(
      incomplete.items.every((item) => item.completeness !== null && item.completeness < 100),
    ).toBe(true);
    const completeBand = await repository.listWorkbook({
      roles: ['COMPRAS'],
      page: 1,
      pageSize: 100,
      filters: [],
      completeness: 'complete',
    });
    expect(
      completeBand.items.every((item) => item.completeness !== null && item.completeness >= 90),
    ).toBe(true);
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
      attributeKey: 'tipo_de_indicador_de_desgaste',
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
      field: 'tipo_de_indicador_de_desgaste',
      source: 'manual',
    });
    expect(audit).toMatchObject({
      total: 1,
      items: [{ resourceType: 'product', resourceId: primaryId, after: 'Sensor' }],
    });

    await expect(
      repository.updateAttribute({
        productId: primaryId,
        attributeKey: 'tipo_de_indicador_de_desgaste',
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
    const sheet = await repository.getProductSheet(productId, ['COMPRAS']);
    expect(sheet?.schema.template.id).toBe(template!.id);
    expect(sheet?.product.attributes).toMatchObject({
      descripcion_tecnica_prueba: { value: null, version: 2 },
    });

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
