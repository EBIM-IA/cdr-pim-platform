import { describe, expect, it } from 'vitest';

import { catalogFamily, matchesCompleteness } from '@/components/products-catalog';
import type { Product } from '@/lib/types';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    sku: '6205-2RS',
    name: 'Rodamiento rígido de bolas',
    brand: 'FAG',
    category: 'Rodamientos',
    application: 'Industrial',
    status: 'published',
    completeness: 85,
    attributes: [],
    ...overrides,
  };
}

describe('products catalog reference filters', () => {
  it('derives the visual family from real product text', () => {
    expect(catalogFamily(product())).toBe('Rodamientos');
    expect(catalogFamily(product({ name: 'Aceite sintético 0W-20' }))).toBe(
      'Lubricantes y fluidos',
    );
    expect(catalogFamily(product({ name: 'Producto sin taxonomía reconocida' }))).toBe('Otros');
  });

  it('applies the same completeness bands shown by the filter', () => {
    expect(matchesCompleteness(95, 'complete')).toBe(true);
    expect(matchesCompleteness(85, 'attention')).toBe(true);
    expect(matchesCompleteness(69, 'critical')).toBe(true);
    expect(matchesCompleteness(null, 'unavailable')).toBe(true);
    expect(matchesCompleteness(null, 'complete')).toBe(false);
    expect(matchesCompleteness(95, '')).toBe(true);
  });
});
