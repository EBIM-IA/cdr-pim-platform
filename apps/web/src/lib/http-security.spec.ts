import { describe, expect, it } from 'vitest';

import {
  AI_UPSTREAM_TIMEOUT_MS,
  IMPORT_UPSTREAM_TIMEOUT_MS,
  UPSTREAM_TIMEOUT_MS,
  applyBrowserSecurityHeaders,
  contentSecurityPolicy,
  securePrivateResponse,
  upstreamTimeoutSignal,
} from './http-security';

describe('HTTP security helpers', () => {
  it('builds a nonce-based production policy without executable inline scripts', () => {
    const policy = contentSecurityPolicy('nonce123', false);

    expect(policy).toContain("script-src 'self' 'nonce-nonce123' 'strict-dynamic'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain('upgrade-insecure-requests');
  });

  it('allows only the development primitives required by Next hot reload', () => {
    const policy = contentSecurityPolicy('devnonce', true);

    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("connect-src 'self' ws: wss:");
    expect(policy).not.toContain('upgrade-insecure-requests');
  });

  it('marks authenticated responses private and preserves existing Vary keys', () => {
    const response = securePrivateResponse(
      new Response('{}', { headers: { Vary: 'RSC, Accept-Encoding' } }),
    );

    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0, must-revalidate',
    );
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('expires')).toBe('0');
    expect(response.headers.get('vary')).toBe('RSC, Accept-Encoding, Cookie');
  });

  it('does not duplicate the Cookie key in Vary', () => {
    const response = securePrivateResponse(new Response('{}', { headers: { Vary: 'cookie' } }));
    expect(response.headers.get('vary')).toBe('cookie');
  });

  it('adds browser protections and enables HSTS only in production', () => {
    const developmentHeaders = new Headers();
    applyBrowserSecurityHeaders(developmentHeaders, {
      contentSecurityPolicy: "default-src 'self'",
      production: false,
    });
    expect(developmentHeaders.get('strict-transport-security')).toBeNull();

    const productionHeaders = new Headers();
    applyBrowserSecurityHeaders(productionHeaders, {
      contentSecurityPolicy: "default-src 'self'",
      production: true,
    });
    expect(productionHeaders.get('content-security-policy')).toBe("default-src 'self'");
    expect(productionHeaders.get('strict-transport-security')).toBe('max-age=31536000');
    expect(productionHeaders.get('x-frame-options')).toBe('DENY');
    expect(productionHeaders.get('x-content-type-options')).toBe('nosniff');
    expect(productionHeaders.get('referrer-policy')).toBe('no-referrer');
  });

  it('creates an abort signal with a finite lifetime', async () => {
    const signal = upstreamTimeoutSignal(1);
    expect(signal.aborted).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(signal.aborted).toBe(true);
  });

  it('keeps the longer import timeout scoped away from the global default', () => {
    expect(IMPORT_UPSTREAM_TIMEOUT_MS).toBe(60_000);
    expect(AI_UPSTREAM_TIMEOUT_MS).toBe(45_000);
    expect(UPSTREAM_TIMEOUT_MS).toBe(10_000);
  });
});
