import { describe, expect, it } from 'vitest';

import {
  type AuthenticatedActor,
  Capability,
  Role,
  actorHasCapability,
  actorSatisfies,
  assertRole,
  capabilitiesForActor,
  capabilitiesForRole,
  satisfies,
} from './role';

describe('role capability policy', () => {
  it('allows sales to consult and share PDF catalogs while keeping maintenance with purchasing and administration', () => {
    for (const role of [
      Role.Administrator,
      Role.Purchasing,
      Role.Sales,
      Role.Admin,
      Role.Editor,
      Role.Viewer,
    ]) {
      expect(actorHasCapability(actor(role), Capability.ProductCatalogsRead)).toBe(true);
      expect(actorHasCapability(actor(role), Capability.ProductCatalogsShare)).toBe(true);
      expect(actorHasCapability(actor(role), Capability.ProductCatalogsWrite)).toBe(
        role !== Role.Sales && role !== Role.Viewer,
      );
    }
  });
  it('uses explicit grants without a business-role hierarchy', () => {
    expect(actorHasCapability(actor(Role.Administrator), Capability.AuditRead)).toBe(true);
    expect(actorHasCapability(actor(Role.Purchasing), Capability.AuditRead)).toBe(false);
    expect(actorHasCapability(actor(Role.Sales), Capability.PublicationExecute)).toBe(false);
    expect(actorHasCapability(actor(Role.Purchasing), Capability.PublicationExecute)).toBe(false);
    expect(actorHasCapability(actor(Role.Sales), Capability.MenuReportsView)).toBe(false);
    expect(actorHasCapability(actor(Role.Purchasing), Capability.MenuImportsView)).toBe(false);
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
    expect(capabilities).not.toContain(Capability.PublicationExecute);
    expect(new Set(capabilities).size).toBe(capabilities.length);
  });

  it('limits non-administrator menus to the five modules approved by the client', () => {
    const expectedMenus = [
      Capability.MenuApplicationsView,
      Capability.MenuCatalogsView,
      Capability.MenuDocumentsView,
      Capability.MenuEquivalencesView,
      Capability.MenuProductsView,
    ];
    for (const role of [Role.Purchasing, Role.Sales, Role.Editor, Role.Viewer]) {
      expect(
        capabilitiesForRole(role).filter((capability) => capability.startsWith('menu:')),
      ).toEqual(expectedMenus);
    }
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
