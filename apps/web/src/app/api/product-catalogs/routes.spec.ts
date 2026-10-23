import { PRODUCT_CATALOG_MAX_BYTES, type ProductCatalogDto } from '@cdr/contracts';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAccessToken } = vi.hoisted(() => ({ getAccessToken: vi.fn() }));
vi.mock('@/lib/env', () => ({
  env: { API_BASE_URL: 'http://api.internal', PUBLIC_APP_ORIGIN: 'http://localhost:3100' },
}));
vi.mock('@/lib/server-auth', () => ({ getAccessToken }));

import { GET as list, POST as create } from './route';
import { GET as detail, POST as update, DELETE as remove } from './[id]/route';
import { POST as restore } from './[id]/restore/route';
import { GET as file } from './[id]/file/route';
import { POST as share } from './[id]/shares/route';
import { POST as revoke } from './[id]/shares/[shareId]/revoke/route';

const id = '10000000-0000-4000-8000-000000000001';
const shareId = '10000000-0000-4000-8000-000000000002';
const updatedAt = '2026-10-23T10:00:00.000Z';
const catalog: ProductCatalogDto = {
  id,
  code: 'CAT-001',
  title: 'Rodamientos',
  description: 'Catálogo industrial',
  validFrom: '2026-10-01',
  validUntil: null,
  status: 'Vigente',
  fileName: 'rodamientos.pdf',
  fileSize: 100,
  activeLinks: 0,
  totalLinks: 0,
  createdBy: 'admin',
  createdAt: updatedAt,
  updatedBy: 'admin',
  updatedAt,
  deletedAt: null,
  deletedBy: null,
};
const shareRecord = {
  id: shareId,
  term: '7d',
  note: 'Cliente',
  expiresAt: '2026-10-30T10:00:00.000Z',
  status: 'Activo',
  createdBy: 'admin',
  createdAt: updatedAt,
  updatedAt: '2026-10-23T11:00:00.000Z',
  revokedBy: null,
  revokedAt: null,
  views: 0,
  lastViewedAt: null,
};
const context = { params: Promise.resolve({ id, shareId }) };
const upstream = vi.fn();
const origin = 'http://localhost:3100';

function jsonRequest(path: string, method: string, body: unknown) {
  return new NextRequest(`${origin}/api/product-catalogs${path}`, {
    method,
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function multipartRequest(path = '', extraHeaders: Record<string, string> = {}) {
  const form = new FormData();
  form.set('title', catalog.title);
  form.set('validFrom', catalog.validFrom);
  form.set('validUntil', '');
  form.set('file', new File(['%PDF-1.7'], catalog.fileName, { type: 'application/pdf' }));
  return new NextRequest(`${origin}/api/product-catalogs${path}`, {
    method: 'POST',
    headers: { origin, ...extraHeaders },
    body: form,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  getAccessToken.mockResolvedValue('server-session');
  vi.stubGlobal('fetch', upstream);
});
afterEach(() => vi.unstubAllGlobals());

describe('private product catalog routes', () => {
  it('forwards validated list pagination, deleted visibility and search with the server session', async () => {
    upstream.mockResolvedValue(
      Response.json({
        items: [catalog],
        page: 2,
        pageSize: 20,
        total: 21,
        metrics: {
          catalogs: 21,
          current: 21,
          expiring: 0,
          expired: 0,
          scheduled: 0,
          activeLinks: 0,
          deleted: 0,
        },
      }),
    );
    const response = await list(
      new NextRequest(
        `${origin}/api/product-catalogs?page=2&pageSize=20&q=SKF%20%26%20FAG&includeDeleted=true`,
      ),
    );
    expect(response.status).toBe(200);
    expect(upstream.mock.calls[0]![0]).toBe(
      'http://api.internal/api/v1/product-catalogs?page=2&pageSize=20&includeDeleted=true&q=SKF+%26+FAG',
    );
    const headers = new Headers(upstream.mock.calls[0]![1].headers);
    expect(headers.get('authorization')).toBe('Bearer server-session');
    expect(response.headers.get('cache-control')).toContain('private, no-store');
    expect(await response.text()).not.toContain('server-session');
  });

  it.each(['page=0', 'pageSize=101', 'includeDeleted=yes'])(
    'rejects invalid list filters %s before forwarding',
    async (query) => {
      expect((await list(new NextRequest(`${origin}/api/product-catalogs?${query}`))).status).toBe(
        400,
      );
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it('requires a session for metadata and PDF access', async () => {
    getAccessToken.mockResolvedValue(null);
    const request = new NextRequest(`${origin}/api/product-catalogs/${id}`);
    expect((await detail(request, context)).status).toBe(401);
    expect((await file(request, context)).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('reads detail through the complete shared response contract', async () => {
    upstream.mockResolvedValue(Response.json({ catalog, shares: [shareRecord], audit: [] }));
    const response = await detail(new NextRequest(`${origin}/api/product-catalogs/${id}`), context);
    expect(response.status).toBe(200);
    expect(upstream.mock.calls[0]![0]).toBe(`http://api.internal/api/v1/product-catalogs/${id}`);
    await expect(response.json()).resolves.toEqual({ catalog, shares: [shareRecord], audit: [] });
  });

  it('uses multipart POST for both create and update without exposing credentials', async () => {
    upstream.mockImplementation(async () => Response.json(catalog, { status: 201 }));
    expect((await create(multipartRequest())).status).toBe(201);
    expect((await update(multipartRequest(`/${id}`), context)).status).toBe(201);
    expect(upstream.mock.calls.map(([url]) => url)).toEqual([
      'http://api.internal/api/v1/product-catalogs',
      `http://api.internal/api/v1/product-catalogs/${id}`,
    ]);
    for (const [, init] of upstream.mock.calls) {
      expect(init.method).toBe('POST');
      expect(new Headers(init.headers).get('content-type')).toContain(
        'multipart/form-data; boundary=',
      );
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer server-session');
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('rejects cross-origin multipart before reading the session and enforces the PDF plus overhead limit', async () => {
    expect((await create(multipartRequest('', { origin: 'https://attacker.test' }))).status).toBe(
      403,
    );
    expect(getAccessToken).not.toHaveBeenCalled();
    const oversized = { 'content-length': String(PRODUCT_CATALOG_MAX_BYTES + 64 * 1024 + 1) };
    expect((await create(multipartRequest('', oversized))).status).toBe(413);
    expect((await update(multipartRequest(`/${id}`, oversized), context)).status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects invalid resource identifiers on every private resource route', async () => {
    const invalid = { params: Promise.resolve({ id: 'invalid', shareId: 'invalid' }) };
    const request = jsonRequest('/invalid', 'POST', { expectedUpdatedAt: updatedAt });
    for (const route of [detail, update, remove, restore, file, share, revoke]) {
      expect((await route(request, invalid)).status).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it('passes optimistic versions in JSON for delete and restore', async () => {
    upstream.mockImplementation(async () => Response.json(catalog));
    expect(
      (await remove(jsonRequest(`/${id}`, 'DELETE', { expectedUpdatedAt: updatedAt }), context))
        .status,
    ).toBe(200);
    expect(
      (
        await restore(
          jsonRequest(`/${id}/restore`, 'POST', { expectedUpdatedAt: updatedAt }),
          context,
        )
      ).status,
    ).toBe(200);
    expect(upstream.mock.calls[0]![1].method).toBe('DELETE');
    expect(upstream.mock.calls[1]![1].method).toBe('POST');
    for (const [, init] of upstream.mock.calls)
      expect(JSON.parse(init.body)).toEqual({ expectedUpdatedAt: updatedAt });
    expect(upstream.mock.calls[1]![0]).toBe(
      `http://api.internal/api/v1/product-catalogs/${id}/restore`,
    );
  });

  it('rejects missing versions and cross-origin share mutations without contacting the API', async () => {
    expect((await remove(jsonRequest(`/${id}`, 'DELETE', {}), context)).status).toBe(400);
    expect((await restore(jsonRequest(`/${id}/restore`, 'POST', {}), context)).status).toBe(400);
    expect(
      (await revoke(jsonRequest(`/${id}/shares/${shareId}/revoke`, 'POST', {}), context)).status,
    ).toBe(400);
    const request = jsonRequest(`/${id}/shares`, 'POST', {
      term: '7d',
      expectedUpdatedAt: updatedAt,
    });
    request.headers.set('origin', 'https://attacker.test');
    expect((await share(request, context)).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('creates a share and revokes it using the share version rather than the catalog version', async () => {
    const generated = { share: shareRecord, token: 'b'.repeat(43) };
    upstream
      .mockResolvedValueOnce(Response.json(generated))
      .mockResolvedValueOnce(Response.json({ ...shareRecord, status: 'Revocado' }));
    const response = await share(
      jsonRequest(`/${id}/shares`, 'POST', {
        term: '7d',
        note: 'Cliente',
        expectedUpdatedAt: updatedAt,
      }),
      context,
    );
    await expect(response.json()).resolves.toEqual(generated);
    expect(
      (
        await revoke(
          jsonRequest(`/${id}/shares/${shareId}/revoke`, 'POST', {
            expectedUpdatedAt: shareRecord.updatedAt,
          }),
          context,
        )
      ).status,
    ).toBe(200);
    expect(upstream.mock.calls[1]![0]).toBe(
      `http://api.internal/api/v1/product-catalogs/${id}/shares/${shareId}/revoke`,
    );
    expect(JSON.parse(upstream.mock.calls[1]![1].body)).toEqual({
      expectedUpdatedAt: shareRecord.updatedAt,
    });
  });

  it('downloads only a PDF and forwards a validated disposition', async () => {
    upstream.mockResolvedValueOnce(
      new Response('%PDF-1.7', {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'inline; filename="catalogo.pdf"',
        },
      }),
    );
    const response = await file(
      new NextRequest(`${origin}/api/product-catalogs/${id}/file?disposition=inline`),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('%PDF-1.7');
    expect(response.headers.get('content-disposition')).toContain('inline');
    expect(upstream.mock.calls[0]![0]).toBe(
      `http://api.internal/api/v1/product-catalogs/${id}/file?disposition=inline`,
    );
    expect(
      (
        await file(
          new NextRequest(`${origin}/api/product-catalogs/${id}/file?disposition=unsafe`),
          context,
        )
      ).status,
    ).toBe(400);
    upstream.mockResolvedValueOnce(
      new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }),
    );
    expect(
      (await file(new NextRequest(`${origin}/api/product-catalogs/${id}/file`), context)).status,
    ).toBe(502);
  });
});
