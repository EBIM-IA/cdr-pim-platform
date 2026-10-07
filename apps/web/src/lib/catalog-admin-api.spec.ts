import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  listAdminCategories,
  updateAdminCategory,
  updateAdminTemplateAttribute,
} from '@/lib/catalog-admin-api';

afterEach(() => vi.unstubAllGlobals());

describe('catalog administration browser client', () => {
  it('requests inactive categories explicitly', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listAdminCategories(true);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/catalog/admin/categories?includeInactive=true');
  });

  it('sends the category timestamp used for optimistic concurrency', async () => {
    const updatedAt = '2026-10-05T12:00:00.000Z';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          parentId: null,
          slug: 'rodamientos',
          name: 'Rodamientos',
          path: '/rodamientos',
          application: 'INDUSTRIAL',
          sourcePriority: { fabricante: 1, archivo: 2, manual: 3, tecdoc: 4 },
          position: 2,
          active: true,
          updatedAt,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await updateAdminCategory('11111111-1111-4111-8111-111111111111', {
      name: 'Rodamientos',
      position: 2,
      expectedUpdatedAt: updatedAt,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toMatchObject({ expectedUpdatedAt: updatedAt });
  });

  it('preserves template conflicts so the editor can reload the current matrix', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'La asignación cambió.' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const request = updateAdminTemplateAttribute(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      {
        active: true,
        replicable: true,
        roleAccess: [
          {
            role: 'ADMINISTRADOR',
            canView: true,
            canEdit: true,
            canImport: true,
            canExport: true,
          },
        ],
        expectedUpdatedAt: '2026-10-05T12:00:00.000Z',
      },
    );

    await expect(request).rejects.toMatchObject({
      name: 'CatalogAdminApiError',
      status: 409,
      message: 'La asignación cambió.',
    });
  });
});
