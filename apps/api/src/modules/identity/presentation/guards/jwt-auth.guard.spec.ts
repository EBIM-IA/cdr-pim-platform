import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UnauthorizedError } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import { Role } from '../../domain/entities/role';
import type { TokenServicePort } from '../../domain/ports/token-service.port';
import { JwtAuthGuard } from './jwt-auth.guard';

function contextWithAuthorization(authorization?: string): {
  context: ExecutionContext;
  request: { actor?: unknown; header(name: string): string | undefined };
} {
  const request = {
    actor: undefined,
    header: (name: string) => (name === 'authorization' ? authorization : undefined),
  };
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as never,
  };
}

function createGuard(isPublic = false): { guard: JwtAuthGuard; tokens: TokenServicePort } {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);
  const tokens: TokenServicePort = {
    issue: vi.fn(),
    verifyAccessToken: vi.fn().mockResolvedValue({
      id: 'local-admin',
      email: 'admin@casadelruliman.com',
      roles: [Role.Admin],
    }),
  };
  return { guard: new JwtAuthGuard(reflector, tokens), tokens };
}

describe('JwtAuthGuard', () => {
  it('allows an explicitly public route without a token', async () => {
    const { guard, tokens } = createGuard(true);
    await expect(guard.canActivate(contextWithAuthorization().context)).resolves.toBe(true);
    expect(tokens.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('returns unauthorized semantics when the bearer credential is absent or empty', async () => {
    const { guard } = createGuard();
    await expect(guard.canActivate(contextWithAuthorization().context)).rejects.toThrow(
      UnauthorizedError,
    );
    await expect(guard.canActivate(contextWithAuthorization('Bearer ').context)).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it('verifies a bearer token and attaches the authenticated actor', async () => {
    const { guard, tokens } = createGuard();
    const { context, request } = contextWithAuthorization('Bearer signed-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tokens.verifyAccessToken).toHaveBeenCalledWith('signed-token');
    expect(request.actor).toMatchObject({ id: 'local-admin', roles: [Role.Admin] });
  });
});
