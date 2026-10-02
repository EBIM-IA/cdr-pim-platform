import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST as login } from './login/route';
import { POST as logout } from './logout/route';

const PUBLIC_APP_ORIGIN = 'https://pim.example.test';

vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'production',
    API_BASE_URL: 'http://api.internal:3001',
    PUBLIC_APP_ORIGIN: 'https://pim.example.test',
  },
}));

/** What Next hands the route behind the ALB: the bind address, not the public name. */
function post(path: string, headers: Record<string, string>, body: unknown = {}): NextRequest {
  return new NextRequest(`http://0.0.0.0:3000${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const credentials = { email: 'admin@casadelruliman.com', password: 'a-long-enough-password' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('login and logout origin checks', () => {
  it('accepts the configured public origin even though the server binds to 0.0.0.0', async () => {
    const upstream = vi.fn().mockResolvedValue(
      Response.json({
        accessToken: 'token',
        tokenType: 'Bearer',
        expiresIn: '15m',
        actor: { id: 'local-admin', email: credentials.email, roles: ['ADMIN'] },
      }),
    );
    vi.stubGlobal('fetch', upstream);

    const response = await login(
      post(
        '/api/auth/login',
        { origin: PUBLIC_APP_ORIGIN, 'x-forwarded-for': '198.51.100.1, 203.0.113.7' },
        credentials,
      ),
    );

    expect(response.status).toBe(200);
    // Only the ALB-appended address reaches the API's login throttle.
    const init = upstream.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-forwarded-for']).toBe('203.0.113.7');
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^__Host-cdr_pim_session=token/u);
    expect(cookie).toMatch(/Secure/iu);
    expect(cookie).toMatch(/HttpOnly/iu);
    expect(cookie).toMatch(/SameSite=lax/iu);
  });

  it.each([
    ['the bind address', 'http://0.0.0.0:3000'],
    ['plain http on the public host', 'http://pim.example.test'],
    ['another site', 'https://attacker.example'],
  ])('rejects a login from %s', async (_label, origin) => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const response = await login(post('/api/auth/login', { origin }, credentials));

    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects a login without an Origin header', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const response = await login(post('/api/auth/login', {}, credentials));
    expect(response.status).toBe(403);
  });

  it('logs out from the public origin and redirects within it', async () => {
    const accepted = await logout(post('/api/auth/logout', { origin: PUBLIC_APP_ORIGIN }));
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toEqual({ redirectTo: '/login' });

    const navigation = await logout(
      new NextRequest('http://0.0.0.0:3000/api/auth/logout', {
        method: 'POST',
        headers: { origin: PUBLIC_APP_ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
        body: 'returnTo=%2Fproducts',
      }),
    );
    expect(navigation.status).toBe(303);
    expect(navigation.headers.get('location')).toBe(`${PUBLIC_APP_ORIGIN}/products`);
  });

  it('rejects a logout from another origin', async () => {
    const response = await logout(post('/api/auth/logout', { origin: 'https://attacker.example' }));
    expect(response.status).toBe(403);
  });
});
