import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import { type AuthenticatedActor, Role } from '../../domain/entities/role';
import { RolesGuard } from './roles.guard';

function contextWith(actor?: AuthenticatedActor) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ actor }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as never;
}

function guardRequiring(role: Role | undefined): RolesGuard {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(role);
  return new RolesGuard(reflector);
}

const editor: AuthenticatedActor = { id: 'u-1', email: 'e@cdr.ec', roles: [Role.Editor] };

describe('RolesGuard', () => {
  it('allows a route that declares no role requirement', () => {
    expect(guardRequiring(undefined).canActivate(contextWith())).toBe(true);
  });

  it('allows an actor whose role outranks the requirement', () => {
    expect(guardRequiring(Role.Viewer).canActivate(contextWith(editor))).toBe(true);
  });

  it('rejects an actor whose role is insufficient', () => {
    expect(() => guardRequiring(Role.Admin).canActivate(contextWith(editor))).toThrow(
      ForbiddenError,
    );
  });

  it('rejects an unauthenticated request on a protected route', () => {
    expect(() => guardRequiring(Role.Viewer).canActivate(contextWith())).toThrow(ForbiddenError);
  });
});
