import { describe, expect, it } from 'vitest';

import {
  actorInitials,
  actorRoleLabel,
  authCookieName,
  authMeResponseSchema,
  durationToSeconds,
  hasExpectedOrigin,
  loginFailureMessage,
  loginResponseSchema,
  safeReturnTo,
  sessionCookieOptions,
} from './auth';

describe('auth security helpers', () => {
  it('keeps a local return path, query and fragment', () => {
    expect(safeReturnTo('/products?status=in_review#results')).toBe(
      '/products?status=in_review#results',
    );
  });

  it.each([
    'https://attacker.example',
    '//attacker.example/path',
    '/\\attacker.example/path',
    'products',
    '/login',
    '/api/auth/logout',
    '/products\nLocation: https://attacker.example',
  ])('rejects unsafe return destination %s', (value) => {
    expect(safeReturnTo(value)).toBe('/');
  });

  it('requires an exact valid origin, including scheme and port', () => {
    expect(hasExpectedOrigin('http://localhost:3100', 'http://localhost:3100')).toBe(true);
    expect(hasExpectedOrigin('https://cdr.example', 'https://cdr.example/products')).toBe(true);
    expect(hasExpectedOrigin('http://localhost:9999', 'http://localhost:3100')).toBe(false);
    expect(hasExpectedOrigin('https://attacker.example', 'https://cdr.example')).toBe(false);
    expect(hasExpectedOrigin(null, 'https://cdr.example')).toBe(false);
    expect(hasExpectedOrigin('not-a-url', 'https://cdr.example')).toBe(false);
  });

  it('creates a server-only, same-site session cookie and caps its lifetime', () => {
    expect(authCookieName(false)).toBe('cdr_pim_session');
    expect(authCookieName(true)).toBe('__Host-cdr_pim_session');
    expect(durationToSeconds('15m')).toBe(15 * 60);
    expect(durationToSeconds('500ms')).toBe(1);
    expect(sessionCookieOptions('1h', false)).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 60 * 60,
      priority: 'high',
    });
    expect(sessionCookieOptions('999999999y', true)).toMatchObject({
      secure: true,
      maxAge: 60 * 60 * 24 * 7,
    });
  });

  it('fixes the login and current-actor response envelopes', () => {
    expect(
      loginResponseSchema.safeParse({
        actor: { id: 'user-1', email: 'user@cdr.example', roles: ['VIEWER'] },
        accessToken: 'access-token',
        expiresIn: '15m',
      }).success,
    ).toBe(true);
    expect(
      loginResponseSchema.safeParse({
        actor: { id: 'user-1', email: 'user@cdr.example', roles: ['VIEWER'] },
        accessToken: 'access-token',
        expiresIn: 3600,
      }).success,
    ).toBe(false);
    expect(
      authMeResponseSchema.safeParse({
        actor: { id: 'user-1', email: 'user@cdr.example', roles: ['ADMIN'] },
      }).success,
    ).toBe(true);
    expect(
      authMeResponseSchema.safeParse({
        id: 'user-1',
        email: 'user@cdr.example',
        roles: ['ADMIN'],
      }).success,
    ).toBe(false);
  });

  it('derives concise profile labels from the authenticated actor', () => {
    expect(actorInitials('eva.faustor@cdr.example')).toBe('EF');
    expect(actorRoleLabel(['catalogador', 'revisor'])).toBe('catalogador · revisor');
    expect(actorRoleLabel([])).toBe('Sin rol asignado');
  });

  it('localizes login failures without exposing an upstream response body', () => {
    expect(loginFailureMessage(401)).toBe('El correo o la contraseña son incorrectos.');
    expect(loginFailureMessage(429)).toContain('demasiados intentos');
    expect(loginFailureMessage(502)).toContain('no está disponible');
  });
});
