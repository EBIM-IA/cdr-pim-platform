import { describe, expect, it, vi } from 'vitest';
import { fetchCatalogWorkbook } from './dynamic-catalog-api';
import { fetchUnifiedMembers } from './unified-products';
vi.mock('./dynamic-catalog-api', () => ({ fetchCatalogWorkbook: vi.fn() }));
describe('Unified product members', () => {
  it('uses exact group matching, reads all pages and rejects a non-progressing page', async () => {
    vi.mocked(fetchCatalogWorkbook)
      .mockResolvedValueOnce({ items: [{ id: 'a' }], total: 2 } as Awaited<
        ReturnType<typeof fetchCatalogWorkbook>
      >)
      .mockResolvedValueOnce({ items: [{ id: 'b' }], total: 2 } as Awaited<
        ReturnType<typeof fetchCatalogWorkbook>
      >);
    expect((await fetchUnifiedMembers('UNI-1')).map((item) => item.id)).toEqual(['a', 'b']);
    expect(fetchCatalogWorkbook).toHaveBeenCalledWith(
      expect.objectContaining({
        columnFilter: [JSON.stringify({ key: 'base:unifier', values: ['value:UNI-1'] })],
      }),
      undefined,
    );
    vi.mocked(fetchCatalogWorkbook).mockResolvedValue({ items: [{ id: 'a' }], total: 2 } as Awaited<
      ReturnType<typeof fetchCatalogWorkbook>
    >);
    await expect(fetchUnifiedMembers('UNI-1')).rejects.toThrow('cambiaron');
  });
});
