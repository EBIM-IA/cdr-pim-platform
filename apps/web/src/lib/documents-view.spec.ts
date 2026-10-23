import type { CatalogWorkbookProductDto, ProductAssetDto } from '@cdr/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ workbook: vi.fn(), batch: vi.fn() }));
vi.mock('@/lib/dynamic-catalog-api', () => ({ fetchCatalogWorkbook: api.workbook }));
vi.mock('@/lib/product-assets-api', () => ({ listProductAssetsBatch: api.batch }));

import {
  documentCoverage,
  documentFilterValue,
  documentRequirement,
  documentState,
  fetchDocumentsCatalog,
} from './documents-view';

function product(index: number): CatalogWorkbookProductDto {
  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    sku: `SKU-${index}`,
    name: `Product ${index}`,
    description: null,
    brand: null,
    status: 'in_review',
    updatedAt: '2026-10-23T12:00:00.000Z',
    category: null,
    template: {
      id: '20000000-0000-4000-8000-000000000001',
      name: 'Template',
      variantKey: 'default',
      version: 1,
    },
    providerCode: null,
    unifiedCode: null,
    applicationTypes: [],
    completeness: null,
    attributes: {},
    assetRequirements: [
      { type: 'FOTO', required: true },
      { type: 'FT', required: true },
      { type: 'PLANO', required: false },
    ],
  };
}
function file(owner: CatalogWorkbookProductDto): ProductAssetDto {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    productId: owner.id,
    sku: owner.sku,
    type: 'FT',
    kind: 'document',
    filename: `${owner.sku}__FT.pdf`,
    mimeType: 'application/pdf',
    size: 100,
    checksum: 'test-checksum',
    source: 'manual',
    position: null,
    uploadedBy: 'test-actor',
    uploadedAt: '2026-10-23T12:00:00.000Z',
    replacesAssetId: null,
  };
}
beforeEach(() => vi.resetAllMocks());
describe('complete documents catalog', () => {
  it('loads all workbook pages and batches asset requests in at most one hundred unique IDs', async () => {
    const products = Array.from({ length: 205 }, (_, index) => product(index));
    const persisted = file(products[204]!);
    api.workbook.mockImplementation(
      async ({ page, pageSize }: { page: number; pageSize: number }) => ({
        items: products.slice((page - 1) * pageSize, page * pageSize),
        total: products.length,
      }),
    );
    api.batch.mockImplementation(async (ids: string[]) =>
      ids.map((productId) => ({
        productId,
        assets: productId === persisted.productId ? [persisted] : [],
      })),
    );
    const signal = new AbortController().signal;
    const result = await fetchDocumentsCatalog(signal);
    expect(result.products).toEqual(products);
    expect(new Set(result.products.map((item) => item.id)).size).toBe(205);
    expect(api.workbook).toHaveBeenCalledTimes(3);
    for (let page = 1; page <= 3; page += 1)
      expect(api.workbook).toHaveBeenNthCalledWith(
        page,
        { page, pageSize: 100, filter: [] },
        signal,
      );
    expect(api.batch.mock.calls.map(([ids]) => ids.length)).toEqual([100, 100, 5]);
    expect(api.batch.mock.calls.every(([, passedSignal]) => passedSignal === signal)).toBe(true);
    expect(api.batch.mock.calls.flatMap(([ids]) => ids)).toEqual(products.map((item) => item.id));
    expect(result.assets[persisted.productId]).toEqual([persisted]);
  });
  it('fails on a repeated page instead of presenting a partial catalog or looping indefinitely', async () => {
    const first = Array.from({ length: 100 }, (_, index) => product(index));
    api.workbook.mockResolvedValue({ items: first, total: 101 });
    await expect(fetchDocumentsCatalog()).rejects.toThrow('El catálogo cambió durante la consulta');
    expect(api.workbook).toHaveBeenCalledTimes(2);
    expect(api.batch).not.toHaveBeenCalled();
  });
  it('propagates asset batch errors so a failed lookup cannot be displayed as an empty asset list', async () => {
    api.workbook.mockResolvedValue({ items: [product(1)], total: 1 });
    api.batch.mockRejectedValue(new Error('Asset lookup failed'));
    await expect(fetchDocumentsCatalog()).rejects.toThrow('Asset lookup failed');
  });
  it('keeps required, optional, no-apply and unavailable policies distinct without inferring uploaded files', () => {
    const owner = product(1),
      persisted = file(owner);
    expect(documentState(owner, 'FT', [persisted])).toBe(persisted.filename);
    expect(documentState(owner, 'FOTO', [])).toBe('Obligatorio');
    expect(documentState(owner, 'PLANO', [])).toBe('Pendiente');
    expect(documentRequirement(owner, 'CERT')).toBeNull();
    expect(documentState(owner, 'CERT', [])).toBe('No aplica');
    expect(documentCoverage(owner, [persisted])).toEqual({
      total: 3,
      present: 1,
      requiredMissing: 1,
    });
    expect(documentCoverage(owner, [])).toEqual({ total: 3, present: 0, requiredMissing: 2 });
    const unknown = { ...owner, assetRequirements: undefined };
    expect(documentState(unknown, 'FT', [])).toBe('Política no disponible');
    expect(documentCoverage(unknown, [])).toBeNull();
    const pending = { ...owner, template: null, assetRequirements: [] };
    expect(documentRequirement(pending, 'FT')).toBeUndefined();
    expect(documentState(pending, 'FT', [])).toBe('Sin plantilla activa');
    expect(documentCoverage(pending, [])).toBeNull();
  });
  it('treats the AX empty-file filter as missing persistence even for non-applicable slots', () => {
    const owner = product(1);
    expect(documentFilterValue(owner, 'CERT', [], '""')).toBe('(Vacías)');
    expect(documentFilterValue(owner, 'CERT', [], '*no aplica*')).toBe('No aplica');
    expect(documentFilterValue(owner, 'FT', [file(owner)], '""')).toBe('SKU-1__FT.pdf');
  });
});
