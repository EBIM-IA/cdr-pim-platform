import { UnauthorizedError } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import { Role } from '../domain/entities/role';
import type { CredentialVerifierPort } from '../domain/ports/credential-verifier.port';
import type { TokenServicePort } from '../domain/ports/token-service.port';
import { AuthenticateUseCase } from './authenticate.use-case';

const input = { email: 'admin@casadelruliman.com', password: 'local-password' };
const actor = { id: 'local-admin', email: input.email, roles: [Role.Admin] } as const;

describe('AuthenticateUseCase', () => {
  it('issues an access token after the credentials are verified', async () => {
    const credentials: CredentialVerifierPort = { verify: vi.fn().mockResolvedValue(actor) };
    const tokens: TokenServicePort = {
      issue: vi.fn().mockResolvedValue({ accessToken: 'token', expiresIn: '15m' }),
      verifyAccessToken: vi.fn(),
    };

    await expect(new AuthenticateUseCase(credentials, tokens).execute(input)).resolves.toEqual({
      actor,
      accessToken: 'token',
      expiresIn: '15m',
    });
    expect(tokens.issue).toHaveBeenCalledWith(actor);
  });

  it('rejects invalid credentials without issuing a token', async () => {
    const credentials: CredentialVerifierPort = { verify: vi.fn().mockResolvedValue(null) };
    const tokens: TokenServicePort = {
      issue: vi.fn(),
      verifyAccessToken: vi.fn(),
    };

    await expect(new AuthenticateUseCase(credentials, tokens).execute(input)).rejects.toThrow(
      UnauthorizedError,
    );
    expect(tokens.issue).not.toHaveBeenCalled();
  });
});
