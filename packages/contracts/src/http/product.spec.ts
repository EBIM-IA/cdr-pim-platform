import { describe, expect, it } from 'vitest';

import { createProductSchema, productListQuerySchema, productSchema } from './product';

describe('product contracts', () => {
  it('rejects an empty SKU', () => {
    expect(() => createProductSchema.parse({ sku: '', name: 'Rodamiento' })).toThrow();
  });

  it('requires ISO-8601 UTC timestamps on the read model', () => {
    const base = {
      id: '11111111-1111-4111-8111-111111111111',
      sku: '6205-2RS',
      name: 'Rodamiento rígido de bolas 6205-2RS',
      description: null,
      brand: 'SKF',
      status: 'published',
      identifiers: [{ type: 'manufacturer_part_number', value: '6205-2RS' }],
      createdAt: '2026-08-30T10:00:00.000Z',
      updatedAt: '2026-08-30T10:00:00.000Z',
    };
    expect(productSchema.parse(base).sku).toBe('6205-2RS');
    expect(() => productSchema.parse({ ...base, createdAt: '30/08/2026' })).toThrow();
  });

  it('validates product-list filters at the shared boundary', () => {
    expect(
      productListQuerySchema.parse({
        page: '2',
        pageSize: '25',
        q: 'rodamiento',
        brand: 'FAG',
        status: 'in_review',
      }),
    ).toEqual({
      page: 2,
      pageSize: 25,
      q: 'rodamiento',
      brand: 'FAG',
      status: 'in_review',
    });
  });
});
