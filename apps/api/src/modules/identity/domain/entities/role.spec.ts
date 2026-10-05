import { describe, expect, it } from 'vitest';

import {
  type AuthenticatedActor,
  Capability,
  Role,
  actorHasCapability,
  actorSatisfies,
  assertRole,
  capabilitiesForActor,
  satisfies,
} from './role';

describe('role capability policy', () => {
  it('uses explicit grants without a business-role hierarchy', () => {
    expect(actorHasCapability(actor(Role.Administrator), Capability.AuditRead)).toBe(true);
    expect(actorHasCapability(actor(Role.Purchasing), Capability.AuditRead)).toBe(false);
    expect(actorHasCapability(actor(Role.Sales), Capability.PublicationExecute)).toBe(true);
    expect(actorHasCapability(actor(Role.Purchasing), Capability.PublicationExecute)).toBe(false);
  });

  it('maps legacy roles to the equivalent capability set during migration', () => {
    expect(satisfies(Role.Admin, Role.Administrator)).toBe(true);
    expect(satisfies(Role.Editor, Role.Purchasing)).toBe(true);
    expect(actorSatisfies(actor(Role.Viewer), Role.Sales)).toBe(true);
  });

  it('returns the deduplicated capabilities exposed to the web client', () => {
    const capabilities = capabilitiesForActor({
      ...actor(Role.Purchasing),
      roles: [Role.Purchasing, Role.Sales],
    });
    expect(capabilities).toContain(Capability.CatalogWrite);
    expect(capabilities).toContain(Capability.PublicationExecute);
    expect(new Set(capabilities).size).toBe(capabilities.length);
  });

  it('rejects an unknown role instead of trusting a token claim', () => {
    expect(() => assertRole('SUPERUSER')).toThrow();
  });
});

function actor(role: Role): AuthenticatedActor {
  return {
    id: 'u-1',
    email: 'usuario@casadelruliman.ec',
    roles: [role],
  };
}
