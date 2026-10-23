import type { CatalogWorkbookProductDto } from '@cdr/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  categoryLevels,
  equivalenceMatches,
  fetchEquivalenceCatalog,
  splitOemBrands,
} from './equivalence-view';

const api = vi.hoisted(() => ({ fetchCatalogWorkbook: vi.fn() }));
vi.mock('@/lib/dynamic-catalog-api', () => api);
beforeEach(() => vi.clearAllMocks());
const product = {
  id: 'p1',
  sku: 'SKU-1',
  category: { id: 'c1', name: 'Rodamientos' },
} as CatalogWorkbookProductDto;
describe('equivalence catalog view', () => {
  it('fetches all catalog pages without duplicating SKU or losing schema columns', async () => {
    api.fetchCatalogWorkbook
      .mockResolvedValueOnce({ items: [product], columns: [{ key: 'a' }], total: 2, page: 1 })
      .mockResolvedValueOnce({
        items: [{ ...product, id: 'p2', sku: 'SKU-2' }],
        columns: [{ key: 'b' }],
        total: 2,
        page: 2,
      });
    const result = await fetchEquivalenceCatalog();
    expect(result.items).toHaveLength(2);
    expect(result.columns.map((column) => column.key)).toEqual(['a', 'b']);
    expect(api.fetchCatalogWorkbook).toHaveBeenNthCalledWith(
      2,
      { page: 2, pageSize: 100, filter: [] },
      undefined,
    );
  });
  it('fails visibly if paging stops progressing', async () => {
    api.fetchCatalogWorkbook.mockResolvedValue({ items: [product], columns: [], total: 2 });
    await expect(fetchEquivalenceCatalog()).rejects.toThrow('cambió durante');
  });
  it('matches every search token and preserves automotive OEM brands', () => {
    expect(equivalenceMatches('SKF 6205', ['UNI-6205', 'SKF'])).toBe(true);
    expect(equivalenceMatches('SKF 6305', ['UNI-6205', 'SKF'])).toBe(false);
    expect(splitOemBrands('TOYOTA; LEXUS, TOYOTA')).toEqual(['TOYOTA', 'LEXUS']);
    expect(categoryLevels(product, [])).toEqual(['', '', 'Rodamientos']);
  });
});
