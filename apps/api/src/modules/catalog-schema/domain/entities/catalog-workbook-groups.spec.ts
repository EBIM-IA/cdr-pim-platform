import { newUuid } from '@cdr/shared';
import { describe, expect, it } from 'vitest';
import type { CatalogWorkbookProduct } from './catalog-schema';
import { groupCatalogWorkbookProducts } from './catalog-workbook-groups';
function product(sku: string, unifiedCode: string | null, brand: string): CatalogWorkbookProduct {
  return {
    id: newUuid(),
    sku,
    unifiedCode,
    brand,
    name: sku,
    description: null,
    status: 'published',
    updatedAt: new Date(),
    category: null,
    template: null,
    providerCode: null,
    applicationTypes: ['INDUSTRIAL'],
    completeness: null,
    attributes: {},
  };
}
describe('unified product groups', () => {
  it('unites group brands and applications while preserving each SKU link and separate uncoded products', () => {
    const one = product('A', '6205', 'SKF'),
      two = { ...product('B', '6205', 'FAG'), applicationTypes: ['AUTOMOTRIZ'] },
      noCode = product('C', null, 'SKF'),
      other = product('D', null, 'FAG');
    const grouped = groupCatalogWorkbookProducts([one, two, noCode, other]);
    expect(grouped).toHaveLength(3);
    expect(grouped[0]).toMatchObject({
      brand: 'SKF · FAG',
      name: 'A · B',
      applicationTypes: ['AUTOMOTRIZ', 'INDUSTRIAL'],
      groupMembers: [
        { id: one.id, sku: 'A', brand: 'SKF' },
        { id: two.id, sku: 'B', brand: 'FAG' },
      ],
    });
    expect(one.name).toBe('A');
  });
});
