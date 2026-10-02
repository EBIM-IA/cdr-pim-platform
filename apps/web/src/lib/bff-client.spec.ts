import { describe, expect, it, vi } from 'vitest';

import {
  LogoutError,
  SessionExpiredError,
  authenticatedBffFetch,
  expiredSessionLoginPath,
  logoutSession,
  returnPathFromLocation,
} from './bff-client';

describe('authenticated BFF client', () => {
  it('preserves the current application path for a new login', () => {
    const returnTo = returnPathFromLocation({
      pathname: '/products',
      search: '?status=in_review',
      hash: '#results',
    });
    expect(returnTo).toBe('/products?status=in_review#results');
    expect(expiredSessionLoginPath(returnTo)).toBe(
      '/login?returnTo=%2Fproducts%3Fstatus%3Din_review%23results',
    );
  });

  it('returns successful BFF responses without side effects', async () => {
    const response = new Response('{}', { status: 200 });
    const fetcher = vi.fn().mockResolvedValue(response);
    const redirect = vi.fn();

    await expect(
      authenticatedBffFetch('/api/catalog/products', undefined, {
        fetcher,
        redirect,
        location: { pathname: '/products', search: '', hash: '' },
      }),
    ).resolves.toBe(response);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('clears the server cookie and redirects when a BFF returns 401', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const redirect = vi.fn();

    await expect(
      authenticatedBffFetch('/api/catalog/products', undefined, {
        fetcher,
        redirect,
        location: { pathname: '/products', search: '?page=2', hash: '' },
      }),
    ).rejects.toBeInstanceOf(SessionExpiredError);

    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(redirect).toHaveBeenCalledWith('/login?returnTo=%2Fproducts%3Fpage%3D2');
  });

  it('closes the session through a same-origin JSON request', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(logoutSession(fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
      }),
    );
  });

  it('reports a rejected logout without navigating to an API response', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 403 }));
    await expect(logoutSession(fetcher)).rejects.toBeInstanceOf(LogoutError);
  });
});
