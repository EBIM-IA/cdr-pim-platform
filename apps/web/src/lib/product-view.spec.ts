import type { ProductDto } from '@cdr/contracts';
import { describe, expect, it } from 'vitest';

import { toProductListView, toProductView } from '@/lib/product-view';

const product: ProductDto = {
  id: '11111111-1111-4111-8111-111111111111',
  sku: '6205-2RS',
  name: 'Rodamiento rígido de bolas 6205-2RS',
  description: 'Sellado por ambos lados.',
  brand: 'SKF',
  status: 'in_review',
  identifiers: [
    { type: 'sku', value: '6205-2RS' },
    { type: 'manufacturer_part_number', value: '6205-2RS/C3' },
  ],
  createdAt: '2026-08-30T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

describe('product view adapter', () => {
  it('preserves contract data and leaves unsupported quality data unset', () => {
    expect(toProductView(product)).toMatchObject({
      id: product.id,
      sku: product.sku,
      brand: 'SKF',
      providerCode: '6205-2RS/C3',
      status: 'in_review',
      completeness: null,
      queryChannel: 'API del catálogo',
      technicalId: product.id,
    });
  });

  it('keeps a missing brand label out of real API filter values', () => {
    const view = toProductView({ ...product, brand: null });

    expect(view.brand).toBe('Sin marca registrada');
    expect(view.brandFilter).toBeUndefined();
  });

  it('calculates total pages from the shared pagination contract', () => {
    expect(toProductListView({ items: [product], page: 2, pageSize: 25, total: 51 })).toMatchObject(
      { page: 2, pageSize: 25, total: 51, totalPages: 3 },
    );
  });
});
