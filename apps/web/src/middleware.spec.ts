import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

import { LOCAL_AUTH_COOKIE_NAME } from '@/lib/auth';

import { middleware } from './middleware';

vi.mock('@/lib/env', () => ({ env: { PUBLIC_APP_ORIGIN: 'https://pim.example.test' } }));

describe('web security middleware', () => {
  it('protects a public response with a per-request CSP and no-store policy', () => {
    const response = middleware(new NextRequest('http://localhost:3100/login'));

    expect(response.headers.get('content-security-policy')).toMatch(
      /script-src 'self' 'nonce-[a-f0-9]+' 'strict-dynamic'/u,
    );
    expect(response.headers.get('cache-control')).toContain('private, no-store');
    expect(response.headers.get('vary')).toContain('Cookie');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('redirects unauthenticated pages to the public origin while retaining security headers', () => {
    // Behind the ALB the request URL carries the bind address, never the public name.
    const response = middleware(new NextRequest('http://0.0.0.0:3000/products?status=in_review'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://pim.example.test/login?returnTo=%2Fproducts%3Fstatus%3Din_review',
    );
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  it('allows an authenticated request using the development cookie name', () => {
    const request = new NextRequest('http://localhost:3100/products', {
      headers: { cookie: `${LOCAL_AUTH_COOKIE_NAME}=test-token` },
    });
    const response = middleware(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('serves the health probe anonymously, without a redirect', () => {
    const response = middleware(new NextRequest('http://0.0.0.0:3000/healthz'));

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
  });

  it.each(['/shared/catalogs', '/api/shared/catalogs/resolve', '/api/shared/catalogs/file'])(
    'allows only the exact shared catalog route %s while retaining browser protections',
    (path) => {
      const response = middleware(new NextRequest(`http://localhost:3100${path}`));
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('cache-control')).toContain('private, no-store');
      expect(response.headers.get('content-security-policy')).toContain("object-src 'none'");
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(response.headers.get('x-frame-options')).toBe('DENY');
    },
  );

  it.each([
    '/api/shared/catalogs',
    '/api/shared/catalogs/resolve/extra',
    '/api/shared/catalogs/file/extra',
    '/api/shared/catalogs/another',
    '/api/product-catalogs',
    '/api/product-catalogs/shared/resolve',
  ])('keeps sibling and nested API route %s authenticated', (path) => {
    const response = middleware(new NextRequest(`http://localhost:3100${path}`));
    expect(response.status).toBe(401);
    expect(response.headers.get('x-middleware-next')).toBeNull();
  });

  it('does not exempt other shared pages or a nested catalog route', () => {
    for (const path of ['/shared', '/shared/catalogs/extra', '/shared/another']) {
      const response = middleware(new NextRequest(`http://localhost:3100${path}`));
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/login?returnTo=');
    }
  });
});
