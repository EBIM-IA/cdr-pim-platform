import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchCatalogGrid,
  fetchCatalogCategories,
  fetchCatalogWorkbook,
  patchProductAttribute,
  reassignProductTemplate,
} from '@/lib/dynamic-catalog-api';

afterEach(() => vi.unstubAllGlobals());

describe('dynamic catalog browser client', () => {
  it('keeps repeated filters when requesting the data sheet', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 1, pageSize: 25, total: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchCatalogGrid({
      categoryId: '11111111-1111-4111-8111-111111111111',
      templateId: '22222222-2222-4222-8222-222222222222',
      page: 1,
      pageSize: 25,
      filter: ['material:contains:acero', 'diametro:eq:20'],
    });

    const [rawUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(rawUrl, 'http://localhost');
    expect(url.searchParams.get('templateId')).toBe('22222222-2222-4222-8222-222222222222');
    expect(url.searchParams.getAll('filter')).toEqual([
      'material:contains:acero',
      'diametro:eq:20',
    ]);
  });

  it('preserves a 409 so the UI can recover from an edit conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'El atributo fue modificado.' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const request = patchProductAttribute('11111111-1111-4111-8111-111111111111', 'material', {
      value: 'Acero',
      expectedVersion: 2,
    });

    await expect(request).rejects.toMatchObject({
      name: 'DynamicCatalogApiError',
      status: 409,
      message: 'El atributo fue modificado.',
    });
  });

  it('sends optional workbook filters through the authenticated BFF', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          columns: [],
          facets: { brands: [], applicationTypes: [], statuses: [] },
          items: [],
          page: 2,
          pageSize: 50,
          total: 0,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchCatalogWorkbook({
      categoryId: '11111111-1111-4111-8111-111111111111',
      page: 2,
      pageSize: 50,
      q: '2RS',
      brand: 'FAG',
      status: 'in_review',
      applicationType: 'INDUSTRIAL',
      completeness: 'attention',
      filter: ['diametro:gte:20'],
    });

    const [rawUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(rawUrl, 'http://localhost');
    expect(url.pathname).toBe('/api/catalog/dynamic/workbook');
    expect(Object.fromEntries(url.searchParams.entries())).toMatchObject({
      page: '2',
      pageSize: '50',
      q: '2RS',
      brand: 'FAG',
      status: 'in_review',
      applicationType: 'INDUSTRIAL',
      completeness: 'attention',
    });
    expect(url.searchParams.getAll('filter')).toEqual(['diametro:gte:20']);
    expect(init.credentials).toBe('same-origin');
  });

  it('preserves unclassified workbook rows through response validation', async () => {
    const pending = {
      id: '11111111-1111-4111-8111-111111111111',
      sku: 'SIN-CLASIFICAR',
      name: 'Producto sin plantilla',
      description: null,
      brand: null,
      status: 'draft',
      updatedAt: '2026-10-22T10:00:00.000Z',
      category: null,
      template: null,
      completeness: null,
      providerCode: null,
      unifiedCode: null,
      applicationTypes: [],
      attributes: {},
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            columns: [],
            facets: { brands: [], applicationTypes: [], statuses: ['draft'] },
            items: [pending],
            page: 1,
            pageSize: 25,
            total: 1,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const result = await fetchCatalogWorkbook({ page: 1, pageSize: 25, filter: [] });
    expect(result.items).toEqual([pending]);
    expect(result.total).toBe(1);
  });

  it('preserves persisted category ancestors through response validation', async () => {
    const category = {
      id: '33333333-3333-4333-8333-333333333333',
      slug: 'bolas',
      name: 'De bolas',
      path: 'Rodamientos > De bolas',
      templateId: '44444444-4444-4444-8444-444444444444',
      templateName: 'De bolas',
      templateVariantKey: '14',
      templateVersion: 1,
      ancestors: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          slug: 'rodamientos',
          name: 'Rodamientos',
          path: 'Rodamientos',
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([category]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    expect(await fetchCatalogCategories()).toEqual([category]);
  });

  it('sends the expected template id when reassigning a product variant', async () => {
    const productId = '11111111-1111-4111-8111-111111111111';
    const previousTemplateId = '22222222-2222-4222-8222-222222222222';
    const templateId = '33333333-3333-4333-8333-333333333333';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          productId,
          category: {
            id: '44444444-4444-4444-8444-444444444444',
            slug: 'filtros',
            name: 'Filtros',
          },
          previousTemplateId,
          template: {
            id: templateId,
            variantKey: '22.2',
            name: 'Filtro cilíndrico',
            version: 1,
          },
          assignedAt: '2026-10-19T17:00:00.000Z',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await reassignProductTemplate(productId, {
      templateId,
      expectedTemplateId: previousTemplateId,
    });

    const [rawUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(rawUrl, 'http://localhost').pathname).toBe(
      `/api/catalog/dynamic/products/${productId}/template`,
    );
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({
      templateId,
      expectedTemplateId: previousTemplateId,
    });
  });
});
