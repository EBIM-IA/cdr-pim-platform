import type { ApiEnv } from '@cdr/config';
import { describe, expect, it } from 'vitest';

import { EnvironmentCredentialVerifier } from './environment-credential-verifier.adapter';

const env = {
  AUTH_LOCAL_USER_ID: 'local-admin',
  AUTH_LOCAL_EMAIL: 'admin@casadelruliman.com',
  AUTH_LOCAL_PASSWORD: 'correct horse battery staple',
  AUTH_LOCAL_ROLES: ['ADMIN'],
} as ApiEnv;

describe('EnvironmentCredentialVerifier', () => {
  const verifier = new EnvironmentCredentialVerifier(env);

  it('returns the configured actor for valid credentials', async () => {
    await expect(
      verifier.verify({ email: ' ADMIN@CasaDelRuliman.com ', password: env.AUTH_LOCAL_PASSWORD }),
    ).resolves.toEqual({
      id: 'local-admin',
      email: 'admin@casadelruliman.com',
      roles: ['ADMIN'],
    });
  });

  it('returns the same generic miss for an invalid email or password of any length', async () => {
    await expect(
      verifier.verify({ email: 'other@example.com', password: env.AUTH_LOCAL_PASSWORD }),
    ).resolves.toBeNull();
    await expect(
      verifier.verify({ email: env.AUTH_LOCAL_EMAIL, password: 'x' }),
    ).resolves.toBeNull();
  });
});
