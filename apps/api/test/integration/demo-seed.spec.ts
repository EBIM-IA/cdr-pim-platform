import { newUuid } from '@cdr/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { deterministicDemoUuid, seedDemoCatalog } from '../../src/database/demo-seed';
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

describe('demo seed', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  beforeEach(() => database.truncateAll());
  afterAll(() => database.close());

  it('creates the complete source-backed workbook catalogue and is idempotent', async () => {
    await expect(seedDemoCatalog(database.db)).resolves.toEqual({
      productsInserted: 77,
      identifiersInserted: 154,
      groupsInserted: 73,
      membershipsInserted: 77,
      embeddingsIndexed: 77,
    });
    await database.db.insert(templateAssetRequirements).values({
      templateId: deterministicDemoUuid('attribute-template', 'grasa-automotriz:1'),
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
              deterministicDemoUuid('attribute-template', 'grasa-automotriz:1'),
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
    }).toEqual({ products: 77, identifiers: 154, groups: 73, members: 77, embeddings: 77 });

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
      categories: 36,
      active_categories: 32,
      templates: 32,
      definitions: 251,
      assignments: 916,
      role_access: 2748,
      product_templates: 77,
      attribute_values: 1485,
      asset_requirements: 140,
      required_assets: 11,
      prioritized_categories: 20,
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
      categorySlug: 'grasa-automotriz',
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

    expect(result.productsInserted).toBe(76);
    expect(result.groupsInserted).toBe(72);
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
