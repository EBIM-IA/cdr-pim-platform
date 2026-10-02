import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { LOCAL_AUTH_COOKIE_NAME } from '@/lib/auth';

import { middleware } from './middleware';

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

  it('redirects unauthenticated pages while retaining security headers', () => {
    const response = middleware(new NextRequest('http://localhost:3100/products?status=in_review'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3100/login?returnTo=%2Fproducts%3Fstatus%3Din_review',
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
});
