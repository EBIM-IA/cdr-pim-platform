import { createHash } from 'node:crypto';

import { type Uuid, assertUuid } from '@cdr/shared';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import {
  CLIENT_TEMPLATE_MANIFEST,
  CLIENT_TEMPLATE_ROLES,
  type ClientAttributeDataType,
  type ClientAttributeValue,
} from './client-template-manifest';
import type { Database } from './drizzle.client';
import { FakeEmbeddingAdapter } from '../modules/ai/infrastructure/fake/fake-embedding.adapter';
import {
  attributeDefinitions,
  attributeTemplates,
  catalogCategories,
  productAttributeValues,
  productTemplateAssignments,
  templateAttributeAssignments,
  templateAttributeRoleAccess,
  templateAssetRequirements,
} from '../modules/catalog-schema/infrastructure/persistence/catalog-schema.tables';
import { DrizzleProductRepository } from '../modules/catalog/infrastructure/persistence/drizzle-product.repository';
import { IndexProductUseCase } from '../modules/search/application/index-product.use-case';
import { DrizzleProductVectorIndex } from '../modules/search/infrastructure/persistence/drizzle-product-vector-index.adapter';
import { EMBEDDING_DIMENSIONS } from '../modules/search/infrastructure/persistence/search.tables';
import {
  equivalenceGroupMembers,
  equivalenceGroups,
  externalHomologs,
  groupApplications,
  groupOemCodes,
  productIdentifiers,
  products,
} from './schema';

/**
 * Source-backed local/test catalogue generated from the latest client workbook. The source
 * workbook itself is not needed by the API container: the generated manifest records its SHA-256
 * and keeps spreadsheet parsing outside the runtime.
 */
const CLIENT_WORKBOOK_EFFECTIVE_AT = '2026-10-19T16:03:02.000Z';

export const DEMO_PRODUCT_SEEDS = CLIENT_TEMPLATE_MANIFEST.templates.flatMap((template) =>
  template.products.map((product) => ({
    sku: product.sku,
    supplierCode: product.providerCode,
    unifiedCode: product.unifiedCode,
    name: product.name,
    brand: product.brand || null,
    status: 'in_review' as const,
    // The workbook does not contain an approved commercial-description field.
    description: null,
    sourceUpdatedAt: CLIENT_WORKBOOK_EFFECTIVE_AT,
    categorySlug: template.categorySlug,
    templateVariantKey: manifestTemplateVariantKey(template),
    values: product.values,
  })),
);

const MANIFEST_CATEGORY_BY_SLUG = new Map(
  CLIENT_TEMPLATE_MANIFEST.categories.map((category) => [category.slug, category]),
);
const ACTIVE_MANIFEST_CATEGORY_SLUGS = new Set<string>();
for (const category of CLIENT_TEMPLATE_MANIFEST.categories) {
  if (!category.defined) continue;
  let current: typeof category | undefined = category;
  while (current) {
    ACTIVE_MANIFEST_CATEGORY_SLUGS.add(current.slug);
    current = current.parentSlug ? MANIFEST_CATEGORY_BY_SLUG.get(current.parentSlug) : undefined;
  }
}
const nextPositionByParentSlug = new Map<string | null, number>();

/** Template-backed leaves and their ancestors are active; untouched taxonomy branches stay pending. */
export const DEMO_CATEGORY_SEEDS = CLIENT_TEMPLATE_MANIFEST.categories.map((category) => {
  const position = nextPositionByParentSlug.get(category.parentSlug) ?? 0;
  nextPositionByParentSlug.set(category.parentSlug, position + 1);
  return {
    slug: category.slug,
    name: category.name,
    level: category.level,
    parentSlug: category.parentSlug,
    path: category.categoryPath.join(' > '),
    position,
    active: ACTIVE_MANIFEST_CATEGORY_SLUGS.has(category.slug),
    application: category.application,
    sourcePriority: category.sourcePriority,
  };
});

export const DEMO_ATTRIBUTE_SEEDS = CLIENT_TEMPLATE_MANIFEST.definitions;
export const DEMO_TEMPLATE_SEEDS = CLIENT_TEMPLATE_MANIFEST.templates;

/**
 * Workbook asset requirements are kept source-backed even though no file rows are fabricated:
 * `product_assets` only stores uploaded binaries, so an empty workbook cell must remain empty.
 */
export const DEMO_TEMPLATE_ASSET_REQUIREMENTS = CLIENT_TEMPLATE_MANIFEST.templates.map(
  (template) => ({
    categorySlug: template.categorySlug,
    templateVariantKey: manifestTemplateVariantKey(template),
    assets: template.assets,
  }),
);

function manifestTemplateVariantKey(template: { readonly variantKey: string }): string {
  const variantKey = template.variantKey.trim();
  if (!variantKey) throw new Error('Template variant key cannot be blank');
  return variantKey;
}

function demoTemplateKey(categoryId: string, variantKey: string): string {
  return `${categoryId}:${variantKey}`;
}

function demoTemplateId(template: {
  readonly categorySlug: string;
  readonly variantKey: string;
}): Uuid {
  const sameCategoryVariants = CLIENT_TEMPLATE_MANIFEST.templates.filter(
    (candidate) => candidate.categorySlug === template.categorySlug,
  ).length;
  return deterministicDemoUuid(
    'attribute-template',
    sameCategoryVariants > 1
      ? `${template.categorySlug}:${manifestTemplateVariantKey(template)}:1`
      : `${template.categorySlug}:1`,
  );
}

const DEMO_GROUP_SEEDS = uniqueBy(
  DEMO_PRODUCT_SEEDS.map((seed) => ({ code: seed.unifiedCode, name: seed.unifiedCode })),
  (seed) => seed.code,
);
const DEMO_DEFINITION_BY_KEY = new Map(
  DEMO_ATTRIBUTE_SEEDS.map((definition) => [definition.key, definition]),
);
const LEGACY_DEMO_CATEGORY_SLUGS = [
  'aceites-de-motor',
  'discos-de-freno',
  'grasas',
  'retenedores-metricos',
  'rodamientos-rigidos-de-bolas',
] as const;
const PIM1_DEMO_CATEGORY_SLUGS = [
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
const PIM1_DEMO_TEMPLATE_SLUGS = [
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

export type DemoSeedEnvironment = 'local' | 'test';

export interface DemoSeedResult {
  readonly productsInserted: number;
  readonly identifiersInserted: number;
  readonly groupsInserted: number;
  readonly membershipsInserted: number;
  readonly embeddingsIndexed: number;
}

// A fixed namespace keeps demo identifiers stable across machines and database resets.
const DEMO_UUID_NAMESPACE = Buffer.from('7d60ae26c2f04f6a8ed628be63ba3b1f', 'hex');

/** RFC 4122 UUID v5, used only for repeatable demo fixtures (runtime aggregates use v4). */
export function deterministicDemoUuid(scope: string, key: string): Uuid {
  const bytes = createHash('sha1')
    .update(DEMO_UUID_NAMESPACE)
    .update(`${scope}:${key}`)
    .digest()
    .subarray(0, 16);

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return assertUuid(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    'demoSeedId',
  );
}

const LEGACY_DEMO_APPLICATION_IDS = [
  deterministicDemoUuid('group-application', 'D1672:AUTOMOTRIZ'),
];
const LEGACY_DEMO_HOMOLOG_IDS = [
  deterministicDemoUuid('external-homolog', 'D1672:DEMO:D1672-DEMO'),
];
const LEGACY_DEMO_OEM_IDS = ['A', 'B', 'C'].map((suffix) =>
  deterministicDemoUuid('group-oem-code', `D1672:DEMO-OEM-${suffix}`),
);

export function assertDemoSeedEnvironment(value: string): asserts value is DemoSeedEnvironment {
  if (value !== 'local' && value !== 'test') {
    throw new Error(
      `Demo data can only be seeded with APP_ENV=local or APP_ENV=test; received "${value}".`,
    );
  }
}

/**
 * Inserts or upgrades the deterministic local/test fixture without taking ownership of
 * independently-created records.
 *
 * Resolving products and groups by their natural keys after INSERT is intentional: an
 * operator may already have a row with the same SKU/code but a different UUID. Existing
 * deterministic rows follow the regenerated manifest; rows with external UUIDs and values
 * curated with source `manual` keep their business data.
 */
export async function seedDemoCatalog(db: Database): Promise<DemoSeedResult> {
  const catalogResult = await db.transaction(async (tx) => {
    const insertedProducts = await tx
      .insert(products)
      .values(
        DEMO_PRODUCT_SEEDS.map((seed) => ({
          id: deterministicDemoUuid('product', seed.sku),
          sku: seed.sku,
          name: seed.name,
          description: seed.description,
          brand: seed.brand,
          status: seed.status,
          updatedAt: new Date(seed.sourceUpdatedAt),
        })),
      )
      .onConflictDoUpdate({
        target: products.sku,
        set: {
          name: sql.raw('excluded.name'),
          description: sql.raw('excluded.description'),
          brand: sql.raw('excluded.brand'),
          status: sql.raw('excluded.status'),
        },
        // A manually-created product which happens to use the same SKU is never seed-owned.
        setWhere: sql`${products.id} = excluded.id AND (
          ${products.name}, ${products.description}, ${products.brand}, ${products.status}
        ) IS DISTINCT FROM (
          excluded.name, excluded.description, excluded.brand, excluded.status
        )`,
      })
      .returning({ id: products.id });

    const productRows = await tx
      .select({ id: products.id, sku: products.sku })
      .from(products)
      .where(
        inArray(
          products.sku,
          DEMO_PRODUCT_SEEDS.map((seed) => seed.sku),
        ),
      );
    const productIdBySku = new Map(productRows.map((row) => [row.sku, row.id]));
    requireAllNaturalKeys(
      'products',
      DEMO_PRODUCT_SEEDS.map((seed) => seed.sku),
      productIdBySku,
    );

    const seedOwnedProductIds = DEMO_PRODUCT_SEEDS.map((seed) => ({
      productId: productIdBySku.get(seed.sku) as string,
      expectedId: deterministicDemoUuid('product', seed.sku),
    }))
      .filter(({ productId, expectedId }) => productId === expectedId)
      .map(({ productId }) => productId);
    const expectedIdentifierIds = new Set(
      DEMO_PRODUCT_SEEDS.flatMap((seed) => [
        deterministicDemoUuid('identifier', `sku:${seed.sku}`),
        deterministicDemoUuid('identifier', `manufacturer_part_number:${seed.supplierCode}`),
      ]),
    );
    if (seedOwnedProductIds.length > 0) {
      const currentSeedIdentifiers = await tx
        .select({
          id: productIdentifiers.id,
          type: productIdentifiers.type,
          value: productIdentifiers.value,
        })
        .from(productIdentifiers)
        .where(inArray(productIdentifiers.productId, seedOwnedProductIds));
      const obsoleteSeedIdentifierIds = currentSeedIdentifiers
        .filter(
          (identifier) =>
            (identifier.type === 'sku' || identifier.type === 'manufacturer_part_number') &&
            identifier.id ===
              deterministicDemoUuid('identifier', `${identifier.type}:${identifier.value}`) &&
            !expectedIdentifierIds.has(identifier.id as Uuid),
        )
        .map((identifier) => identifier.id);
      if (obsoleteSeedIdentifierIds.length > 0) {
        await tx
          .delete(productIdentifiers)
          .where(inArray(productIdentifiers.id, obsoleteSeedIdentifierIds));
      }
    }

    const identifierValues = DEMO_PRODUCT_SEEDS.flatMap((seed) => {
      const productId = productIdBySku.get(seed.sku) as string;
      return [
        { type: 'sku', value: seed.sku },
        { type: 'manufacturer_part_number', value: seed.supplierCode },
      ].map((identifier) => ({
        id: deterministicDemoUuid('identifier', `${identifier.type}:${identifier.value}`),
        productId,
        type: identifier.type,
        value: identifier.value,
      }));
    });
    const insertedIdentifiers = await tx
      .insert(productIdentifiers)
      .values(identifierValues)
      .onConflictDoNothing()
      .returning({ id: productIdentifiers.id });

    const insertedGroups = await tx
      .insert(equivalenceGroups)
      .values(
        DEMO_GROUP_SEEDS.map((seed) => ({
          id: deterministicDemoUuid('equivalence-group', seed.code),
          code: seed.code,
          // The source supplies the code but no separate group label. Reusing it avoids
          // inventing a commercial name that the client has not approved.
          name: seed.name,
          kind: 'interchange',
        })),
      )
      .onConflictDoNothing()
      .returning({ id: equivalenceGroups.id });

    const groupRows = await tx
      .select({ id: equivalenceGroups.id, code: equivalenceGroups.code })
      .from(equivalenceGroups)
      .where(
        inArray(
          equivalenceGroups.code,
          DEMO_GROUP_SEEDS.map((seed) => seed.code),
        ),
      );
    const groupIdByCode = new Map(groupRows.map((row) => [row.code, row.id]));
    requireAllNaturalKeys(
      'equivalence groups',
      DEMO_GROUP_SEEDS.map((seed) => seed.code),
      groupIdByCode,
    );

    if (seedOwnedProductIds.length > 0) {
      const desiredGroupIdByProductId = new Map(
        DEMO_PRODUCT_SEEDS.filter(
          (seed) => productIdBySku.get(seed.sku) === deterministicDemoUuid('product', seed.sku),
        ).map((seed) => [
          productIdBySku.get(seed.sku) as string,
          groupIdByCode.get(seed.unifiedCode) as string,
        ]),
      );
      const currentSeedMemberships = await tx
        .select({
          productId: equivalenceGroupMembers.productId,
          groupId: equivalenceGroupMembers.groupId,
          groupCode: equivalenceGroups.code,
        })
        .from(equivalenceGroupMembers)
        .innerJoin(equivalenceGroups, eq(equivalenceGroups.id, equivalenceGroupMembers.groupId))
        .where(inArray(equivalenceGroupMembers.productId, seedOwnedProductIds));
      const obsoleteSeedMemberships = currentSeedMemberships.filter(
        (membership) =>
          membership.groupId === deterministicDemoUuid('equivalence-group', membership.groupCode) &&
          membership.groupId !== desiredGroupIdByProductId.get(membership.productId),
      );
      for (const membership of obsoleteSeedMemberships) {
        await tx
          .delete(equivalenceGroupMembers)
          .where(
            and(
              eq(equivalenceGroupMembers.productId, membership.productId),
              eq(equivalenceGroupMembers.groupId, membership.groupId),
            ),
          );
      }
    }

    const insertedMemberships = await tx
      .insert(equivalenceGroupMembers)
      .values(
        DEMO_PRODUCT_SEEDS.map((seed) => ({
          groupId: groupIdByCode.get(seed.unifiedCode) as string,
          productId: productIdBySku.get(seed.sku) as string,
          // The workbook identifies membership, not a preferred/reference product.
          role: 'member',
        })),
      )
      .onConflictDoNothing()
      .returning({ productId: equivalenceGroupMembers.productId });

    // Upgrade only artifacts whose exact UUIDs were generated by the former seven-row seed.
    // User-created/manual relations have different IDs and are intentionally untouched.
    await tx
      .delete(groupApplications)
      .where(inArray(groupApplications.id, LEGACY_DEMO_APPLICATION_IDS));
    await tx.delete(externalHomologs).where(inArray(externalHomologs.id, LEGACY_DEMO_HOMOLOG_IDS));
    await tx.delete(groupOemCodes).where(inArray(groupOemCodes.id, LEGACY_DEMO_OEM_IDS));

    if (CLIENT_TEMPLATE_MANIFEST.relations.applications.length > 0) {
      await tx
        .insert(groupApplications)
        .values(
          CLIENT_TEMPLATE_MANIFEST.relations.applications.map((relation) => ({
            id: deterministicDemoUuid(
              'group-application',
              [
                relation.codigo_unificador,
                relation.marca_vehiculo,
                relation.modelo,
                relation.ano_desde ?? '',
                relation.ano_hasta ?? '',
              ].join(':'),
            ),
            groupId: groupIdByCode.get(relation.codigo_unificador) as string,
            vehicleType: applicationTypeForGroup(relation.codigo_unificador),
            make: relation.marca_vehiculo,
            model: relation.modelo,
            bodyStyle: relation.tipo ?? null,
            fuel: relation.combustible ?? null,
            traction: relation.traccion ?? null,
            displacement: relation.cilindraje === undefined ? null : String(relation.cilindraje),
            yearFrom: relation.ano_desde ?? null,
            yearTo: relation.ano_hasta ?? null,
            area: relation.area ?? null,
            subarea: relation.subarea ?? null,
            engine: null,
            notes: null,
            active: true,
            source: 'import',
          })),
        )
        .onConflictDoUpdate({
          target: groupApplications.id,
          set: {
            bodyStyle: sql.raw('excluded.body_style'),
            fuel: sql.raw('excluded.fuel'),
            traction: sql.raw('excluded.traction'),
            displacement: sql.raw('excluded.displacement'),
            area: sql.raw('excluded.area'),
            subarea: sql.raw('excluded.subarea'),
            notes: null,
            source: 'import',
            updatedAt: sql`now()`,
          },
        });
    }

    if (CLIENT_TEMPLATE_MANIFEST.relations.homologs.length > 0) {
      await tx
        .insert(externalHomologs)
        .values(
          CLIENT_TEMPLATE_MANIFEST.relations.homologs.map((relation) => ({
            id: deterministicDemoUuid(
              'external-homolog',
              `${relation.codigo_unificador}:${relation.marca_homologo}:${String(relation.codigo_homologo)}`,
            ),
            groupId: groupIdByCode.get(relation.codigo_unificador) as string,
            externalCode: String(relation.codigo_homologo),
            externalBrand: relation.marca_homologo,
            // The client-approved search rule exposes only active and approved homologs.
            active: true,
            approvalStatus: 'approved',
            source: 'import',
          })),
        )
        .onConflictDoNothing();
    }

    if (CLIENT_TEMPLATE_MANIFEST.relations.oem.length > 0) {
      await tx
        .insert(groupOemCodes)
        .values(
          CLIENT_TEMPLATE_MANIFEST.relations.oem.map((relation) => ({
            id: deterministicDemoUuid(
              'group-oem-code',
              `${relation.codigo_unificador}:${String(relation.codigo_oem)}`,
            ),
            groupId: groupIdByCode.get(relation.codigo_unificador) as string,
            oemCode: String(relation.codigo_oem),
            brands: [relation.marca],
            active: true,
            approvalStatus: 'approved',
            source: 'import',
          })),
        )
        .onConflictDoNothing();
    }

    // Persist the complete three-level CATEGORIAS-BUSQUEDA taxonomy. Leaves without a supplied
    // template and branches without a defined descendant remain visible only when inactive
    // categories are requested; no synthetic schemas are created for them.
    const categoryIdBySlug = new Map<string, string>();
    for (const level of [1, 2, 3] as const) {
      const levelSeeds = DEMO_CATEGORY_SEEDS.filter((category) => category.level === level);
      for (const category of levelSeeds) {
        if (category.parentSlug && !categoryIdBySlug.has(category.parentSlug)) {
          throw new Error(
            `Missing level ${level - 1} parent category for ${category.slug}: ${category.parentSlug}`,
          );
        }
      }
      await tx
        .insert(catalogCategories)
        .values(
          levelSeeds.map((category) => ({
            id: deterministicDemoUuid('category', category.slug),
            parentId: category.parentSlug
              ? (categoryIdBySlug.get(category.parentSlug) as string)
              : null,
            slug: category.slug,
            name: category.name,
            path: category.path,
            application: category.application,
            sourcePriority: category.sourcePriority,
            position: category.position,
            active: category.active,
          })),
        )
        .onConflictDoUpdate({
          target: catalogCategories.slug,
          set: {
            parentId: sql.raw('excluded.parent_id'),
            name: sql.raw('excluded.name'),
            path: sql.raw('excluded.path'),
            application: sql.raw('excluded.application'),
            sourcePriority: sql.raw('excluded.source_priority'),
            position: sql.raw('excluded.position'),
            active: sql.raw('excluded.active'),
            updatedAt: sql`now()`,
          },
          // A category created independently with the same slug is not seed-owned.
          setWhere: sql`${catalogCategories.id} = excluded.id AND (
            ${catalogCategories.parentId}, ${catalogCategories.name}, ${catalogCategories.path},
            ${catalogCategories.application}, ${catalogCategories.sourcePriority},
            ${catalogCategories.position}, ${catalogCategories.active}
          ) IS DISTINCT FROM (
            excluded.parent_id, excluded.name, excluded.path, excluded.application,
            excluded.source_priority, excluded.position, excluded.active
          )`,
        });
      const levelRows = await tx
        .select({ id: catalogCategories.id, slug: catalogCategories.slug })
        .from(catalogCategories)
        .where(
          inArray(
            catalogCategories.slug,
            levelSeeds.map((category) => category.slug),
          ),
        );
      for (const row of levelRows) categoryIdBySlug.set(row.slug, row.id);
      requireAllNaturalKeys(
        `level ${level} categories`,
        levelSeeds.map((category) => category.slug),
        categoryIdBySlug,
      );
    }
    for (const slug of LEGACY_DEMO_CATEGORY_SLUGS) {
      await tx
        .update(catalogCategories)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(
            eq(catalogCategories.id, deterministicDemoUuid('category', slug)),
            eq(catalogCategories.slug, slug),
            eq(catalogCategories.active, true),
          ),
        );
    }
    // PIM(2) replaced the PIM(1) taxonomy wholesale. Clean up only rows whose UUIDs prove
    // seed ownership: an independently-created category/template is never deactivated by slug.
    for (const slug of PIM1_DEMO_CATEGORY_SLUGS) {
      await tx
        .update(catalogCategories)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(
            eq(catalogCategories.id, deterministicDemoUuid('category', slug)),
            eq(catalogCategories.slug, slug),
            eq(catalogCategories.active, true),
          ),
        );
    }
    await tx
      .update(attributeTemplates)
      .set({ status: 'retired', updatedAt: new Date() })
      .where(
        and(
          inArray(
            attributeTemplates.id,
            PIM1_DEMO_TEMPLATE_SLUGS.map((slug) =>
              deterministicDemoUuid('attribute-template', `${slug}:1`),
            ),
          ),
          eq(attributeTemplates.variantKey, 'legacy'),
          ne(attributeTemplates.status, 'retired'),
        ),
      );
    requireAllNaturalKeys(
      'categories',
      DEMO_CATEGORY_SEEDS.map((category) => category.slug),
      categoryIdBySlug,
    );

    await tx
      .insert(attributeDefinitions)
      .values(
        DEMO_ATTRIBUTE_SEEDS.map((attribute) => ({
          id: deterministicDemoUuid('attribute-definition', attribute.key),
          key: attribute.key,
          label: attribute.label,
          dataType: attribute.dataType,
          unit: attribute.unit,
          allowedValues: [],
          active: true,
          sourceAuthority: attribute.sourceAuthority,
        })),
      )
      .onConflictDoUpdate({
        target: attributeDefinitions.key,
        set: {
          label: sql.raw('excluded.label'),
          dataType: sql.raw('excluded.data_type'),
          unit: sql.raw('excluded.unit'),
          allowedValues: sql.raw('excluded.allowed_values'),
          active: true,
          sourceAuthority: sql.raw('excluded.source_authority'),
          updatedAt: sql`now()`,
        },
        setWhere: sql`${attributeDefinitions.id} = excluded.id AND (
          ${attributeDefinitions.label}, ${attributeDefinitions.dataType}, ${attributeDefinitions.unit},
          ${attributeDefinitions.allowedValues}, ${attributeDefinitions.active}, ${attributeDefinitions.sourceAuthority}
        ) IS DISTINCT FROM (
          excluded.label, excluded.data_type, excluded.unit, excluded.allowed_values,
          excluded.active, excluded.source_authority
        )`,
      });
    await tx
      .update(attributeDefinitions)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(
            attributeDefinitions.id,
            deterministicDemoUuid('attribute-definition', 'descripcion_tecnica'),
          ),
          eq(attributeDefinitions.key, 'descripcion_tecnica'),
          eq(attributeDefinitions.active, true),
        ),
      );
    const definitionRows = await tx
      .select({ id: attributeDefinitions.id, key: attributeDefinitions.key })
      .from(attributeDefinitions)
      .where(
        inArray(
          attributeDefinitions.key,
          DEMO_ATTRIBUTE_SEEDS.map((attribute) => attribute.key),
        ),
      );
    const definitionIdByKey = new Map(definitionRows.map((row) => [row.key, row.id]));
    requireAllNaturalKeys(
      'attribute definitions',
      DEMO_ATTRIBUTE_SEEDS.map((attribute) => attribute.key),
      definitionIdByKey,
    );

    for (const template of DEMO_TEMPLATE_SEEDS) {
      const id = demoTemplateId(template);
      await tx
        .update(attributeTemplates)
        .set({
          categoryId: categoryIdBySlug.get(template.categorySlug) as string,
          variantKey: manifestTemplateVariantKey(template),
          updatedAt: new Date(),
        })
        .where(and(eq(attributeTemplates.id, id), eq(attributeTemplates.variantKey, 'legacy')));
    }

    await tx
      .insert(attributeTemplates)
      .values(
        DEMO_TEMPLATE_SEEDS.map((template) => ({
          id: demoTemplateId(template),
          categoryId: categoryIdBySlug.get(template.categorySlug) as string,
          variantKey: manifestTemplateVariantKey(template),
          name: template.name,
          version: 1,
          status: 'active',
        })),
      )
      .onConflictDoUpdate({
        target: [
          attributeTemplates.categoryId,
          attributeTemplates.variantKey,
          attributeTemplates.version,
        ],
        set: {
          name: sql.raw('excluded.name'),
          status: sql.raw('excluded.status'),
          updatedAt: sql`now()`,
        },
        setWhere: sql`${attributeTemplates.id} = excluded.id AND (
          ${attributeTemplates.name}, ${attributeTemplates.status}
        ) IS DISTINCT FROM (excluded.name, excluded.status)`,
      });
    const templateRows = await tx
      .select({
        id: attributeTemplates.id,
        categoryId: attributeTemplates.categoryId,
        variantKey: attributeTemplates.variantKey,
      })
      .from(attributeTemplates)
      .where(
        and(
          inArray(
            attributeTemplates.categoryId,
            DEMO_TEMPLATE_SEEDS.map(
              (template) => categoryIdBySlug.get(template.categorySlug) as string,
            ),
          ),
          eq(attributeTemplates.version, 1),
        ),
      );
    const templateIdByKey = new Map(
      templateRows.map((row) => [demoTemplateKey(row.categoryId, row.variantKey), row.id]),
    );
    requireAllNaturalKeys(
      'attribute templates',
      DEMO_TEMPLATE_SEEDS.map((template) =>
        demoTemplateKey(
          categoryIdBySlug.get(template.categorySlug) as string,
          manifestTemplateVariantKey(template),
        ),
      ),
      templateIdByKey,
    );
    const seedOwnedTemplateIds = new Set(
      DEMO_TEMPLATE_SEEDS.map((template) => {
        const categoryId = categoryIdBySlug.get(template.categorySlug) as string;
        const templateId = templateIdByKey.get(
          demoTemplateKey(categoryId, manifestTemplateVariantKey(template)),
        ) as string;
        return templateId === demoTemplateId(template) ? templateId : null;
      }).filter((templateId): templateId is string => templateId !== null),
    );

    const assetRequirements = DEMO_TEMPLATE_ASSET_REQUIREMENTS.flatMap((template) => {
      const categoryId = categoryIdBySlug.get(template.categorySlug) as string;
      const templateId = templateIdByKey.get(
        demoTemplateKey(categoryId, template.templateVariantKey),
      ) as string;
      return template.assets.map((asset) => ({
        templateId,
        typeCode: asset.type,
        required: asset.required,
        active: true,
      }));
    });
    const seedOwnedAssetRequirements = assetRequirements.filter((requirement) =>
      seedOwnedTemplateIds.has(requirement.templateId),
    );
    if (seedOwnedAssetRequirements.length > 0) {
      await tx
        .insert(templateAssetRequirements)
        .values(seedOwnedAssetRequirements)
        .onConflictDoUpdate({
          target: [templateAssetRequirements.templateId, templateAssetRequirements.typeCode],
          set: {
            required: sql.raw('excluded.required'),
            active: sql.raw('excluded.active'),
            updatedAt: sql`now()`,
          },
          setWhere: sql`(
            ${templateAssetRequirements.required}, ${templateAssetRequirements.active}
          ) IS DISTINCT FROM (excluded.required, excluded.active)`,
        });
    }
    const externalAssetRequirements = assetRequirements.filter(
      (requirement) => !seedOwnedTemplateIds.has(requirement.templateId),
    );
    if (externalAssetRequirements.length > 0) {
      await tx
        .insert(templateAssetRequirements)
        .values(externalAssetRequirements)
        .onConflictDoNothing();
    }
    if (seedOwnedTemplateIds.size > 0) {
      const expectedAssetRequirementKeys = new Set(
        seedOwnedAssetRequirements.map(
          (requirement) => `${requirement.templateId}:${requirement.typeCode}`,
        ),
      );
      const existingAssetRequirements = await tx
        .select({
          templateId: templateAssetRequirements.templateId,
          typeCode: templateAssetRequirements.typeCode,
          active: templateAssetRequirements.active,
        })
        .from(templateAssetRequirements)
        .where(inArray(templateAssetRequirements.templateId, [...seedOwnedTemplateIds]));
      const obsoleteAssetRequirements = existingAssetRequirements.filter(
        (requirement) =>
          requirement.active &&
          !expectedAssetRequirementKeys.has(`${requirement.templateId}:${requirement.typeCode}`),
      );
      for (const requirement of obsoleteAssetRequirements) {
        await tx
          .update(templateAssetRequirements)
          .set({ active: false, updatedAt: new Date() })
          .where(
            and(
              eq(templateAssetRequirements.templateId, requirement.templateId),
              eq(templateAssetRequirements.typeCode, requirement.typeCode),
              eq(templateAssetRequirements.active, true),
            ),
          );
      }
    }

    const templateAssignments = DEMO_TEMPLATE_SEEDS.flatMap((template) => {
      const categoryId = categoryIdBySlug.get(template.categorySlug) as string;
      const templateId = templateIdByKey.get(
        demoTemplateKey(categoryId, manifestTemplateVariantKey(template)),
      ) as string;
      return template.attributes.map((attribute, position) => ({
        templateId,
        attributeDefinitionId: definitionIdByKey.get(attribute.key) as string,
        position,
        required: attribute.required,
        // Runtime propagation uses the equivalence group keyed by codigoUnificador.
        replicable: attribute.replicable,
        active: true,
        searchable: attribute.searchable,
        includeInTechnicalSheet: attribute.includeInTechnicalSheet,
      }));
    });
    const seedOwnedTemplateAssignments = templateAssignments.filter((assignment) =>
      seedOwnedTemplateIds.has(assignment.templateId),
    );
    if (seedOwnedTemplateAssignments.length > 0) {
      await tx
        .insert(templateAttributeAssignments)
        .values(seedOwnedTemplateAssignments)
        .onConflictDoUpdate({
          target: [
            templateAttributeAssignments.templateId,
            templateAttributeAssignments.attributeDefinitionId,
          ],
          set: {
            position: sql.raw('excluded.position'),
            required: sql.raw('excluded.required'),
            replicable: sql.raw('excluded.replicable'),
            active: sql.raw('excluded.active'),
            searchable: sql.raw('excluded.searchable'),
            includeInTechnicalSheet: sql.raw('excluded.include_in_technical_sheet'),
            updatedAt: sql`now()`,
          },
          setWhere: sql`(
            ${templateAttributeAssignments.position}, ${templateAttributeAssignments.required},
            ${templateAttributeAssignments.replicable}, ${templateAttributeAssignments.active},
            ${templateAttributeAssignments.searchable}, ${templateAttributeAssignments.includeInTechnicalSheet}
          ) IS DISTINCT FROM (
            excluded.position, excluded.required, excluded.replicable, excluded.active,
            excluded.searchable, excluded.include_in_technical_sheet
          )`,
        });
    }
    const externalTemplateAssignments = templateAssignments.filter(
      (assignment) => !seedOwnedTemplateIds.has(assignment.templateId),
    );
    if (externalTemplateAssignments.length > 0) {
      await tx
        .insert(templateAttributeAssignments)
        .values(externalTemplateAssignments)
        .onConflictDoNothing();
    }
    if (seedOwnedTemplateIds.size > 0) {
      const expectedAssignmentKeys = new Set(
        seedOwnedTemplateAssignments.map(
          (assignment) => `${assignment.templateId}:${assignment.attributeDefinitionId}`,
        ),
      );
      const existingAssignments = await tx
        .select({
          templateId: templateAttributeAssignments.templateId,
          attributeDefinitionId: templateAttributeAssignments.attributeDefinitionId,
          definitionKey: attributeDefinitions.key,
          active: templateAttributeAssignments.active,
        })
        .from(templateAttributeAssignments)
        .innerJoin(
          attributeDefinitions,
          eq(attributeDefinitions.id, templateAttributeAssignments.attributeDefinitionId),
        )
        .where(inArray(templateAttributeAssignments.templateId, [...seedOwnedTemplateIds]));
      const obsoleteAssignments = existingAssignments.filter(
        (assignment) =>
          assignment.active &&
          assignment.attributeDefinitionId ===
            deterministicDemoUuid('attribute-definition', assignment.definitionKey) &&
          !expectedAssignmentKeys.has(
            `${assignment.templateId}:${assignment.attributeDefinitionId}`,
          ),
      );
      for (const assignment of obsoleteAssignments) {
        await tx
          .update(templateAttributeAssignments)
          .set({ active: false, updatedAt: new Date() })
          .where(
            and(
              eq(templateAttributeAssignments.templateId, assignment.templateId),
              eq(
                templateAttributeAssignments.attributeDefinitionId,
                assignment.attributeDefinitionId,
              ),
              eq(templateAttributeAssignments.active, true),
            ),
          );
      }
    }

    const roleAccess = DEMO_TEMPLATE_SEEDS.flatMap((template) => {
      const categoryId = categoryIdBySlug.get(template.categorySlug) as string;
      const templateId = templateIdByKey.get(
        demoTemplateKey(categoryId, manifestTemplateVariantKey(template)),
      ) as string;
      return template.attributes.flatMap((attribute) =>
        CLIENT_TEMPLATE_ROLES.map((role) => ({
          templateId,
          attributeDefinitionId: definitionIdByKey.get(attribute.key) as string,
          role,
          ...attribute.roles[role],
        })),
      );
    });
    const seedOwnedRoleAccess = roleAccess.filter((access) =>
      seedOwnedTemplateIds.has(access.templateId),
    );
    if (seedOwnedRoleAccess.length > 0) {
      await tx
        .insert(templateAttributeRoleAccess)
        .values(seedOwnedRoleAccess)
        .onConflictDoUpdate({
          target: [
            templateAttributeRoleAccess.templateId,
            templateAttributeRoleAccess.attributeDefinitionId,
            templateAttributeRoleAccess.role,
          ],
          set: {
            canView: sql.raw('excluded.can_view'),
            canEdit: sql.raw('excluded.can_edit'),
            canImport: sql.raw('excluded.can_import'),
            canExport: sql.raw('excluded.can_export'),
          },
          setWhere: sql`(
            ${templateAttributeRoleAccess.canView}, ${templateAttributeRoleAccess.canEdit},
            ${templateAttributeRoleAccess.canImport}, ${templateAttributeRoleAccess.canExport}
          ) IS DISTINCT FROM (
            excluded.can_view, excluded.can_edit, excluded.can_import, excluded.can_export
          )`,
        });
    }
    const externalRoleAccess = roleAccess.filter(
      (access) => !seedOwnedTemplateIds.has(access.templateId),
    );
    if (externalRoleAccess.length > 0) {
      await tx.insert(templateAttributeRoleAccess).values(externalRoleAccess).onConflictDoNothing();
    }

    const productTemplates = DEMO_PRODUCT_SEEDS.map((seed) => ({
      productId: productIdBySku.get(seed.sku) as string,
      templateId: templateIdByKey.get(
        demoTemplateKey(categoryIdBySlug.get(seed.categorySlug) as string, seed.templateVariantKey),
      ) as string,
      seedOwned: productIdBySku.get(seed.sku) === deterministicDemoUuid('product', seed.sku),
    }));
    const seedOwnedProductTemplates = productTemplates
      .filter((assignment) => assignment.seedOwned)
      .map(({ productId, templateId }) => ({ productId, templateId }));
    if (seedOwnedProductTemplates.length > 0) {
      await tx
        .insert(productTemplateAssignments)
        .values(seedOwnedProductTemplates)
        .onConflictDoUpdate({
          target: productTemplateAssignments.productId,
          set: { templateId: sql.raw('excluded.template_id'), assignedAt: sql`now()` },
          setWhere: sql`${productTemplateAssignments.templateId} IS DISTINCT FROM excluded.template_id`,
        });
    }
    const externalProductTemplates = productTemplates
      .filter((assignment) => !assignment.seedOwned)
      .map(({ productId, templateId }) => ({ productId, templateId }));
    if (externalProductTemplates.length > 0) {
      await tx
        .insert(productTemplateAssignments)
        .values(externalProductTemplates)
        .onConflictDoNothing();
    }

    const attributeValues = DEMO_PRODUCT_SEEDS.flatMap((seed) => {
      const productId = productIdBySku.get(seed.sku) as string;
      const common = {
        productId,
        confidence: 1,
        version: 1,
        validFrom: new Date(seed.sourceUpdatedAt),
        updatedAt: new Date(seed.sourceUpdatedAt),
      };
      return Object.entries(seed.values).map(([key, value]) => {
        const definition = DEMO_DEFINITION_BY_KEY.get(key);
        if (!definition) throw new Error(`Unknown seeded attribute definition: ${key}`);
        return {
          ...common,
          attributeDefinitionId: definitionIdByKey.get(key) as string,
          source: definition.sourceAuthority === 'erp' ? 'erp' : 'import',
          seedOwned: productId === deterministicDemoUuid('product', seed.sku),
          ...toStoredAttributeValue(value, definition.dataType),
        };
      });
    });
    const seedOwnedAttributeValues = attributeValues
      .filter((value) => value.seedOwned)
      .map(({ seedOwned: _seedOwned, ...value }) => value);
    if (seedOwnedAttributeValues.length > 0) {
      await tx
        .insert(productAttributeValues)
        .values(seedOwnedAttributeValues)
        .onConflictDoUpdate({
          target: [productAttributeValues.productId, productAttributeValues.attributeDefinitionId],
          set: {
            valueText: sql.raw('excluded.value_text'),
            valueNumber: sql.raw('excluded.value_number'),
            valueBoolean: sql.raw('excluded.value_boolean'),
            valueDate: sql.raw('excluded.value_date'),
            valueJson: sql.raw('excluded.value_json'),
            source: sql.raw('excluded.source'),
            confidence: sql.raw('excluded.confidence'),
            version: sql`${productAttributeValues.version} + 1`,
            validFrom: sql.raw('excluded.valid_from'),
            updatedAt: sql.raw('excluded.updated_at'),
            deletedAt: null,
          },
          // Manual curation wins over a later seed regeneration.
          setWhere: and(
            inArray(productAttributeValues.source, ['erp', 'import']),
            sql`(
              ${productAttributeValues.valueText}, ${productAttributeValues.valueNumber},
              ${productAttributeValues.valueBoolean}, ${productAttributeValues.valueDate},
              ${productAttributeValues.valueJson}, ${productAttributeValues.source},
              ${productAttributeValues.confidence}
            ) IS DISTINCT FROM (
              excluded.value_text, excluded.value_number, excluded.value_boolean,
              excluded.value_date, excluded.value_json, excluded.source, excluded.confidence
            )`,
          ),
        });
    }
    const externalAttributeValues = attributeValues
      .filter((value) => !value.seedOwned)
      .map(({ seedOwned: _seedOwned, ...value }) => value);
    if (externalAttributeValues.length > 0) {
      await tx.insert(productAttributeValues).values(externalAttributeValues).onConflictDoNothing();
    }

    return {
      productsInserted: insertedProducts.length,
      identifiersInserted: insertedIdentifiers.length,
      groupsInserted: insertedGroups.length,
      membershipsInserted: insertedMemberships.length,
    };
  });

  // Index the bounded, workbook-backed sample here so semantic search works immediately after
  // `db:seed:demo`. Runtime/full-catalogue re-indexing remains an asynchronous worker concern.
  const repository = new DrizzleProductRepository(db);
  const vectorIndex = new DrizzleProductVectorIndex(db);
  const embeddings = new FakeEmbeddingAdapter('fake-embedding-v1', EMBEDDING_DIMENSIONS);
  const indexProduct = new IndexProductUseCase(repository, embeddings, vectorIndex);
  let embeddingsIndexed = 0;

  for (const seed of DEMO_PRODUCT_SEEDS) {
    const product = await repository.findBySku(seed.sku);
    if (!product) throw new Error(`Could not resolve demo product for embedding: ${seed.sku}`);
    if ((await indexProduct.execute(product.id)).indexed) embeddingsIndexed += 1;
  }

  return { ...catalogResult, embeddingsIndexed };
}

function applicationTypeForGroup(unifiedCode: string): string | null {
  const applications = DEMO_PRODUCT_SEEDS.filter((seed) => seed.unifiedCode === unifiedCode)
    .map((seed) => seed.values.tipo_aplicacion)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  return applications[0] ?? null;
}

function toStoredAttributeValue(
  value: ClientAttributeValue,
  dataType: ClientAttributeDataType,
): {
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueDate: string | null;
  valueJson: null;
} {
  const empty = {
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueDate: null,
    valueJson: null,
  };
  if (dataType === 'number' || dataType === 'measurement') {
    return { ...empty, valueNumber: value as number };
  }
  if (dataType === 'boolean') return { ...empty, valueBoolean: value as boolean };
  if (dataType === 'date') return { ...empty, valueDate: value as string };
  return { ...empty, valueText: value as string };
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const naturalKey = key(value);
    if (seen.has(naturalKey)) return false;
    seen.add(naturalKey);
    return true;
  });
}

function requireAllNaturalKeys(
  resource: string,
  expected: readonly string[],
  actual: ReadonlyMap<string, string>,
): void {
  const missing = expected.filter((key) => !actual.has(key));
  if (missing.length > 0) {
    throw new Error(`Could not resolve demo ${resource}: ${missing.join(', ')}`);
  }
}
