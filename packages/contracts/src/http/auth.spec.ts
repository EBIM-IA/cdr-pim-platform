import { describe, expect, it } from 'vitest';

import { authMeResponseSchema, loginRequestSchema, loginResponseSchema } from './auth';

const actor = {
  id: 'local-admin',
  email: 'admin@casadelruliman.com',
  roles: ['ADMIN'] as const,
};

describe('authentication contracts', () => {
  it('normalizes a login email without modifying the password', () => {
    expect(
      loginRequestSchema.parse({ email: '  admin@casadelruliman.com ', password: ' secret ' }),
    ).toEqual({ email: 'admin@casadelruliman.com', password: ' secret ' });
  });

  it('accepts the login and current-actor wire formats', () => {
    expect(
      loginResponseSchema.parse({ actor, accessToken: 'signed-token', expiresIn: '15m' }),
    ).toMatchObject({ actor, expiresIn: '15m' });
    expect(authMeResponseSchema.parse({ actor })).toEqual({ actor });
  });

  it('rejects unknown roles and malformed credentials', () => {
    expect(() => loginRequestSchema.parse({ email: 'not-an-email', password: '' })).toThrow();
    expect(() =>
      authMeResponseSchema.parse({ actor: { ...actor, roles: ['SUPERUSER'] } }),
    ).toThrow();
  });
});
