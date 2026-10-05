import { createHash } from 'node:crypto';

import { type Uuid, assertUuid } from '@cdr/shared';
import { inArray } from 'drizzle-orm';

import type { Database } from './drizzle.client';
import {
  attributeDefinitions,
  attributeTemplates,
  catalogCategories,
  productAttributeValues,
  productTemplateAssignments,
  templateAttributeAssignments,
  templateAttributeRoleAccess,
} from '../modules/catalog-schema/infrastructure/persistence/catalog-schema.tables';
import {
  equivalenceGroupMembers,
  equivalenceGroups,
  externalHomologs,
  groupApplications,
  productIdentifiers,
  products,
} from './schema';

/**
 * A small, source-backed catalogue for local development and automated tests.
 *
 * These seven rows are the non-illustrative records from the former platform seed. That
 * seed records their provenance as PLANTILLAS_PIM.xlsx. The fixture also maps those rows
 * into persisted categories, active template versions and source-backed dynamic attributes.
 * ERP flags without supplied values remain unset. Former lifecycle values map to the
 * current vocabulary as REVIEW -> in_review and APPROVED -> published.
 */
export const DEMO_PRODUCT_SEEDS = [
  {
    sku: '6202-2RSR-L038-C3',
    supplierCode: '6202-2RSR-L038-C3',
    unifiedCode: '6202-2RS',
    name: 'Rodamiento rígido de bolas 6202',
    brand: 'FAG',
    status: 'in_review',
    description:
      'Rodamiento rígido de bolas FAG con sellos de caucho, juego radial C3 y lubricante L038.',
    sourceUpdatedAt: '2026-09-24T16:05:00-05:00',
    categorySlug: 'rodamientos-rigidos-de-bolas',
  },
  {
    sku: '1200-TVH-C3',
    supplierCode: '1200-TVH-C3',
    unifiedCode: '1200-TVH',
    name: 'Rodamiento de bolas autoalineable',
    brand: 'FAG',
    status: 'in_review',
    description: null,
    sourceUpdatedAt: '2026-09-23T10:10:00-05:00',
    categorySlug: 'rodamientos-de-bolas-autoalineables',
  },
  {
    sku: 'CDR-0000016843',
    supplierCode: 'ACEITE FULL SINTETICO SAE 0W20 SP 1LT',
    unifiedCode: '0W20-1L',
    name: 'Aceite full sintético SAE 0W-20 SP',
    brand: 'GOODYEAR LUBRICANTES',
    status: 'in_review',
    description: null,
    sourceUpdatedAt: '2026-09-22T09:35:00-05:00',
    categorySlug: 'aceites-de-motor',
  },
  {
    sku: 'D1672',
    supplierCode: 'D1672-CARBON TECHNOLOGY',
    unifiedCode: 'D1672',
    name: 'Pastilla de freno D1672',
    brand: 'OKAMI FRENOS',
    status: 'in_review',
    description: null,
    sourceUpdatedAt: '2026-09-21T11:20:00-05:00',
    categorySlug: 'pastillas-de-freno',
  },
  {
    sku: 'CDR-0000000933',
    supplierCode: 'GRASA AZUL G2 1/4LB',
    unifiedCode: 'AZUL G2-1/4LB',
    name: 'Grasa azul G2 1/4 LB',
    brand: 'OKAMI GRASAS',
    status: 'published',
    description: 'Grasa multipropósito de complejo de litio, grado NLGI 2.',
    sourceUpdatedAt: '2026-09-20T14:30:00-05:00',
    categorySlug: 'grasas',
  },
  {
    sku: 'CDR-0000014230',
    supplierCode: '25-32-4 TC FKM VITON',
    unifiedCode: '25-32-4 VITON',
    name: 'Retenedor métrico 25 × 32 × 4',
    brand: 'NAK EQUIPO ORIGINAL',
    status: 'published',
    description: null,
    sourceUpdatedAt: '2026-09-19T09:48:00-05:00',
    categorySlug: 'retenedores-metricos',
  },
  {
    sku: 'CDR-0000024151',
    supplierCode: 'OKD-000001',
    unifiedCode: '569091',
    name: 'Disco de freno ventilado',
    brand: 'OKAMI DISCOS-TAMBOR',
    status: 'published',
    description: null,
    sourceUpdatedAt: '2026-09-18T16:10:00-05:00',
    categorySlug: 'discos-de-freno',
  },
] as const;

export const DEMO_CATEGORY_SEEDS = [
  { slug: 'aceites-de-motor', name: 'Aceites de motor' },
  { slug: 'discos-de-freno', name: 'Discos de freno' },
  { slug: 'grasas', name: 'Grasas' },
  { slug: 'pastillas-de-freno', name: 'Pastillas de freno' },
  { slug: 'retenedores-metricos', name: 'Retenedores métricos' },
  { slug: 'rodamientos-de-bolas-autoalineables', name: 'Rodamientos de bolas autoalineables' },
  { slug: 'rodamientos-rigidos-de-bolas', name: 'Rodamientos rígidos de bolas' },
] as const;

const DEMO_ATTRIBUTE_SEEDS = [
  {
    key: 'codigo_unificador',
    label: 'Código unificador',
    dataType: 'text',
    sourceAuthority: 'erp',
    searchable: true,
    required: true,
    replicable: true,
  },
  {
    key: 'codigo_proveedor',
    label: 'Código de proveedor',
    dataType: 'text',
    sourceAuthority: 'erp',
    searchable: true,
    required: true,
    replicable: false,
  },
  {
    key: 'descripcion_tecnica',
    label: 'Descripción técnica',
    dataType: 'text',
    sourceAuthority: 'pim',
    searchable: true,
    required: false,
    replicable: true,
  },
  {
    key: 'bloqueado_compra',
    label: 'Bloqueado para compra',
    dataType: 'boolean',
    sourceAuthority: 'erp',
    searchable: true,
    required: false,
    replicable: false,
  },
  {
    key: 'bloqueado_venta',
    label: 'Bloqueado para venta',
    dataType: 'boolean',
    sourceAuthority: 'erp',
    searchable: true,
    required: false,
    replicable: false,
  },
  {
    key: 'frecuencia_articulo',
    label: 'Frecuencia del artículo',
    dataType: 'text',
    sourceAuthority: 'erp',
    searchable: true,
    required: false,
    replicable: false,
  },
] as const;

export type DemoSeedEnvironment = 'local' | 'test';

export interface DemoSeedResult {
  readonly productsInserted: number;
  readonly identifiersInserted: number;
  readonly groupsInserted: number;
  readonly membershipsInserted: number;
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

export function assertDemoSeedEnvironment(value: string): asserts value is DemoSeedEnvironment {
  if (value !== 'local' && value !== 'test') {
    throw new Error(
      `Demo data can only be seeded with APP_ENV=local or APP_ENV=test; received "${value}".`,
    );
  }
}

/**
 * Adds missing demo rows without changing records that already exist.
 *
 * Resolving products and groups by their natural keys after INSERT is intentional: an
 * operator may already have a row with the same SKU/code but a different UUID. The seed
 * then attaches only missing identifiers/memberships to that existing row and never
 * replaces its business fields.
 */
export async function seedDemoCatalog(db: Database): Promise<DemoSeedResult> {
  return db.transaction(async (tx) => {
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
      .onConflictDoNothing()
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
        DEMO_PRODUCT_SEEDS.map((seed) => ({
          id: deterministicDemoUuid('equivalence-group', seed.unifiedCode),
          code: seed.unifiedCode,
          // The source supplies the code but no separate group label. Reusing it avoids
          // inventing a commercial name that the client has not approved.
          name: seed.unifiedCode,
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
          DEMO_PRODUCT_SEEDS.map((seed) => seed.unifiedCode),
        ),
      );
    const groupIdByCode = new Map(groupRows.map((row) => [row.code, row.id]));
    requireAllNaturalKeys(
      'equivalence groups',
      DEMO_PRODUCT_SEEDS.map((seed) => seed.unifiedCode),
      groupIdByCode,
    );

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

    // Demonstration-only relations make the operational screens verifiable without
    // presenting them as approved master data. They remain clearly marked and may be
    // replaced by the client's definitive application and homolog imports.
    const d1672GroupId = groupIdByCode.get('D1672');
    if (d1672GroupId) {
      await tx
        .insert(groupApplications)
        .values({
          id: deterministicDemoUuid('group-application', 'D1672:AUTOMOTRIZ'),
          groupId: d1672GroupId,
          vehicleType: 'AUTOMOTRIZ',
          notes: 'Compatibilidad demostrativa; requiere validación del cliente',
          source: 'manual',
        })
        .onConflictDoNothing();

      await tx
        .insert(externalHomologs)
        .values({
          id: deterministicDemoUuid('external-homolog', 'D1672:DEMO:D1672-DEMO'),
          groupId: d1672GroupId,
          externalCode: 'D1672-DEMO',
          externalBrand: 'DEMO',
          active: true,
          approvalStatus: 'approved',
          source: 'manual',
        })
        .onConflictDoNothing();
    }

    // Minimal dynamic catalogue fixture. Values come only from the source-backed seed
    // above; the role matrix is deliberately permissive demo configuration, not a client
    // policy decision.
    await tx
      .insert(catalogCategories)
      .values(
        DEMO_CATEGORY_SEEDS.map((category, position) => ({
          id: deterministicDemoUuid('category', category.slug),
          parentId: null,
          slug: category.slug,
          name: category.name,
          path: category.slug,
          position,
          active: true,
        })),
      )
      .onConflictDoNothing();
    const categoryRows = await tx
      .select({ id: catalogCategories.id, slug: catalogCategories.slug })
      .from(catalogCategories)
      .where(
        inArray(
          catalogCategories.slug,
          DEMO_CATEGORY_SEEDS.map((category) => category.slug),
        ),
      );
    const categoryIdBySlug = new Map(categoryRows.map((row) => [row.slug, row.id]));

    await tx
      .insert(attributeDefinitions)
      .values(
        DEMO_ATTRIBUTE_SEEDS.map((attribute) => ({
          id: deterministicDemoUuid('attribute-definition', attribute.key),
          key: attribute.key,
          label: attribute.label,
          dataType: attribute.dataType,
          allowedValues: [],
          active: true,
          sourceAuthority: attribute.sourceAuthority,
        })),
      )
      .onConflictDoNothing();
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

    await tx
      .insert(attributeTemplates)
      .values(
        DEMO_CATEGORY_SEEDS.map((category) => ({
          id: deterministicDemoUuid('attribute-template', `${category.slug}:1`),
          categoryId: categoryIdBySlug.get(category.slug) as string,
          name: `Plantilla ${category.name}`,
          version: 1,
          status: 'active',
        })),
      )
      .onConflictDoNothing();
    const templateRows = await tx
      .select({ id: attributeTemplates.id, categoryId: attributeTemplates.categoryId })
      .from(attributeTemplates)
      .where(inArray(attributeTemplates.categoryId, [...categoryIdBySlug.values()]));
    const templateIdByCategoryId = new Map(templateRows.map((row) => [row.categoryId, row.id]));

    const templateAssignments = DEMO_CATEGORY_SEEDS.flatMap((category) => {
      const categoryId = categoryIdBySlug.get(category.slug) as string;
      const templateId = templateIdByCategoryId.get(categoryId) as string;
      return DEMO_ATTRIBUTE_SEEDS.map((attribute, position) => ({
        templateId,
        attributeDefinitionId: definitionIdByKey.get(attribute.key) as string,
        position,
        required: attribute.required,
        replicable: attribute.replicable,
        active: true,
        searchable: attribute.searchable,
        includeInTechnicalSheet: attribute.key === 'descripcion_tecnica',
      }));
    });
    await tx.insert(templateAttributeAssignments).values(templateAssignments).onConflictDoNothing();

    await tx
      .insert(templateAttributeRoleAccess)
      .values(
        templateAssignments.flatMap((assignment) => [
          {
            templateId: assignment.templateId,
            attributeDefinitionId: assignment.attributeDefinitionId,
            role: 'ADMINISTRADOR',
            canView: true,
            canEdit: true,
            canImport: true,
            canExport: true,
          },
          {
            templateId: assignment.templateId,
            attributeDefinitionId: assignment.attributeDefinitionId,
            role: 'COMPRAS',
            canView: true,
            canEdit: true,
            canImport: true,
            canExport: true,
          },
          {
            templateId: assignment.templateId,
            attributeDefinitionId: assignment.attributeDefinitionId,
            role: 'VENTAS',
            canView: true,
            canEdit: false,
            canImport: false,
            canExport: true,
          },
        ]),
      )
      .onConflictDoNothing();

    await tx
      .insert(productTemplateAssignments)
      .values(
        DEMO_PRODUCT_SEEDS.map((seed) => ({
          productId: productIdBySku.get(seed.sku) as string,
          templateId: templateIdByCategoryId.get(
            categoryIdBySlug.get(seed.categorySlug) as string,
          ) as string,
        })),
      )
      .onConflictDoNothing();

    await tx
      .insert(productAttributeValues)
      .values(
        DEMO_PRODUCT_SEEDS.flatMap((seed) => {
          const common = {
            productId: productIdBySku.get(seed.sku) as string,
            source: 'erp',
            confidence: 1,
            version: 1,
            validFrom: new Date(seed.sourceUpdatedAt),
            updatedAt: new Date(seed.sourceUpdatedAt),
          };
          return [
            {
              ...common,
              attributeDefinitionId: definitionIdByKey.get('codigo_unificador') as string,
              valueText: seed.unifiedCode,
            },
            {
              ...common,
              attributeDefinitionId: definitionIdByKey.get('codigo_proveedor') as string,
              valueText: seed.supplierCode,
            },
            ...(seed.description
              ? [
                  {
                    ...common,
                    source: 'manual',
                    attributeDefinitionId: definitionIdByKey.get('descripcion_tecnica') as string,
                    valueText: seed.description,
                  },
                ]
              : []),
          ];
        }),
      )
      .onConflictDoNothing();

    return {
      productsInserted: insertedProducts.length,
      identifiersInserted: insertedIdentifiers.length,
      groupsInserted: insertedGroups.length,
      membershipsInserted: insertedMemberships.length,
    };
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
