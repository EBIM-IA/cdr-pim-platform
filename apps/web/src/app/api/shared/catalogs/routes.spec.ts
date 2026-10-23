import { PRODUCT_CATALOG_MAX_BYTES, productCatalogSharedRequestSchema } from '@cdr/contracts';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: { API_BASE_URL: 'http://api.internal', PUBLIC_APP_ORIGIN: 'https://pim.example.test' },
}));

import { proxyPublicCatalog } from '@/lib/product-catalog-public-proxy';

import { POST as file } from './file/route';
import { POST as resolve } from './resolve/route';

const token = 'a'.repeat(43);
const metadata = {
  title: 'Catálogo industrial',
  description: 'Rodamientos y repuestos',
  fileName: 'catalogo.pdf',
  fileSize: 10,
  validFrom: '2026-10-01',
  validUntil: null,
  expiresAt: '2026-11-01T12:00:00.000Z',
};
const upstream = vi.fn();

function request(
  operation: 'resolve' | 'file',
  body: unknown = { token },
  headers: Record<string, string> = {},
) {
  return new NextRequest(`http://0.0.0.0:3000/api/shared/catalogs/${operation}`, {
    method: 'POST',
    headers: {
      origin: 'https://pim.example.test',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', upstream);
});
afterEach(() => vi.unstubAllGlobals());

describe('anonymous catalog proxies', () => {
  it.each([resolve, file])(
    'rejects cross-origin requests before contacting the API',
    async (route) => {
      const response = await route(
        request('resolve', { token }, { origin: 'https://attacker.test' }),
      );
      expect(response.status).toBe(403);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it.each(['', 'null', 'http://0.0.0.0:3000'])(
    'rejects absent, opaque or internal origins (%s)',
    async (origin) => {
      const response = await resolve(request('resolve', { token }, { origin }));
      expect(response.status).toBe(403);
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it.each([
    { token: 'short' },
    { token: 'a'.repeat(44) },
    { token: `${'a'.repeat(42)}=` },
    { token, extra: 'not-allowed' },
    {},
  ])('rejects invalid share input before forwarding', async (body) => {
    const response = await resolve(request('resolve', body));
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(token);
  });

  it('requires JSON and bounds both declared and actual request bodies', async () => {
    expect(
      (await resolve(request('resolve', { token }, { 'content-type': 'text/plain' }))).status,
    ).toBe(415);
    expect(
      (await resolve(request('resolve', { token }, { 'content-length': '4097' }))).status,
    ).toBe(413);
    expect((await resolve(request('resolve', { token: 'a'.repeat(5000) }))).status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('forwards the credential only in a POST body, without session headers or redirects', async () => {
    upstream.mockResolvedValue(Response.json(metadata));
    const response = await resolve(
      request(
        'resolve',
        { token },
        {
          cookie: 'cdr_pim_session=private-session',
          authorization: 'Bearer browser-secret',
          'x-forwarded-for': '198.51.100.1, 203.0.113.9',
        },
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(metadata);
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.internal/api/v1/product-catalogs/shared/resolve');
    expect(url).not.toContain(token);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ token }));
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init.headers);
    expect(headers.has('cookie')).toBe(false);
    expect(headers.has('authorization')).toBe(false);
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.9');
    expect(response.headers.get('cache-control')).toContain('private, no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('does not echo tokens or arbitrary upstream errors', async () => {
    upstream.mockResolvedValue(Response.json({ message: `Revoked ${token}` }, { status: 410 }));
    const response = await resolve(request('resolve'));
    expect(response.status).toBe(410);
    expect(await response.text()).not.toContain(token);
    upstream.mockResolvedValue(Response.json({ internal: token }));
    const malformed = await resolve(request('resolve'));
    expect(malformed.status).toBe(502);
    expect(await malformed.text()).not.toContain(token);
  });

  it('keeps throttle responses understandable without forwarding arbitrary headers', async () => {
    upstream.mockResolvedValue(
      new Response(null, { status: 429, headers: { 'retry-after': '30' } }),
    );
    const response = await resolve(request('resolve'));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
  });

  it('handles network and redirect failures without exposing the credential', async () => {
    upstream.mockRejectedValue(new Error(`Redirect failed: ${token}`));
    const response = await resolve(request('resolve'));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(token);
  });

  it('streams a PDF with download headers and no browser session', async () => {
    const pdf = '%PDF-1.7\nexample';
    upstream.mockResolvedValue(
      new Response(pdf, {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="catalogo.pdf"',
          'content-length': String(pdf.length),
        },
      }),
    );
    const response = await file(request('file'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(pdf);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(upstream.mock.calls[0]![0]).toBe(
      'http://api.internal/api/v1/product-catalogs/shared/file',
    );
    expect(new Headers(upstream.mock.calls[0]![1].headers).has('authorization')).toBe(false);
  });

  it.each(['text/html', 'application/octet-stream', 'application/pdf-malicious'])(
    'rejects unexpected download MIME %s',
    async (contentType) => {
      upstream.mockResolvedValue(
        new Response('not-pdf', { headers: { 'content-type': contentType } }),
      );
      const response = await file(request('file'));
      expect(response.status).toBe(502);
      expect(response.headers.get('content-type')).toContain('application/json');
    },
  );

  it('rejects an oversized declared PDF before sending binary bytes', async () => {
    upstream.mockResolvedValue(
      new Response('%PDF', {
        headers: {
          'content-type': 'application/pdf',
          'content-length': String(PRODUCT_CATALOG_MAX_BYTES + 1),
        },
      }),
    );
    const response = await file(request('file'));
    expect(response.status).toBe(502);
  });

  it('also bounds streamed PDFs when upstream omits Content-Length', async () => {
    upstream.mockResolvedValue(
      new Response('%PDF-too-long', { headers: { 'content-type': 'application/pdf' } }),
    );
    const response = await proxyPublicCatalog(request('file'), {
      operation: 'file',
      inputSchema: productCatalogSharedRequestSchema,
      maxFileBytes: 4,
    });
    await expect(response.arrayBuffer()).rejects.toThrow('El PDF supera el tamaño permitido.');
  });
});
