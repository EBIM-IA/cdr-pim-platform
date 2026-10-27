import { describe, expect, it } from 'vitest';

import { categorySkuCounts } from './drizzle-catalog-administration.repository';

describe('category SKU counts', () => {
  it('includes descendants through parent IDs without merging similarly named branches', () => {
    const categories = [
      { id: 'rod', parentId: null },
      { id: 'rod-bolas', parentId: 'rod' },
      { id: 'rigidos', parentId: 'rod-bolas' },
      { id: 'rod-bolas-axiales', parentId: 'rod' },
      { id: 'rod-industriales', parentId: null },
      { id: 'sin-productos', parentId: null },
    ];
    const assignments = [
      { categoryId: 'rod', count: 1 },
      { categoryId: 'rod-bolas', count: 3 },
      { categoryId: 'rigidos', count: 4 },
      { categoryId: 'rod-bolas-axiales', count: 6 },
      { categoryId: 'rod-industriales', count: 10 },
    ];
    const totals = categorySkuCounts(categories, assignments);
    expect(totals.get('rod')).toBe(14);
    expect(totals.get('rod-bolas')).toBe(7);
    expect(totals.get('rigidos')).toBe(4);
    expect(totals.get('rod-industriales')).toBe(10);
    expect(totals.get('sin-productos')).toBe(0);
  });
});
