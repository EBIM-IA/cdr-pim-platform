import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductAttributeSheetDto } from '@cdr/contracts';
import { downloadTechnicalSheetsZip } from './technical-sheet-export';
const mocks = vi.hoisted(() => ({
  policies: vi.fn(),
  sheet: vi.fn(),
  pdf: vi.fn(),
  download: vi.fn(),
}));
vi.mock('@/lib/technical-sheet-visibility-api', () => ({
  listTechnicalSheetVisibility: mocks.policies,
}));
vi.mock('@/lib/dynamic-catalog-api', () => ({ fetchProductTechnicalSheet: mocks.sheet }));
vi.mock('@/lib/catalog-parameters-api', () => ({ listCatalogParameters: vi.fn(async () => []) }));
vi.mock('@/lib/bff-client', () => ({
  authenticatedBffFetch: vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))),
}));
vi.mock('@/lib/technical-sheet-pdf', () => ({ createTechnicalSheetPdf: mocks.pdf }));
vi.mock('@/lib/zip-export', () => ({
  createBinaryZip: vi.fn(() => new Uint8Array([1])),
  downloadBinary: mocks.download,
  technicalSheetFilename: (sku: string) => `${sku}.pdf`,
}));
const sheet: ProductAttributeSheetDto = {
  schema: {
    category: { id: '11111111-1111-4111-8111-111111111111', slug: 'test', name: 'Test' },
    template: {
      id: '22222222-2222-4222-8222-222222222222',
      variantKey: 'test',
      name: 'Test',
      version: 1,
    },
    columns: [],
  },
  product: {
    id: 'visible',
    sku: 'VISIBLE',
    name: 'Visible',
    brand: null,
    status: 'published',
    attributes: {},
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.sheet.mockResolvedValue(sheet);
  mocks.pdf.mockResolvedValue(new Uint8Array([1]));
});
describe('technical-sheet bulk visibility', () => {
  it('excludes hidden SKUs before requesting sheets and reports the eligible total', async () => {
    mocks.policies.mockResolvedValue([
      { productId: 'hidden', visible: false },
      { productId: 'visible', visible: true },
    ]);
    const progress = vi.fn();
    await downloadTechnicalSheetsZip(
      [
        { id: 'hidden', sku: 'HIDDEN' },
        { id: 'visible', sku: 'VISIBLE' },
      ],
      {},
      { onProgress: progress },
    );
    expect(mocks.sheet).toHaveBeenCalledExactlyOnceWith('visible', undefined);
    expect(progress).toHaveBeenCalledWith(1, 1);
    expect(mocks.download).toHaveBeenCalledOnce();
  });
  it('includes an administratively accessible hidden sheet only when the server projects that access', async () => {
    mocks.policies.mockResolvedValue([
      { productId: 'hidden', visible: false, canView: true },
      { productId: 'visible', visible: true, canView: true },
    ]);
    await downloadTechnicalSheetsZip(
      [
        { id: 'hidden', sku: 'HIDDEN' },
        { id: 'visible', sku: 'VISIBLE' },
      ],
      {},
    );
    expect(mocks.sheet).toHaveBeenCalledWith('hidden', undefined);
    expect(mocks.sheet).toHaveBeenCalledWith('visible', undefined);
    expect(mocks.pdf).toHaveBeenCalledTimes(2);
  });
  it('fails closed when visibility cannot be confirmed or all selected sheets are hidden', async () => {
    mocks.policies.mockRejectedValueOnce(new Error('Visibilidad no disponible'));
    await expect(downloadTechnicalSheetsZip([{ id: 'hidden', sku: 'HIDDEN' }], {})).rejects.toThrow(
      'Visibilidad no disponible',
    );
    mocks.policies.mockResolvedValue([{ productId: 'hidden', visible: false }]);
    await expect(downloadTechnicalSheetsZip([{ id: 'hidden', sku: 'HIDDEN' }], {})).rejects.toThrow(
      'No hay SKU',
    );
    expect(mocks.sheet).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
