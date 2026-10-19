import { newUuid } from '@cdr/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  DEMO_PRODUCT_SEEDS,
  deterministicDemoUuid,
  seedDemoCatalog,
} from '../../src/database/demo-seed';
import {
  attributeDefinitions,
  attributeTemplates,
  catalogCategories,
  equivalenceGroupMembers,
  equivalenceGroups,
  externalHomologs,
  groupApplications,
  groupOemCodes,
  productAttributeValues,
  productIdentifiers,
  productTemplateAssignments,
  products,
  templateAssetRequirements,
} from '../../src/database/schema';
import { FakeEmbeddingAdapter } from '../../src/modules/ai/infrastructure/fake/fake-embedding.adapter';
import { SemanticSearchUseCase } from '../../src/modules/search/application/semantic-search.use-case';
import { DrizzleProductVectorIndex } from '../../src/modules/search/infrastructure/persistence/drizzle-product-vector-index.adapter';
import { type TestDatabase, createTestDatabase } from './database.helper';

const PIM1_CATEGORY_SLUGS = [
  'pastillas-de-freno',
  'grasa-automotriz',
  'rodamientos-de-bolas-autoalineables',
  'rodamientos-de-bolas-doble-hilera-de-contacto-angular',
  'aceite-de-motor',
  'zapatas',
  'retenedores',
  'banda-de-distribucion',
  'banda-de-accesorios',
  'cruceta',
  'disco-de-freno',
  'tambor-de-freno',
  'liquido-de-freno',
  'rodamiento-de-rigido-de-bolas',
  'bolas-de-acero',
  'refrigerantes',
  'rodamiento-de-bolas-axial',
  'rodamiento-de-rodillos-cilindricos',
  'rodamiento-de-rodillos-esfericos',
  'arandelas-de-fijacion',
  'filtro-de-aceite',
  'filtor-de-aire-rectangular',
  'filtro-de-aire-cilindrico',
  'filtro-de-combustible-elemento',
  'fitro-de-combustible-cilindrico',
  'fitro-de-combustible-estandar',
  'rodamientos-conicos',
  'aceite-de-transmision-manual-diferencial',
  'bujias',
  'baterias',
  'silicon',
  'manzana-de-rueda',
  'aceite-de-transmision-automatica',
  'amortiguador',
  'kit-de-distribucion',
  'kit-de-embrague',
] as const;

const PIM1_TEMPLATE_SLUGS = [
  'kit-de-embrague',
  'amortiguador',
  'aceite-de-transmision-automatica',
  'manzana-de-rueda',
  'silicon',
  'baterias',
  'bujias',
  'aceite-de-transmision-manual-diferencial',
  'filtro-de-combustible-elemento',
  'filtro-de-aire-cilindrico',
  'filtor-de-aire-rectangular',
  'filtro-de-aceite',
  'pastillas-de-freno',
  'grasa-automotriz',
  'rodamientos-de-bolas-autoalineables',
  'rodamientos-de-bolas-doble-hilera-de-contacto-angular',
  'aceite-de-motor',
  'zapatas',
  'retenedores',
  'banda-de-distribucion',
  'banda-de-accesorios',
  'cruceta',
  'disco-de-freno',
  'tambor-de-freno',
  'liquido-de-freno',
  'rodamiento-de-rigido-de-bolas',
  'bolas-de-acero',
  'refrigerantes',
  'rodamiento-de-bolas-axial',
  'rodamiento-de-rodillos-cilindricos',
  'rodamiento-de-rodillos-esfericos',
  'arandelas-de-fijacion',
] as const;

const PIM1_PRODUCT_SKUS = [
  'CDR-0000001298',
  'CDR-0000011635',
  'CDR-0000016850',
  'CDR-0000010489',
  'CDR-0000005026',
  'CDR-0000021659',
  'CDR-0000021341',
  'CDR-0000010027',
  'CDR-0000011703',
  'CDR-0000011695',
  'CDR-0000016659',
  'CDR-0000016639',
  'D1672',
  'CDR-0000002854',
  'D227',
  'CDR-0000004259',
  'D320',
  'D451',
  'CDR-0000005804',
  'CDR-0000005773',
  'CDR-0000005774',
  'CDR-0000005805',
  'CDR-0000005775',
  'CDR-0000005776',
  'CDR-0000005806',
  'D497',
  'CDR-0000005777',
  'CDR-0000005778',
  'CDR-0000002858',
  'D510',
  'CDR-0000002889',
  'CDR-0000003898',
  'CDR-0000000933',
  'CDR-0000007169',
  'GRASA AZUL GRADO 2',
  'CDR-0000007168',
  'CDR-0000005238',
  'CDR-0000000898',
  'CDR-0000000900',
  'GRASA MP2 (180KGS) -',
  'GRASA AMBAR GRADO 3',
  'CDR-0000007170',
  'CDR-0000000899',
  'CDR-0000000901',
  'GRASA MP3 (180KGS)',
  'CDR-0000009908',
  'CDR-0000009907',
  'CDR-0000005239',
  'CDR-0000007171',
  'CDR-0000007940',
  'CDR-0000009565',
  'CDR-0000005240',
  'CDR-0000014686',
  'CDR-0000014687',
  'CDR-0000014688',
  'CDR-0000014836',
  'CDR-0000014837',
  '1200-TVH-C3',
  'CDR-0000015254',
  'CDR-0000016843',
  'BS814',
  'CDR-0000014230',
  'CT686_CONTITECH',
  '6PK 1875_CONTITECH',
  'CDR-0000007681',
  'CDR-0000024151',
  'CDR-0000024152',
  'CDR-0000024113',
  'CDR-0000024114',
  'CDR-0000001638',
  '6202-2RSR-L038-C3',
  'CDR-0000007311',
  'CDR-0000015241',
  '51101_FAG',
  'NU1006-M1_FAG',
  '22207-E1-C3',
  'CDR-0000009964',
] as const;

describe('demo seed', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  beforeEach(() => database.truncateAll());
  afterAll(() => database.close());

  it('creates the complete source-backed workbook catalogue and is idempotent', async () => {
    await expect(seedDemoCatalog(database.db)).resolves.toEqual({
      productsInserted: 97,
      identifiersInserted: 194,
      groupsInserted: 93,
      membershipsInserted: 97,
      embeddingsIndexed: 97,
    });
    await database.db.insert(templateAssetRequirements).values({
      templateId: deterministicDemoUuid('attribute-template', 'lubricantes-grasa-grasa:1'),
      // PLANO is a supported type but is no longer part of this manifest template.
      typeCode: 'PLANO',
      required: true,
      active: true,
    });

    await expect(seedDemoCatalog(database.db)).resolves.toEqual({
      productsInserted: 0,
      identifiersInserted: 0,
      groupsInserted: 0,
      membershipsInserted: 0,
      embeddingsIndexed: 0,
    });
    await expect(
      database.db
        .select({ active: templateAssetRequirements.active })
        .from(templateAssetRequirements)
        .where(
          and(
            eq(
              templateAssetRequirements.templateId,
              deterministicDemoUuid('attribute-template', 'lubricantes-grasa-grasa:1'),
            ),
            eq(templateAssetRequirements.typeCode, 'PLANO'),
          ),
        ),
    ).resolves.toEqual([{ active: false }]);

    const [productCount] = await database.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM products
    `;
    const [identifierCount] = await database.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM product_identifiers
    `;
    const [groupCount] = await database.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM equivalence_groups
    `;
    const [memberCount] = await database.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM equivalence_group_members
    `;
    const [embeddingCount] = await database.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM product_embeddings
    `;

    expect({
      products: productCount?.count,
      identifiers: identifierCount?.count,
      groups: groupCount?.count,
      members: memberCount?.count,
      embeddings: embeddingCount?.count,
    }).toEqual({ products: 97, identifiers: 194, groups: 93, members: 97, embeddings: 97 });

    const [schemaCounts] = await database.sql<
      {
        categories: number;
        active_categories: number;
        templates: number;
        definitions: number;
        assignments: number;
        role_access: number;
        product_templates: number;
        attribute_values: number;
        asset_requirements: number;
        required_assets: number;
        prioritized_categories: number;
      }[]
    >`
      SELECT
        (SELECT count(*)::int FROM catalog_categories) AS categories,
        (SELECT count(*)::int FROM catalog_categories WHERE active) AS active_categories,
        (SELECT count(*)::int FROM attribute_templates) AS templates,
        (SELECT count(*)::int FROM attribute_definitions) AS definitions,
        (SELECT count(*)::int FROM template_attribute_assignments) AS assignments,
        (SELECT count(*)::int FROM template_attribute_role_access) AS role_access,
        (SELECT count(*)::int FROM product_template_assignments) AS product_templates,
        (SELECT count(*)::int FROM product_attribute_values) AS attribute_values,
        (SELECT count(*)::int FROM template_asset_requirements WHERE active) AS asset_requirements,
        (SELECT count(*)::int FROM template_asset_requirements WHERE active AND required) AS required_assets,
        (
          SELECT count(*)::int FROM catalog_categories
          WHERE source_priority <> '{}'::jsonb
        ) AS prioritized_categories
    `;
    expect(schemaCounts).toEqual({
      categories: 351,
      active_categories: 78,
      templates: 52,
      definitions: 294,
      assignments: 1472,
      role_access: 4416,
      product_templates: 97,
      attribute_values: 2079,
      asset_requirements: 256,
      required_assets: 28,
      prioritized_categories: 44,
    });

    const [relationCounts] = await database.sql<
      { applications: number; homologs: number; oem_codes: number }[]
    >`
      SELECT
        (SELECT count(*)::int FROM group_applications WHERE active AND source = 'import') AS applications,
        (
          SELECT count(*)::int FROM external_homologs
          WHERE active AND approval_status = 'approved' AND source = 'import'
        ) AS homologs,
        (
          SELECT count(*)::int FROM group_oem_codes
          WHERE active AND approval_status = 'approved' AND source = 'import'
        ) AS oem_codes
    `;
    expect(relationCounts).toEqual({ applications: 1, homologs: 3, oem_codes: 3 });

    const [application] = await database.sql<
      {
        body_style: string | null;
        fuel: string | null;
        traction: string | null;
        displacement: string | null;
        area: string | null;
        subarea: string | null;
        notes: string | null;
      }[]
    >`
      SELECT body_style, fuel, traction, displacement, area, subarea, notes
      FROM group_applications
      WHERE source = 'import'
    `;
    expect(application).toEqual({
      body_style: 'HB',
      fuel: 'GSL',
      traction: '4X2',
      displacement: '1.6L',
      area: 'RUEDA POSTERIOR',
      subarea: 'MANZANA 5 PERNOS CON ABS',
      notes: null,
    });
  });

  it('upgrades all overlapping PIM(1) products and hides only seed-owned PIM(1) schemas', async () => {
    expect(PIM1_CATEGORY_SLUGS).toHaveLength(36);
    expect(PIM1_TEMPLATE_SLUGS).toHaveLength(32);
    expect(PIM1_PRODUCT_SKUS).toHaveLength(77);
    const currentSkus = new Set(DEMO_PRODUCT_SEEDS.map((product) => product.sku));
    expect(PIM1_PRODUCT_SKUS.every((sku) => currentSkus.has(sku))).toBe(true);

    const pim1CategoryIds = PIM1_CATEGORY_SLUGS.map((slug) =>
      deterministicDemoUuid('category', slug),
    );
    const pim1TemplateIds = PIM1_TEMPLATE_SLUGS.map((slug) =>
      deterministicDemoUuid('attribute-template', `${slug}:1`),
    );
    const pim1TemplateIdSet = new Set<string>(pim1TemplateIds);
    const pim1ProductIds = PIM1_PRODUCT_SKUS.map((sku) => deterministicDemoUuid('product', sku));

    await database.db.insert(catalogCategories).values(
      PIM1_CATEGORY_SLUGS.map((slug, position) => ({
        id: deterministicDemoUuid('category', slug),
        slug,
        name: `PIM(1) ${slug}`,
        path: slug,
        position,
        active: true,
      })),
    );
    await database.db.insert(attributeTemplates).values(
      PIM1_TEMPLATE_SLUGS.map((slug) => ({
        id: deterministicDemoUuid('attribute-template', `${slug}:1`),
        categoryId: deterministicDemoUuid('category', slug),
        variantKey: 'legacy',
        name: `PIM(1) ${slug}`,
        version: 1,
        status: 'active',
      })),
    );
    await database.db.insert(products).values(
      PIM1_PRODUCT_SKUS.map((sku) => ({
        id: deterministicDemoUuid('product', sku),
        sku,
        name: `PIM(1) ${sku}`,
        status: 'in_review',
      })),
    );
    await database.db.insert(productTemplateAssignments).values(
      PIM1_PRODUCT_SKUS.map((sku, index) => ({
        productId: deterministicDemoUuid('product', sku),
        templateId: pim1TemplateIds[index % pim1TemplateIds.length] as string,
      })),
    );

    const manualCategoryId = newUuid();
    const manualTemplateId = newUuid();
    const manualProductId = newUuid();
    await database.db.insert(catalogCategories).values({
      id: manualCategoryId,
      slug: 'categoria-manual-preservada',
      name: 'Categoría manual preservada',
      path: 'categoria-manual-preservada',
      active: true,
    });
    await database.db.insert(attributeTemplates).values({
      id: manualTemplateId,
      categoryId: manualCategoryId,
      variantKey: 'manual',
      name: 'Plantilla manual preservada',
      version: 1,
      status: 'active',
    });
    await database.db.insert(products).values({
      id: manualProductId,
      sku: 'SKU-MANUAL-PRESERVADO',
      name: 'Producto manual preservado',
      status: 'draft',
    });
    await database.db.insert(productTemplateAssignments).values({
      productId: manualProductId,
      templateId: manualTemplateId,
    });

    await seedDemoCatalog(database.db);
    await seedDemoCatalog(database.db);

    const [pim1Categories, pim1Templates, reassignedProducts, manualCategory, manualTemplate] =
      await Promise.all([
        database.db
          .select({ id: catalogCategories.id, active: catalogCategories.active })
          .from(catalogCategories)
          .where(inArray(catalogCategories.id, pim1CategoryIds)),
        database.db
          .select({ id: attributeTemplates.id, status: attributeTemplates.status })
          .from(attributeTemplates)
          .where(inArray(attributeTemplates.id, pim1TemplateIds)),
        database.db
          .select({
            productId: productTemplateAssignments.productId,
            templateId: productTemplateAssignments.templateId,
            templateStatus: attributeTemplates.status,
            categoryActive: catalogCategories.active,
          })
          .from(productTemplateAssignments)
          .innerJoin(
            attributeTemplates,
            eq(attributeTemplates.id, productTemplateAssignments.templateId),
          )
          .innerJoin(catalogCategories, eq(catalogCategories.id, attributeTemplates.categoryId))
          .where(inArray(productTemplateAssignments.productId, pim1ProductIds)),
        database.db
          .select({ active: catalogCategories.active })
          .from(catalogCategories)
          .where(eq(catalogCategories.id, manualCategoryId)),
        database.db
          .select({ status: attributeTemplates.status })
          .from(attributeTemplates)
          .where(eq(attributeTemplates.id, manualTemplateId)),
      ]);

    expect(pim1Categories).toHaveLength(36);
    expect(pim1Categories.every((category) => !category.active)).toBe(true);
    expect(pim1Templates).toHaveLength(32);
    expect(pim1Templates.every((template) => template.status === 'retired')).toBe(true);
    expect(reassignedProducts).toHaveLength(77);
    expect(
      reassignedProducts.every(
        (assignment) =>
          !pim1TemplateIdSet.has(assignment.templateId) &&
          assignment.templateStatus === 'active' &&
          assignment.categoryActive,
      ),
    ).toBe(true);
    expect(manualCategory).toEqual([{ active: true }]);
    expect(manualTemplate).toEqual([{ status: 'active' }]);
    await expect(
      database.db
        .select({ templateId: productTemplateAssignments.templateId })
        .from(productTemplateAssignments)
        .where(eq(productTemplateAssignments.productId, manualProductId)),
    ).resolves.toEqual([{ templateId: manualTemplateId }]);
  });

  it('upgrades only deterministic artifacts from the former seven-row seed', async () => {
    const productId = deterministicDemoUuid('product', 'CDR-0000000933');
    const groupId = deterministicDemoUuid('equivalence-group', 'AZUL G2-1/4LB');
    const oldCategoryId = deterministicDemoUuid('category', 'grasas');
    const oldTemplateId = deterministicDemoUuid('attribute-template', 'grasas:1');
    const definitionId = deterministicDemoUuid('attribute-definition', 'codigo_unificador');
    const d1672GroupId = deterministicDemoUuid('equivalence-group', 'D1672');
    const preservedManualHomologId = newUuid();
    const obsoleteIdentifierId = deterministicDemoUuid(
      'identifier',
      'manufacturer_part_number:LEGACY-SUPPLIER',
    );
    const preservedManualIdentifierId = newUuid();
    const obsoleteGroupId = deterministicDemoUuid('equivalence-group', 'LEGACY-UNIFIER');

    await database.db.insert(products).values({
      id: productId,
      sku: 'CDR-0000000933',
      name: 'Nombre local preservado',
      status: 'draft',
    });
    await database.db.insert(equivalenceGroups).values([
      { id: groupId, code: 'AZUL G2-1/4LB', name: 'AZUL G2-1/4LB' },
      { id: d1672GroupId, code: 'D1672', name: 'D1672' },
      { id: obsoleteGroupId, code: 'LEGACY-UNIFIER', name: 'LEGACY-UNIFIER' },
    ]);
    await database.db.insert(productIdentifiers).values([
      {
        id: obsoleteIdentifierId,
        productId,
        type: 'manufacturer_part_number',
        value: 'LEGACY-SUPPLIER',
      },
      {
        id: preservedManualIdentifierId,
        productId,
        type: 'manufacturer_part_number',
        value: 'CURATED-LOCAL-CODE',
      },
    ]);
    await database.db.insert(equivalenceGroupMembers).values({
      groupId: obsoleteGroupId,
      productId,
      role: 'member',
    });
    await database.db.insert(catalogCategories).values({
      id: oldCategoryId,
      slug: 'grasas',
      name: 'Grasas',
      path: 'grasas',
      active: true,
    });
    await database.db.insert(attributeTemplates).values({
      id: oldTemplateId,
      categoryId: oldCategoryId,
      variantKey: 'legacy',
      name: 'Plantilla Grasas',
      version: 1,
      status: 'active',
    });
    await database.db.insert(attributeDefinitions).values({
      id: definitionId,
      key: 'codigo_unificador',
      label: 'Código unificador',
      dataType: 'text',
      sourceAuthority: 'erp',
    });
    await database.db.insert(productTemplateAssignments).values({
      productId,
      templateId: oldTemplateId,
    });
    await database.db.insert(productAttributeValues).values({
      productId,
      attributeDefinitionId: definitionId,
      valueText: 'LEGACY-WRONG',
      source: 'erp',
      version: 1,
    });
    await database.db.insert(groupApplications).values({
      id: deterministicDemoUuid('group-application', 'D1672:AUTOMOTRIZ'),
      groupId: d1672GroupId,
      vehicleType: 'AUTOMOTRIZ',
      make: 'TOYOTA',
      model: 'HILUX',
      source: 'manual',
    });
    await database.db.insert(externalHomologs).values([
      {
        id: deterministicDemoUuid('external-homolog', 'D1672:DEMO:D1672-DEMO'),
        groupId: d1672GroupId,
        externalCode: 'D1672-DEMO',
        externalBrand: 'DEMO',
      },
      {
        id: preservedManualHomologId,
        groupId: d1672GroupId,
        externalCode: 'CURATED-MANUAL',
        externalBrand: 'LOCAL',
      },
    ]);
    await database.db.insert(groupOemCodes).values(
      ['A', 'B', 'C'].map((suffix) => ({
        id: deterministicDemoUuid('group-oem-code', `D1672:DEMO-OEM-${suffix}`),
        groupId: d1672GroupId,
        oemCode: `DEMO-OEM-D1672-${suffix}`,
        brands: ['DEMO'],
      })),
    );

    await seedDemoCatalog(database.db);
    await expect(seedDemoCatalog(database.db)).resolves.toEqual({
      productsInserted: 0,
      identifiersInserted: 0,
      groupsInserted: 0,
      membershipsInserted: 0,
      embeddingsIndexed: 0,
    });

    const [upgraded] = await database.db
      .select({
        productName: products.name,
        categorySlug: catalogCategories.slug,
        unifiedCode: productAttributeValues.valueText,
        valueVersion: productAttributeValues.version,
      })
      .from(products)
      .innerJoin(productTemplateAssignments, eq(productTemplateAssignments.productId, products.id))
      .innerJoin(
        attributeTemplates,
        eq(attributeTemplates.id, productTemplateAssignments.templateId),
      )
      .innerJoin(catalogCategories, eq(catalogCategories.id, attributeTemplates.categoryId))
      .innerJoin(productAttributeValues, eq(productAttributeValues.productId, products.id))
      .where(
        and(
          eq(products.id, productId),
          eq(productAttributeValues.attributeDefinitionId, definitionId),
        ),
      );
    expect(upgraded).toMatchObject({
      productName: 'GRASA AZUL G2 1/4LB',
      categorySlug: 'lubricantes-grasa-grasa',
      unifiedCode: 'AZUL G2-1/4LB',
      valueVersion: 2,
    });
    const [oldCategory] = await database.db
      .select({ active: catalogCategories.active })
      .from(catalogCategories)
      .where(eq(catalogCategories.id, oldCategoryId));
    expect(oldCategory?.active).toBe(false);
    const [obsoleteIdentifiers, preservedIdentifiers, obsoleteMemberships] = await Promise.all([
      database.db
        .select({ id: productIdentifiers.id })
        .from(productIdentifiers)
        .where(eq(productIdentifiers.id, obsoleteIdentifierId)),
      database.db
        .select({ id: productIdentifiers.id })
        .from(productIdentifiers)
        .where(eq(productIdentifiers.id, preservedManualIdentifierId)),
      database.db
        .select({ productId: equivalenceGroupMembers.productId })
        .from(equivalenceGroupMembers)
        .where(
          and(
            eq(equivalenceGroupMembers.productId, productId),
            eq(equivalenceGroupMembers.groupId, obsoleteGroupId),
          ),
        ),
    ]);
    expect(obsoleteIdentifiers).toEqual([]);
    expect(preservedIdentifiers).toEqual([{ id: preservedManualIdentifierId }]);
    expect(obsoleteMemberships).toEqual([]);

    const [legacyApplications, legacyHomologs, legacyOemCodes] = await Promise.all([
      database.db
        .select({ id: groupApplications.id })
        .from(groupApplications)
        .where(
          eq(groupApplications.id, deterministicDemoUuid('group-application', 'D1672:AUTOMOTRIZ')),
        ),
      database.db
        .select({ id: externalHomologs.id })
        .from(externalHomologs)
        .where(
          eq(
            externalHomologs.id,
            deterministicDemoUuid('external-homolog', 'D1672:DEMO:D1672-DEMO'),
          ),
        ),
      database.db
        .select({ id: groupOemCodes.id })
        .from(groupOemCodes)
        .where(
          inArray(
            groupOemCodes.id,
            ['A', 'B', 'C'].map((suffix) =>
              deterministicDemoUuid('group-oem-code', `D1672:DEMO-OEM-${suffix}`),
            ),
          ),
        ),
    ]);
    expect({
      applications: legacyApplications.length,
      homologs: legacyHomologs.length,
      oem_codes: legacyOemCodes.length,
    }).toEqual({ applications: 0, homologs: 0, oem_codes: 0 });
    await expect(
      database.db
        .select({ id: externalHomologs.id })
        .from(externalHomologs)
        .where(eq(externalHomologs.id, preservedManualHomologId)),
    ).resolves.toEqual([{ id: preservedManualHomologId }]);
  });

  it('makes the seeded demo catalogue semantically searchable without a network provider', async () => {
    await seedDemoCatalog(database.db);
    const search = new SemanticSearchUseCase(
      new FakeEmbeddingAdapter('fake-embedding-v1', 1536),
      new DrizzleProductVectorIndex(database.db),
      { findDeterministic: async () => [], documentParts: async () => [] },
    );

    const result = await search.execute('GRASA AZUL G2 1/4LB OKAMI GRASAS', 3, ['ADMINISTRADOR']);

    expect(result.hits).toContainEqual(
      expect.objectContaining({
        sku: 'CDR-0000000933',
        name: 'GRASA AZUL G2 1/4LB',
      }),
    );
    expect(result.hits[0]?.score).toBeGreaterThan(0);
  });

  it('preserves existing product and group fields while completing missing relations', async () => {
    const existingProductId = newUuid();
    const existingGroupId = newUuid();
    await database.db.insert(products).values({
      id: existingProductId,
      sku: 'D1672',
      name: 'Nombre curado por un usuario',
      status: 'draft',
    });
    await database.db.insert(equivalenceGroups).values({
      id: existingGroupId,
      code: 'D1672',
      name: 'Nombre de grupo curado',
      kind: 'supersession',
    });

    const result = await seedDemoCatalog(database.db);
    const [preservedProduct] = await database.db
      .select()
      .from(products)
      .where(eq(products.id, existingProductId));
    const [preservedGroup] = await database.db
      .select()
      .from(equivalenceGroups)
      .where(eq(equivalenceGroups.id, existingGroupId));
    const identifiers = await database.db
      .select()
      .from(productIdentifiers)
      .where(eq(productIdentifiers.productId, existingProductId));
    const memberships = await database.db
      .select()
      .from(equivalenceGroupMembers)
      .where(eq(equivalenceGroupMembers.productId, existingProductId));

    expect(result.productsInserted).toBe(96);
    expect(result.groupsInserted).toBe(92);
    expect(preservedProduct).toMatchObject({
      name: 'Nombre curado por un usuario',
      status: 'draft',
    });
    expect(preservedGroup).toMatchObject({
      name: 'Nombre de grupo curado',
      kind: 'supersession',
    });
    expect(identifiers).toHaveLength(2);
    expect(memberships).toEqual([
      expect.objectContaining({ groupId: existingGroupId, role: 'member' }),
    ]);
  });
});
