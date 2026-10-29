import type { ProductNameConfig, ProductNameToken } from '@cdr/contracts';
import { describe, expect, it } from 'vitest';

import {
  categoryDisplayName,
  DEFAULT_PRODUCT_NAME_CONFIG,
  filterSalesVariants,
  generalProductName,
  productVariants,
  type NamingApplication,
  type ProductNamingContext,
} from './product-naming';

const app = (overrides: Partial<NamingApplication> = {}): NamingApplication => ({
  id: '11111111-1111-4111-8111-111111111111',
  make: 'TOYOTA',
  model: 'COROLLA',
  bodyStyle: 'SEDÁN',
  fuel: 'GASOLINA',
  traction: '4X2',
  displacement: '1.8',
  yearFrom: 2014,
  yearTo: 2018,
  area: 'MOTOR',
  subarea: 'ALTERNADOR',
  engine: '2ZR-FE',
  ...overrides,
});
const context = (overrides: Partial<ProductNamingContext> = {}): ProductNamingContext => ({
  id: '22222222-2222-4222-8222-222222222222',
  sku: '6205-2RS1',
  name: 'Descripción ERP',
  brand: 'SKF',
  providerCode: '6205-2RS',
  unifiedCode: '6205',
  category: ['Rodamientos y afines', 'Rodamiento de bolas', 'Rígido'],
  template: 'Rodamiento de bolas rígido',
  applicationType: 'Automotriz e industrial',
  attributes: {},
  applications: [app()],
  ...overrides,
});
const tk = (field: string, options: Partial<ProductNameToken> = {}): ProductNameToken => ({
  field,
  format: 'auto',
  before: '',
  after: '',
  ...options,
});
const config = (overrides: Partial<ProductNameConfig> = {}): ProductNameConfig => ({
  ...structuredClone(DEFAULT_PRODUCT_NAME_CONFIG),
  ...overrides,
});

describe('product naming engine', () => {
  it('matches the initial automotive and industrial formulas, retaining codes and title-casing brands', () => {
    const variants = productVariants(context(), config());
    expect(variants.map((v) => v.nombreAmigable)).toEqual([
      'Rodamiento de bolas rígido Marca Skf Para alternador de Toyota Corolla 2014-2018',
      '6205-2RS Rodamiento de bolas rígido Skf',
    ]);
    expect(generalProductName(context(), config())).toBe(variants[0]?.nombreAmigable);
  });

  it.each([
    [['N1', 'Rodamiento de bolas', 'Rígido'], 'Rodamiento de bolas Rígido'],
    [['N1', 'Dirección', 'Terminal de dirección'], 'Terminal de dirección'],
    [['N1', 'Herramienta eléctrica', 'Taladro'], 'Taladro'],
    [['N1', 'Accesorios', 'Retenedor'], 'Retenedor'],
    [['N1', 'Rodamientos', 'Rodamientos de bolas'], 'Rodamientos de bolas'],
    [['N1', 'Cajeras', 'Chumacera'], 'Chumacera'],
    [['N1', 'Retén', 'RETEN'], 'Retén'],
    [['N1', 'Correas'], 'Correas'],
    [['N1', '', 'Filtro'], 'Filtro'],
  ])('applies category N2/N3 grouping and duplicate rules to %j', (path, expected) => {
    expect(categoryDisplayName(path)).toBe(expected);
  });

  it('omits absent fields and their affixes, preserving zero and false', () => {
    const cfg = config({
      industrial: [
        tk('erp:codigoProveedor'),
        tk('attribute:hidden', { before: 'CONFIDENCIAL', after: 'FIN' }),
        tk('attribute:zero', { before: 'medida', after: 'mm' }),
        tk('attribute:flag', { before: 'opción' }),
      ],
    });
    expect(
      productVariants(
        context({ attributes: { zero: 0, flag: false }, applicationType: 'INDUSTRIAL' }),
        cfg,
      )[0]?.nombreAmigable,
    ).toBe('6205-2RS Medida 0 mm opción false');
  });

  it.each(['constructor', 'toString', '__proto__'])(
    'omits inherited attribute and ERP property %s including its affixes',
    (key) => {
      const ctx = context({ applicationType: 'INDUSTRIAL' });
      const cfg = config({
        industrial: [
          tk(`erp:${key}`, { before: 'NATIVO' }),
          tk(`attribute:${key}`, { after: 'FIN' }),
        ],
      });
      expect(generalProductName(ctx, cfg)).toBe(ctx.sku);
      expect(productVariants(ctx, cfg)[0]?.nombreAmigable).toBe(ctx.sku);
    },
  );

  it('can still use a registered own attribute whose key coincides with an Object prototype property', () => {
    const ctx = context({
      applicationType: 'INDUSTRIAL',
      attributes: Object.fromEntries([['constructor', 'ACERO']]),
    });
    const cfg = config({ industrial: [tk('attribute:constructor')] });
    expect(generalProductName(ctx, cfg)).toBe('Acero');
  });

  it('preserves known product fields between missing application fields', () => {
    const cfg = config({
      automotive: [
        tk('category:name'),
        tk('application:make', { before: 'de' }),
        tk('erp:marca', { before: 'Marca' }),
        tk('application:model'),
      ],
    });
    expect(
      generalProductName(context({ applicationType: 'AUTOMOTRIZ', applications: [] }), cfg),
    ).toBe('Rodamiento de bolas rígido Marca Skf');
  });

  it('supports explicit original/lower/title/upper formats and punctuation before a token', () => {
    const cfg = config({
      industrial: [
        tk('erp:codigoProveedor', { format: 'original' }),
        tk('erp:marca', { format: 'upper' }),
        tk('template:name', { format: 'lower' }),
        tk('attribute:vehiculo', { format: 'title' }),
        tk('attribute:fin', { before: '-' }),
      ],
    });
    expect(
      productVariants(
        context({
          applicationType: 'INDUSTRIAL',
          attributes: { vehiculo: 'sentra b17', fin: 'XL' },
        }),
        cfg,
      )[0]?.nombreAmigable,
    ).toBe('6205-2RS SKF rodamiento de bolas rígido Sentra B17-xl');
  });

  it('repeats only vehicle identity, puts remaining models before formula suffix, and uses singular grammar', () => {
    const ctx = context({
      applications: [
        app(),
        app({ id: 'a2', make: 'NISSAN', model: 'SENTRA B17' }),
        app({ id: 'a3', make: 'KIA', model: 'RIO' }),
      ],
    });
    const cfg = config({
      maxApplications: 2,
      moreApplications: true,
      automotive: [
        tk('category:name'),
        tk('application:subarea', { before: 'Para' }),
        tk('application:make', { before: 'de' }),
        tk('application:model'),
        tk('erp:marca', { after: 'original' }),
      ],
    });
    expect(generalProductName(ctx, cfg)).toBe(
      'Rodamiento de bolas rígido Para alternador de Toyota Corolla, Nissan Sentra B17 y 1 modelo más Skf original',
    );
    expect(productVariants(ctx, cfg)[0]?.nombreAmigable).toBe(
      'Rodamiento de bolas rígido Para alternador de Toyota Corolla Skf original',
    );
  });

  it.each([
    ['AUTOMOTRIZ', 0, ['automotriz']],
    ['AUTOMOTRIZ', 2, ['automotriz', 'automotriz']],
    ['INDUSTRIAL', 2, ['industrial']],
    ['AUTOMOTRIZ E INDUSTRIAL', 0, ['industrial']],
    ['AUTOMOTRIZ E INDUSTRIAL', 2, ['automotriz', 'automotriz', 'industrial']],
  ])(
    'creates the sales variants for %s and %d applications',
    (applicationType, count, expected) => {
      const apps = [app(), app({ id: 'a2', model: 'SENTRA B17' })].slice(0, count);
      expect(
        productVariants(context({ applicationType, applications: apps }), config()).map(
          (v) => v.tipo,
        ),
      ).toEqual(expected);
    },
  );

  it('allows either formula for the general mixed name while keeping every sales variant', () => {
    const ctx = context();
    const industrialName = productVariants(ctx, config()).at(-1)?.nombreAmigable;
    expect(generalProductName(ctx, config({ mixedMode: 'industrial' }))).toBe(industrialName);
    expect(generalProductName(context({ applications: [] }), config())).toBe(industrialName);
    expect(
      generalProductName(context({ applications: [] }), config({ mixedMode: 'automotive' })),
    ).toBe('Rodamiento de bolas rígido Marca Skf');
    expect(productVariants(ctx, config({ mixedMode: 'industrial' }))).toHaveLength(2);
  });

  it('uses the SKU when names are disabled or every configured value is absent', () => {
    const ctx = context();
    expect(generalProductName(ctx, config({ enabled: false }))).toBe(ctx.sku);
    expect(
      productVariants(ctx, config({ enabled: false })).every((v) => v.nombreAmigable === ctx.sku),
    ).toBe(true);
    expect(generalProductName(ctx, config({ automotive: [tk('attribute:hidden')] }))).toBe(ctx.sku);
  });

  it('returns actual product routes with the chosen application or industrial usage', () => {
    const [automotive, industrial] = productVariants(context(), config());
    expect(automotive?.ficha).toBe(`/products/${context().id}?aplicacion=${app().id}`);
    expect(industrial?.ficha).toBe(`/products/${context().id}?uso=industrial`);
    expect(automotive?.aplicacion).toMatchObject({
      modelo: 'COROLLA',
      cilindraje: '1.8',
      motor: '2ZR-FE',
    });
    expect(industrial?.aplicacion).toBeNull();
  });
});

describe('sales variant search filtering', () => {
  const mixed = context({
    applications: [app(), app({ id: 'a2', make: 'NISSAN', model: 'SENTRA B17' })],
  });

  it('keeps only the matching vehicle, including for multiword product + vehicle queries', () => {
    const result = filterSalesVariants(productVariants(mixed, config()), 'rodamiento corólla');
    expect(result).toHaveLength(1);
    expect(result[0]?.aplicacion?.modelo).toBe('COROLLA');
  });

  it('does not combine vehicle terms across distinct applications', () => {
    expect(filterSalesVariants(productVariants(mixed, config()), 'toyota sentra')).toEqual([]);
  });

  it('does not borrow fuel or years from another application of a matching vehicle', () => {
    const ctx = context({
      applications: [
        app({ fuel: 'GASOLINA', yearFrom: 2014 }),
        app({ id: 'a2', make: 'NISSAN', model: 'SENTRA', fuel: 'DIÉSEL', yearFrom: 2020 }),
      ],
    });
    const variants = productVariants(ctx, config());
    expect(filterSalesVariants(variants, 'toyota diesel', [ctx])).toEqual([]);
    expect(filterSalesVariants(variants, 'corolla 2020', [ctx])).toEqual([]);
    const result = filterSalesVariants(variants, 'nissan diesel 2020', [ctx]);
    expect(result).toHaveLength(1);
    expect(result[0]?.aplicacion).toMatchObject({
      modelo: 'SENTRA',
      combustible: 'DIÉSEL',
      anioDesde: 2020,
    });
  });

  it('preserves product-wide visible terms even when they also occur in other applications', () => {
    const ctx = context({
      attributes: { combustible_admitido: 'DIÉSEL' },
      applications: [
        app({ fuel: 'GASOLINA' }),
        app({ id: 'a2', make: 'NISSAN', model: 'SENTRA', fuel: 'DIÉSEL' }),
      ],
    });
    const result = filterSalesVariants(productVariants(ctx, config()), 'corolla diesel', [ctx]);
    expect(result).toHaveLength(1);
    expect(result[0]?.aplicacion?.modelo).toBe('COROLLA');
  });

  it('selects the vehicle even when its model is also part of the shared product name', () => {
    const ctx = { ...mixed, name: 'Rodamiento Corolla y Sentra' };
    const result = filterSalesVariants(productVariants(ctx, config()), 'corolla', [ctx]);
    expect(result).toHaveLength(1);
    expect(result[0]?.aplicacion?.modelo).toBe('COROLLA');
  });

  it('keeps every variant for code or product-brand searches', () => {
    expect(filterSalesVariants(productVariants(mixed, config()), '6205 skf')).toHaveLength(3);
    expect(
      filterSalesVariants(productVariants({ ...mixed, brand: 'TOYOTA' }, config()), 'toyota'),
    ).toHaveLength(3);
  });

  it('ranks a vehicle match before a product-brand match without narrowing the latter', () => {
    const sameBrand = context({ id: 'other', brand: 'TOYOTA', applications: [app()] });
    const result = filterSalesVariants(
      [...productVariants(sameBrand, config()), ...productVariants(mixed, config())],
      'toyota',
    );
    expect(result).toHaveLength(3);
    expect(result[0]?.productId).toBe(mixed.id);
    expect(result.filter((v) => v.productId === sameBrand.id)).toHaveLength(2);
  });

  it('puts an exact SKU before other matching codes', () => {
    const result = filterSalesVariants(
      [
        ...productVariants(context({ id: 'other', sku: 'X-6205-2RS1' }), config()),
        ...productVariants(mixed, config()),
      ],
      '6205-2rs1',
    );
    expect(result[0]?.productId).toBe(mixed.id);
  });
});
