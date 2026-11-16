import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogTechnicalSheetsButton } from './catalog-technical-sheets-button';
const mocks = vi.hoisted(() => ({ workbook: vi.fn(), assets: vi.fn(), download: vi.fn() }));
vi.mock('@/lib/dynamic-catalog-api', () => ({ fetchCatalogWorkbook: mocks.workbook }));
vi.mock('@/lib/product-assets-api', () => ({ listProductAssetsBatch: mocks.assets }));
vi.mock('@/lib/technical-sheet-export', () => ({
  downloadTechnicalSheetsZip: mocks.download,
  MAX_TECHNICAL_SHEETS_PER_ZIP: 250,
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.assets.mockResolvedValue([]);
  mocks.download.mockResolvedValue(2);
});
afterEach(cleanup);
describe('catalog technical sheets', () => {
  it('loads every filtered page, expands complete groups, deduplicates SKU and delegates visibility to the exporter', async () => {
    const first = { id: 'a', sku: 'A' },
      second = { id: 'b', sku: 'B' },
      third = { id: 'c', sku: 'C' };
    mocks.workbook
      .mockResolvedValueOnce({ total: 2, items: [{ ...first, groupMembers: [first, second] }] })
      .mockResolvedValueOnce({ total: 2, items: [{ ...third, groupMembers: [second, third] }] });
    render(
      <CatalogTechnicalSheetsButton
        query={{
          filter: [],
          columnFilter: ['sku=ABC*'],
          groupByUnifiedCode: true,
          categoryId: 'category',
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fichas técnicas PDF (ZIP)' }));
    await waitFor(() =>
      expect(mocks.download).toHaveBeenCalledWith(
        [first, second, third],
        {},
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    expect(mocks.workbook.mock.calls.map(([query]) => query)).toEqual(
      [1, 2].map((page) =>
        expect.objectContaining({
          page,
          categoryId: 'category',
          columnFilter: ['sku=ABC*'],
          groupByUnifiedCode: true,
        }),
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      '2 fichas técnicas descargadas. 1 artículo omitido por visibilidad.',
    );
  });
  it('refuses an oversized group before fetching assets or generating a partial ZIP', async () => {
    mocks.workbook.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'a',
          sku: 'A',
          groupMembers: Array.from({ length: 251 }, (_, index) => ({
            id: String(index),
            sku: `SKU-${index}`,
          })),
        },
      ],
    });
    render(<CatalogTechnicalSheetsButton query={{ filter: [], groupByUnifiedCode: true }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fichas técnicas PDF (ZIP)' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Filtra hasta 250 artículos');
    expect(mocks.assets).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
