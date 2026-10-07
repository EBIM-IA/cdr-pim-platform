import { isUuid } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import {
  CLIENT_TEMPLATE_ASSET_TYPES,
  CLIENT_TEMPLATE_MANIFEST,
  assertClientTemplateManifest,
  type ClientManifestProduct,
  type ClientTemplateManifest,
} from './client-template-manifest';
import {
  DEMO_CATEGORY_SEEDS,
  DEMO_PRODUCT_SEEDS,
  DEMO_TEMPLATE_ASSET_REQUIREMENTS,
  DEMO_TEMPLATE_SEEDS,
  assertDemoSeedEnvironment,
  deterministicDemoUuid,
} from './demo-seed';

function withProduct(
  productIndex: number,
  overrides: Partial<ClientManifestProduct>,
): ClientTemplateManifest {
  let currentIndex = 0;
  let replaced = false;
  const templates = CLIENT_TEMPLATE_MANIFEST.templates.map((template) => ({
    ...template,
    products: template.products.map((product) => {
      if (currentIndex++ !== productIndex) return product;
      replaced = true;
      return { ...product, ...overrides };
    }),
  }));
  if (!replaced) throw new Error(`Missing manifest product at index ${productIndex}`);
  return { ...CLIENT_TEMPLATE_MANIFEST, templates };
}

function withRelations(
  relations: Partial<ClientTemplateManifest['relations']>,
): ClientTemplateManifest {
  return {
    ...CLIENT_TEMPLATE_MANIFEST,
    relations: { ...CLIENT_TEMPLATE_MANIFEST.relations, ...relations },
  };
}

describe('demo seed definition', () => {
  it('contains all 77 source-backed workbook products without illustrative rows', () => {
    const skus = DEMO_PRODUCT_SEEDS.map((seed) => seed.sku);

    expect(skus).toHaveLength(77);
    expect(new Set(skus).size).toBe(77);
    expect(skus).toContain('CDR-0000010489');
    expect(skus).toContain('D1672');
    expect(DEMO_PRODUCT_SEEDS.every((seed) => seed.status === 'in_review')).toBe(true);
  });

  it('keeps the 32 defined categories active and the four pending templates inactive', () => {
    expect(DEMO_CATEGORY_SEEDS).toHaveLength(36);
    expect(DEMO_TEMPLATE_SEEDS).toHaveLength(32);
    expect(DEMO_CATEGORY_SEEDS.filter((category) => category.active)).toHaveLength(32);
    expect(
      DEMO_CATEGORY_SEEDS.filter((category) => !category.active).map(({ name }) => name),
    ).toEqual([
      'Fitro de combustible (cilindrico)',
      'Fitro de combustible (estandar)',
      'Rodamientos cónicos',
      'KIT DE DISTRIBUCION',
    ]);
    expect(
      DEMO_CATEGORY_SEEDS.filter((category) => Object.keys(category.sourcePriority).length > 0),
    ).toHaveLength(20);
    expect(
      DEMO_CATEGORY_SEEDS.filter((category) => Object.keys(category.sourcePriority).length === 0),
    ).toHaveLength(16);
  });

  it('retains the five workbook asset types without inventing uploaded product files', () => {
    const assetTypes = new Set(
      DEMO_TEMPLATE_ASSET_REQUIREMENTS.flatMap((template) =>
        template.assets.map((asset) => asset.type),
      ),
    );

    expect([...assetTypes].sort()).toEqual([...CLIENT_TEMPLATE_ASSET_TYPES].sort());
    expect(
      DEMO_TEMPLATE_ASSET_REQUIREMENTS.flatMap((template) => template.assets).filter(
        (asset) => asset.required,
      ),
    ).toHaveLength(11);
  });

  it('validates generated counts, typed values and relation references', () => {
    expect(() => assertClientTemplateManifest(CLIENT_TEMPLATE_MANIFEST)).not.toThrow();
    expect(CLIENT_TEMPLATE_MANIFEST.source).toMatchObject({
      fileName: 'PLANTILLAS PIM(1) (1).xlsx',
      sheetCount: 36,
      templateCount: 32,
      productCount: 77,
    });
    expect(CLIENT_TEMPLATE_MANIFEST.definitions).toHaveLength(251);
    expect(CLIENT_TEMPLATE_MANIFEST.relations).toMatchObject({
      oem: expect.arrayContaining([expect.objectContaining({ codigo_unificador: 'R177.19' })]),
      homologs: expect.arrayContaining([expect.objectContaining({ codigo_unificador: 'R177.19' })]),
      applications: [expect.objectContaining({ codigo_unificador: 'R177.19' })],
    });
  });

  it('normalizes exclusively SI/NO workbook fields as booleans', () => {
    const booleanKeys = ['ecommerce', 'bloqueado_venta', 'bloqueado_compra'];
    for (const key of booleanKeys) {
      expect(
        CLIENT_TEMPLATE_MANIFEST.definitions.find((definition) => definition.key === key),
      ).toMatchObject({ dataType: 'boolean', sourceAuthority: 'erp' });
      const values = CLIENT_TEMPLATE_MANIFEST.templates.flatMap((template) =>
        template.products
          .map((product) => product.values[key])
          .filter((value) => value !== undefined),
      );
      expect(values.length).toBeGreaterThan(0);
      expect(values.every((value) => typeof value === 'boolean')).toBe(true);
    }
  });

  it('rejects a stale generated source count', () => {
    expect(() =>
      assertClientTemplateManifest({
        ...CLIENT_TEMPLATE_MANIFEST,
        source: { ...CLIENT_TEMPLATE_MANIFEST.source, productCount: 76 },
      }),
    ).toThrow(/product count/);
  });

  it('rejects invalid or duplicated source priorities inside a category', () => {
    const [firstCategory, ...remainingCategories] = CLIENT_TEMPLATE_MANIFEST.categories;
    expect(firstCategory).toBeDefined();
    const manifestWithInvalidPriorities = {
      ...CLIENT_TEMPLATE_MANIFEST,
      categories: [
        {
          ...firstCategory!,
          sourcePriority: { tecdoc: 1, fabricante: 1 },
        },
        ...remainingCategories,
      ],
    };

    expect(() => assertClientTemplateManifest(manifestWithInvalidPriorities)).toThrow(
      /source priorities/,
    );
  });

  it('requires a unique, non-blank provider code for every product', () => {
    expect(() => assertClientTemplateManifest(withProduct(0, { providerCode: '  ' }))).toThrow(
      /provider code.*non-blank/i,
    );

    const firstProviderCode = CLIENT_TEMPLATE_MANIFEST.templates[0]?.products[0]?.providerCode;
    expect(firstProviderCode).toBeDefined();
    expect(() =>
      assertClientTemplateManifest(withProduct(1, { providerCode: firstProviderCode! })),
    ).toThrow(/duplicate product provider codes/i);
  });

  it.each([
    ['sku', 64, 'SKU'],
    ['providerCode', 120, 'provider code'],
    ['unifiedCode', 120, 'unified code'],
    ['brand', 120, 'brand'],
    ['name', 300, 'name'],
  ] as const)('rejects product %s values longer than %i characters', (field, maximum, label) => {
    expect(() =>
      assertClientTemplateManifest(withProduct(0, { [field]: 'X'.repeat(maximum + 1) })),
    ).toThrow(new RegExp(`${label}.*${maximum}`, 'i'));
  });

  it('validates OEM and homolog fields against their write contracts', () => {
    const oem = CLIENT_TEMPLATE_MANIFEST.relations.oem[0]!;
    const homolog = CLIENT_TEMPLATE_MANIFEST.relations.homologs[0]!;

    expect(() =>
      assertClientTemplateManifest(withRelations({ oem: [{ ...oem, codigo_oem: '  ' }] })),
    ).toThrow(/OEM code.*non-blank/i);
    expect(() =>
      assertClientTemplateManifest(withRelations({ oem: [{ ...oem, marca: 'X'.repeat(161) }] })),
    ).toThrow(/OEM relation.*brand.*160/i);
    expect(() =>
      assertClientTemplateManifest(
        withRelations({ homologs: [{ ...homolog, codigo_homologo: 'X'.repeat(161) }] }),
      ),
    ).toThrow(/homolog code.*160/i);
    expect(() =>
      assertClientTemplateManifest(
        withRelations({ homologs: [{ ...homolog, marca_homologo: ' ' }] }),
      ),
    ).toThrow(/homolog brand.*non-blank/i);
  });

  it('validates application fields, years, derived type and persisted notes', () => {
    const application = CLIENT_TEMPLATE_MANIFEST.relations.applications[0]!;

    expect(() =>
      assertClientTemplateManifest(
        withRelations({
          applications: [{ ...application, marca_vehiculo: 'X'.repeat(161) }],
        }),
      ),
    ).toThrow(/invalid make.*160/i);
    expect(() =>
      assertClientTemplateManifest(
        withRelations({ applications: [{ ...application, modelo: ' ' }] }),
      ),
    ).toThrow(/invalid model.*non-blank/i);
    expect(() =>
      assertClientTemplateManifest(
        withRelations({ applications: [{ ...application, ano_desde: 1885 }] }),
      ),
    ).toThrow(/invalid ano_desde.*1886.*2200/i);
    expect(() =>
      assertClientTemplateManifest(
        withRelations({
          applications: [{ ...application, ano_desde: 2025, ano_hasta: 2024 }],
        }),
      ),
    ).toThrow(/ano_desde after ano_hasta/i);
    expect(() =>
      assertClientTemplateManifest(
        withRelations({ applications: [{ ...application, area: 'X'.repeat(1_995) }] }),
      ),
    ).toThrow(/notes exceed 2000/i);

    const applicationProduct = CLIENT_TEMPLATE_MANIFEST.templates
      .flatMap((template) => template.products)
      .findIndex((product) => product.unifiedCode === application.codigo_unificador);
    expect(applicationProduct).toBeGreaterThanOrEqual(0);
    const currentProduct = CLIENT_TEMPLATE_MANIFEST.templates
      .flatMap((template) => template.products)
      .at(applicationProduct)!;
    expect(() =>
      assertClientTemplateManifest(
        withProduct(applicationProduct, {
          values: { ...currentProduct.values, tipo_aplicacion: 'AUTOMOTRIZ E INDUSTRIAL' },
        }),
      ),
    ).toThrow(/requires one valid AUTOMOTRIZ\/INDUSTRIAL application type/i);
  });

  it('rejects duplicate natural keys for OEM, homolog and application relations', () => {
    const oem = CLIENT_TEMPLATE_MANIFEST.relations.oem[0]!;
    const homolog = CLIENT_TEMPLATE_MANIFEST.relations.homologs[0]!;
    const application = CLIENT_TEMPLATE_MANIFEST.relations.applications[0]!;

    expect(() =>
      assertClientTemplateManifest(
        withRelations({
          oem: [
            { ...oem, codigo_oem: 'OEM-CASE', marca: 'SUZUKI' },
            { ...oem, codigo_oem: 'oem-case', marca: 'CHEVROLET' },
          ],
        }),
      ),
    ).toThrow(/duplicate OEM relation natural keys/i);
    expect(() =>
      assertClientTemplateManifest(
        withRelations({
          homologs: [
            { ...homolog, codigo_homologo: 'HOMOLOG-CASE', marca_homologo: 'SKF' },
            { ...homolog, codigo_homologo: 'homolog-case', marca_homologo: 'skf' },
          ],
        }),
      ),
    ).toThrow(/duplicate homolog relation natural keys/i);
    expect(() =>
      assertClientTemplateManifest(
        withRelations({
          applications: [
            { ...application, marca_vehiculo: 'SUZUKI', modelo: 'S-CROSS', area: 'EJE' },
            { ...application, marca_vehiculo: 'suzuki', modelo: 's-cross', area: 'RUEDA' },
          ],
        }),
      ),
    ).toThrow(/duplicate application relation natural keys/i);
  });

  it('generates stable, scoped UUIDs', () => {
    const first = deterministicDemoUuid('product', 'D1672');

    expect(isUuid(first)).toBe(true);
    expect(deterministicDemoUuid('product', 'D1672')).toBe(first);
    expect(deterministicDemoUuid('equivalence-group', 'D1672')).not.toBe(first);
  });

  it.each(['local', 'test'])('allows %s explicitly', (environment) => {
    expect(() => assertDemoSeedEnvironment(environment)).not.toThrow();
  });

  it.each(['qas', 'prd', '', 'development'])('rejects %s', (environment) => {
    expect(() => assertDemoSeedEnvironment(environment)).toThrow(/APP_ENV=local or APP_ENV=test/);
  });
});
