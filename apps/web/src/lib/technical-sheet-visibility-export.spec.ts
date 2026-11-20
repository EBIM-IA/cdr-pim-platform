import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultPdfDesignConfig, type ProductAttributeSheetDto } from '@cdr/contracts';
import { downloadTechnicalSheetsZip } from './technical-sheet-export';
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  zip: vi.fn(),
  designSettings: vi.fn(),
  sheet: vi.fn(),
  pdf: vi.fn(),
  download: vi.fn(),
}));
vi.mock('@/lib/dynamic-catalog-api', () => ({ fetchProductTechnicalSheet: mocks.sheet }));
vi.mock('@/lib/pdf-design-api', () => ({ fetchPdfDesignSettings: mocks.designSettings }));
vi.mock('@/lib/product-experience-api', () => ({
  fetchProductExperience: vi.fn(async () => ({
    nombreGeneral: 'Nombre vigente',
    fields: [],
    variants: [],
  })),
}));
vi.mock('@/lib/catalog-home-api', () => ({
  catalogHomeSettings: vi.fn(async () => ({ config: { brands: [], categories: [] }, version: 0 })),
}));
vi.mock('@/lib/catalog-parameters-api', () => ({ listCatalogParameters: vi.fn(async () => []) }));
vi.mock('@/lib/bff-client', () => ({
  authenticatedBffFetch: mocks.fetch,
}));
vi.mock('@/lib/technical-sheet-pdf', () => ({ createTechnicalSheetPdf: mocks.pdf }));
vi.mock('@/lib/zip-export', () => ({
  createBinaryZip: mocks.zip,
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
  vi.resetAllMocks();
  mocks.fetch.mockImplementation(async (url: string) =>
    url === '/api/catalog/technical-sheets/authorize'
      ? Response.json({ allowed: true })
      : new Response(new Uint8Array([1, 2, 3])),
  );
  mocks.zip.mockReturnValue(new Uint8Array([1]));
  mocks.designSettings.mockImplementation(async () => ({
    config: createDefaultPdfDesignConfig(),
    updatedAt: null,
  }));
  mocks.sheet.mockImplementation(async (id: string) => ({
    ...sheet,
    product: { ...sheet.product, id, sku: id.toUpperCase() },
  }));
  mocks.pdf.mockResolvedValue(new Uint8Array([1]));
});
describe('technical-sheet bulk role authorization', () => {
  it('exports every selected SKU after checking the current role permission with the server', async () => {
    const progress = vi.fn();
    const request = new AbortController();
    const count = await downloadTechnicalSheetsZip(
      [
        { id: 'previously-hidden', sku: 'PREVIOUSLY-HIDDEN' },
        { id: 'visible', sku: 'VISIBLE' },
      ],
      {},
      { signal: request.signal, onProgress: progress },
    );
    expect(mocks.fetch).toHaveBeenNthCalledWith(1, '/api/catalog/technical-sheets/authorize', {
      cache: 'no-store',
      signal: request.signal,
    });
    expect(mocks.sheet).toHaveBeenCalledWith('previously-hidden', request.signal);
    expect(mocks.sheet).toHaveBeenCalledWith('visible', request.signal);
    expect(progress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(count).toBe(2);
    expect(mocks.pdf).toHaveBeenCalledTimes(2);
    expect(mocks.zip).toHaveBeenCalledOnce();
    expect(mocks.download).toHaveBeenCalledOnce();
  });

  it('stops before loading sheets or creating a ZIP when the server denies the role', async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(
      downloadTechnicalSheetsZip([{ id: 'visible', sku: 'VISIBLE' }], {}),
    ).rejects.toThrow('Tu perfil no tiene habilitada la generación masiva de fichas técnicas PDF.');
    expect(mocks.sheet).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.zip).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('fails closed if the permission cannot be confirmed', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('Permiso no disponible'));
    await expect(
      downloadTechnicalSheetsZip([{ id: 'visible', sku: 'VISIBLE' }], {}),
    ).rejects.toThrow('Permiso no disponible');
    mocks.fetch.mockResolvedValueOnce(Response.json({ allowed: false }));
    await expect(
      downloadTechnicalSheetsZip([{ id: 'visible', sku: 'VISIBLE' }], {}),
    ).rejects.toThrow('No se pudo comprobar el permiso de fichas técnicas.');
    expect(mocks.sheet).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.zip).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
