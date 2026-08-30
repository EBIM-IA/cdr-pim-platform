import { describe, expect, it } from 'vitest';

import { type AuthenticatedActor, Role, actorSatisfies, assertRole, satisfies } from './role';

describe('role model', () => {
  it('treats higher roles as satisfying lower ones', () => {
    expect(satisfies(Role.Admin, Role.Viewer)).toBe(true);
    expect(satisfies(Role.Editor, Role.Viewer)).toBe(true);
    expect(satisfies(Role.Viewer, Role.Editor)).toBe(false);
  });

  it('evaluates an actor against the required role', () => {
    const actor: AuthenticatedActor = {
      id: 'u-1',
      email: 'compras@casadelruliman.ec',
      roles: [Role.Editor],
    };
    expect(actorSatisfies(actor, Role.Viewer)).toBe(true);
    expect(actorSatisfies(actor, Role.Admin)).toBe(false);
  });

  it('rejects an unknown role instead of trusting a token claim', () => {
    expect(() => assertRole('SUPERUSER')).toThrow();
  });
});
