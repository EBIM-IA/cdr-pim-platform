import { createHash } from 'node:crypto';

import { type Uuid, assertUuid } from '@cdr/shared';
import { inArray } from 'drizzle-orm';

import type { Database } from './drizzle.client';
import { equivalenceGroupMembers, equivalenceGroups, productIdentifiers, products } from './schema';

/**
 * A small, source-backed catalogue for local development and automated tests.
 *
 * These seven rows are the non-illustrative records from the former platform seed. That
 * seed records their provenance as PLANTILLAS_PIM.xlsx. The current schema deliberately
 * has no category, attribute, quality or provenance tables yet, so this adapter persists
 * only fields that have an honest destination today. The former lifecycle values map to
 * the current vocabulary as REVIEW -> in_review and APPROVED -> published.
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
