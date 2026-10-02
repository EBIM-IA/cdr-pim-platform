import type { ApiEnv } from '@cdr/config';
import { describe, expect, it } from 'vitest';

import { EnvironmentCredentialVerifier } from './environment-credential-verifier.adapter';

const EMAIL = 'admin@casadelruliman.com';
const PASSWORD = 'correct horse battery staple';

const env = {
  AUTH_LOCAL_USER_ID: 'local-admin',
  AUTH_LOCAL_EMAIL: EMAIL,
  AUTH_LOCAL_PASSWORD: PASSWORD,
  AUTH_LOCAL_ROLES: ['ADMIN'],
} as ApiEnv;

describe('EnvironmentCredentialVerifier', () => {
  const verifier = new EnvironmentCredentialVerifier(env);

  it('returns the configured actor for valid credentials', async () => {
    await expect(
      verifier.verify({ email: ' ADMIN@CasaDelRuliman.com ', password: PASSWORD }),
    ).resolves.toEqual({
      id: 'local-admin',
      email: 'admin@casadelruliman.com',
      roles: ['ADMIN'],
    });
  });

  it('returns the same generic miss for an invalid email or password of any length', async () => {
    await expect(
      verifier.verify({ email: 'other@example.com', password: PASSWORD }),
    ).resolves.toBeNull();
    await expect(verifier.verify({ email: EMAIL, password: 'x' })).resolves.toBeNull();
  });

  it('fails closed when the local credentials are not configured', async () => {
    const unconfigured = new EnvironmentCredentialVerifier({
      ...env,
      AUTH_LOCAL_PASSWORD: undefined,
    });
    await expect(unconfigured.verify({ email: EMAIL, password: PASSWORD })).resolves.toBeNull();
  });
});
