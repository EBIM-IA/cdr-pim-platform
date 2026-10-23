import type { ProductCatalogDto, ProductCatalogListDto } from '@cdr/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/bff-client', () => ({ authenticatedBffFetch: client.fetch }));

import {
  ProductCatalogsApiError,
  createProductCatalog,
  createProductCatalogShare,
  deleteProductCatalog,
  listAllProductCatalogs,
  listProductCatalogs,
  productCatalogDownloadUrl,
  restoreProductCatalog,
  revokeProductCatalogShare,
  updateProductCatalog,
} from './product-catalogs-api';

const catalog: ProductCatalogDto = {
  id: '10000000-0000-4000-8000-000000000001',
  code: 'CAT-0001',
  title: 'Rodamientos',
  description: '',
  validFrom: '2026-10-23',
  validUntil: null,
  status: 'Vigente',
  fileName: 'catalogo.pdf',
  fileSize: 100,
  activeLinks: 0,
  totalLinks: 0,
  createdBy: 'compras@prueba.local',
  createdAt: '2026-10-23T12:00:00.000Z',
  updatedBy: 'compras@prueba.local',
  updatedAt: '2026-10-23T12:00:00.000Z',
  deletedAt: null,
  deletedBy: null,
};
const metadata = {
  title: catalog.title,
  description: '',
  validFrom: catalog.validFrom,
  validUntil: null,
};
const page = (
  items: ProductCatalogDto[],
  number: number,
  total: number,
): ProductCatalogListDto => ({
  items,
  page: number,
  pageSize: 100,
  total,
  metrics: {
    catalogs: total,
    current: total,
    expiring: 0,
    expired: 0,
    scheduled: 0,
    activeLinks: 0,
    deleted: 0,
  },
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('product catalogs API', () => {
  it('loads all matching pages beyond first100 while forwarding query and permissions consistently', async () => {
    const rows = Array.from({ length: 205 }, (_, index) => ({
      ...catalog,
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    }));
    client.fetch
      .mockResolvedValueOnce(response(page(rows.slice(0, 100), 1, 205)))
      .mockResolvedValueOnce(response(page(rows.slice(100, 200), 2, 205)))
      .mockResolvedValueOnce(response(page(rows.slice(200), 3, 205)));
    const controller = new AbortController();
    const result = await listAllProductCatalogs(
      { q: ' SKF ', includeDeleted: true },
      controller.signal,
    );
    expect(result.items).toHaveLength(205);
    expect(client.fetch).toHaveBeenCalledTimes(3);
    for (const [index, call] of client.fetch.mock.calls.entries()) {
      const url = new URL(String(call[0]), 'https://example.invalid');
      expect(url.searchParams.get('page')).toBe(String(index + 1));
      expect(url.searchParams.get('q')).toBe('SKF');
      expect(url.searchParams.get('includeDeleted')).toBe('true');
      expect(call[1]).toEqual(
        expect.objectContaining({ signal: controller.signal, cache: 'no-store' }),
      );
    }
  });
  it('restarts from page one when a concurrent insertion changes total200 to201', async () => {
    const original = Array.from({ length: 200 }, (_, index) => ({
      ...catalog,
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    }));
    const inserted = { ...catalog, id: '10000000-0000-4000-8000-000000000999' };
    const current = [inserted, ...original];
    client.fetch
      .mockResolvedValueOnce(response(page(original.slice(0, 100), 1, 200)))
      .mockResolvedValueOnce(response(page(current.slice(100, 200), 2, 201)))
      .mockResolvedValueOnce(response(page(current.slice(0, 100), 1, 201)))
      .mockResolvedValueOnce(response(page(current.slice(100, 200), 2, 201)))
      .mockResolvedValueOnce(response(page(current.slice(200), 3, 201)));

    const result = await listAllProductCatalogs({ includeDeleted: true });

    expect(result.total).toBe(201);
    expect(result.items.map((item) => item.id)).toEqual(current.map((item) => item.id));
    expect(
      client.fetch.mock.calls.map((call) =>
        new URL(String(call[0]), 'https://example.invalid').searchParams.get('page'),
      ),
    ).toEqual(['1', '2', '1', '2', '3']);
  });
  it('retries duplicate IDs even if raw page lengths equal the advertised total', async () => {
    const rows = Array.from({ length: 200 }, (_, index) => ({
      ...catalog,
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    }));
    client.fetch
      .mockResolvedValueOnce(response(page(rows.slice(0, 100), 1, 200)))
      .mockResolvedValueOnce(response(page([rows[99]!, ...rows.slice(100, 199)], 2, 200)))
      .mockResolvedValueOnce(response(page(rows.slice(0, 100), 1, 200)))
      .mockResolvedValueOnce(response(page(rows.slice(100), 2, 200)));

    const result = await listAllProductCatalogs();

    expect(result.items).toEqual(rows);
    expect(client.fetch).toHaveBeenCalledTimes(4);
  });
  it.each(['duplicate', 'missing', 'overflow', 'no progress'] as const)(
    'fails clearly after three unstable traversals with %s rows',
    async (failure) => {
      const rows = Array.from({ length: 200 }, (_, index) => ({
        ...catalog,
        id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      }));
      const invalidSecond =
        failure === 'duplicate'
          ? [rows[99]!, ...rows.slice(100, 199)]
          : failure === 'missing'
            ? rows.slice(100, 199)
            : failure === 'overflow'
              ? [...rows.slice(100), { ...catalog, id: '10000000-0000-4000-8000-000000000999' }]
              : [];
      client.fetch.mockImplementation(async (input: string) => {
        const number = Number(new URL(input, 'https://example.invalid').searchParams.get('page'));
        return response(page(number === 1 ? rows.slice(0, 100) : invalidSecond, number, 200));
      });

      await expect(listAllProductCatalogs()).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining('no se pudo obtener una lista completa'),
      });
      expect(client.fetch).toHaveBeenCalledTimes(6);
    },
  );
  it('uploads multipart metadata and allows an update without replacing the current file', async () => {
    client.fetch.mockImplementation(async () => response(catalog));
    const pdf = new File(['%PDF-1.7'], 'catalogo.pdf', { type: 'application/pdf' });
    await createProductCatalog(metadata, pdf);
    const create = client.fetch.mock.calls[0]!;
    expect(create[0]).toBe('/api/product-catalogs');
    expect(create[1].method).toBe('POST');
    expect(create[1].body).toBeInstanceOf(FormData);
    expect(create[1].body.get('validUntil')).toBe('');
    expect(create[1].body.get('file')).toBe(pdf);
    expect(create[1].headers).not.toHaveProperty('content-type');
    await updateProductCatalog(catalog.id, { ...metadata, expectedUpdatedAt: catalog.updatedAt });
    const update = client.fetch.mock.calls[1]!;
    expect(update[0]).toBe(`/api/product-catalogs/${catalog.id}`);
    expect(update[1].method).toBe('POST');
    expect(update[1].body.get('expectedUpdatedAt')).toBe(catalog.updatedAt);
    expect(update[1].body.has('file')).toBe(false);
  });
  it('sends catalog versions for delete and restore, and a share version for revoke', async () => {
    client.fetch.mockImplementation(async () => response(catalog));
    await deleteProductCatalog(catalog.id, catalog.updatedAt);
    await restoreProductCatalog(catalog.id, catalog.updatedAt);
    const share = {
      id: '20000000-0000-4000-8000-000000000001',
      term: '7d',
      note: '',
      expiresAt: null,
      status: 'Revocado',
      createdBy: catalog.createdBy,
      createdAt: catalog.createdAt,
      updatedAt: '2026-10-23T13:00:00.000Z',
      revokedBy: catalog.updatedBy,
      revokedAt: '2026-10-23T13:00:00.000Z',
      views: 0,
      lastViewedAt: null,
    };
    client.fetch.mockResolvedValue(response(share));
    await revokeProductCatalogShare(catalog.id, share.id, share.updatedAt);
    expect(client.fetch.mock.calls.map((call) => [call[0], call[1].method])).toEqual([
      [`/api/product-catalogs/${catalog.id}`, 'DELETE'],
      [`/api/product-catalogs/${catalog.id}/restore`, 'POST'],
      [`/api/product-catalogs/${catalog.id}/shares/${share.id}/revoke`, 'POST'],
    ]);
    expect(JSON.parse(client.fetch.mock.calls[2]![1].body)).toEqual({
      expectedUpdatedAt: share.updatedAt,
    });
  });
  it('returns the one-time generated token without writing it to browser storage', async () => {
    const token = 't'.repeat(43);
    const share = {
      id: '20000000-0000-4000-8000-000000000001',
      term: '7d',
      note: '',
      expiresAt: null,
      status: 'Activo',
      createdBy: catalog.createdBy,
      createdAt: catalog.createdAt,
      updatedAt: catalog.updatedAt,
      revokedBy: null,
      revokedAt: null,
      views: 0,
      lastViewedAt: null,
    };
    client.fetch.mockResolvedValue(response({ share, token }));
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const result = await createProductCatalogShare(catalog.id, {
      term: '7d',
      note: '',
      expectedUpdatedAt: catalog.updatedAt,
    });
    expect(result.token).toBe(token);
    expect(storage).not.toHaveBeenCalled();
  });
  it('keeps conflict status and rejects malformed successful responses', async () => {
    client.fetch.mockResolvedValueOnce(response({ message: 'La versión cambió.' }, 409));
    await expect(listProductCatalogs()).rejects.toEqual(
      new ProductCatalogsApiError('La versión cambió.', 409),
    );
    client.fetch.mockResolvedValueOnce(response({ items: [] }));
    await expect(listProductCatalogs()).rejects.toMatchObject({ status: 502 });
  });
  it('builds same-origin PDF URLs with explicit dispositions', () => {
    expect(productCatalogDownloadUrl(catalog.id)).toBe(
      `/api/product-catalogs/${catalog.id}/file?disposition=inline`,
    );
    expect(productCatalogDownloadUrl(catalog.id, 'attachment')).toBe(
      `/api/product-catalogs/${catalog.id}/file?disposition=attachment`,
    );
  });
});
