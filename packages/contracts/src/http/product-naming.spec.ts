import { describe, expect, it } from 'vitest';

import {
  previewProductNameSchema,
  productNameConfigSchema,
  productNameTokenSchema,
  productSalesVariantSchema,
  productVariantSearchQuerySchema,
  updateProductNameSettingsSchema,
} from './product-naming';

const config = {
  enabled: true,
  mixedMode: 'applications',
  maxApplications: 1,
  moreApplications: false,
  automotive: [{ field: 'category:name' }],
  industrial: [{ field: 'erp:codigoProveedor' }],
};

describe('product naming HTTP contracts', () => {
  it('validates the complete namespace/field grammar and supplies token defaults', () => {
    expect(productNameTokenSchema.parse({ field: 'application:engine' })).toEqual({
      field: 'application:engine',
      before: '',
      after: '',
      format: 'auto',
    });
    for (const field of [
      'erp:codigoArticulo',
      'attribute:diametro_1',
      'category:n3',
      'template:name',
      'application:bodyStyle',
    ])
      expect(productNameTokenSchema.safeParse({ field }).success).toBe(true);
    for (const field of [
      'application:notes',
      'application:extra:secret',
      'category:n4',
      'constructor',
      'attribute:bad-key',
      'erp:',
    ])
      expect(productNameTokenSchema.safeParse({ field }).success).toBe(false);
  });

  it('rejects unknown properties, oversized formulas and unsupported modes', () => {
    expect(productNameConfigSchema.safeParse({ ...config, admin: true }).success).toBe(false);
    expect(
      productNameConfigSchema.safeParse({
        ...config,
        automotive: [{ field: 'category:name', hidden: 'data' }],
      }).success,
    ).toBe(false);
    expect(productNameConfigSchema.safeParse({ ...config, automotive: [] }).success).toBe(false);
    expect(
      productNameConfigSchema.safeParse({
        ...config,
        industrial: Array.from({ length: 41 }, () => ({ field: 'erp:marca' })),
      }).success,
    ).toBe(false);
    expect(productNameConfigSchema.safeParse({ ...config, maxApplications: 11 }).success).toBe(
      false,
    );
    expect(productNameConfigSchema.safeParse({ ...config, mixedMode: 'both' }).success).toBe(false);
  });

  it('rejects text jsonb cannot persist before accepting a settings or preview payload', () => {
    for (const text of ['\u0000', '\ud800', '\udfff']) {
      for (const key of ['before', 'after']) {
        const invalidConfig = { ...config, automotive: [{ field: 'category:name', [key]: text }] };
        expect(
          updateProductNameSettingsSchema.safeParse({ config: invalidConfig, version: 0 }).success,
        ).toBe(false);
        expect(
          previewProductNameSchema.safeParse({
            productId: '11111111-1111-4111-8111-111111111111',
            config: invalidConfig,
          }).success,
        ).toBe(false);
      }
    }
    expect(
      productNameTokenSchema.safeParse({ field: 'category:name', before: 'Para 🔧', after: '🛠️' })
        .success,
    ).toBe(true);
  });

  it('allows initial version zero and rejects invalid optimistic versions and preview product ids', () => {
    expect(updateProductNameSettingsSchema.safeParse({ config, version: 0 }).success).toBe(true);
    for (const version of [-1, 1.5, '1'])
      expect(updateProductNameSettingsSchema.safeParse({ config, version }).success).toBe(false);
    expect(previewProductNameSchema.safeParse({ productId: 'sku-not-id', config }).success).toBe(
      false,
    );
  });

  it('bounds and trims the suggestion query before any database reads', () => {
    expect(productVariantSearchQuerySchema.parse({ q: '  corolla  ' })).toEqual({
      q: 'corolla',
      limit: 12,
    });
    expect(productVariantSearchQuerySchema.parse({ q: 'SKF', limit: '50' }).limit).toBe(50);
    for (const query of [
      { q: ' ' },
      { q: 'c' },
      { q: 'x'.repeat(301) },
      { q: 'SKF', limit: 0 },
      { q: 'SKF', limit: 51 },
      { q: 'SKF', roles: ['ADMINISTRADOR'] },
    ])
      expect(productVariantSearchQuerySchema.safeParse(query).success).toBe(false);
  });

  it('requires actual product deep links on returned variants', () => {
    const variant = {
      productId: '11111111-1111-4111-8111-111111111111',
      codigoArticulo: '6205',
      nombreAmigable: 'Rodamiento',
      tipo: 'industrial',
      marca: 'SKF',
      codigoProveedor: '',
      codigoUnificador: '',
      aplicacion: null,
      ficha: '/products/11111111-1111-4111-8111-111111111111?uso=industrial',
    };
    expect(productSalesVariantSchema.safeParse(variant).success).toBe(true);
    expect(productSalesVariantSchema.safeParse({ ...variant, ficha: '#6?sku=6205' }).success).toBe(
      false,
    );
  });
});
