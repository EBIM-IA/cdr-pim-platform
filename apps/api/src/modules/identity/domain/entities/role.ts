import type { AuthCapability } from '@cdr/contracts';
import { ValidationError } from '@cdr/shared';

/**
 * Roles assigned by the identity provider.
 *
 * ADMIN/EDITOR/VIEWER are migration aliases for local environments and old access tokens.
 * Authorization itself is capability based; there is deliberately no role ranking.
 */
export const Role = {
  Administrator: 'ADMINISTRADOR',
  Purchasing: 'COMPRAS',
  Sales: 'VENTAS',
  /** @deprecated Use Administrator. */
  Admin: 'ADMIN',
  /** @deprecated Use Purchasing. */
  Editor: 'EDITOR',
  /** @deprecated Use Sales. */
  Viewer: 'VIEWER',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const Capability = {
  IdentitySelfRead: 'identity:self:read',
  MenuHomeView: 'menu:home:view',
  MenuProductsView: 'menu:products:view',
  MenuCategoriesView: 'menu:categories:view',
  MenuTemplatesView: 'menu:templates:view',
  MenuApplicationsView: 'menu:applications:view',
  MenuEquivalencesView: 'menu:equivalences:view',
  MenuDocumentsView: 'menu:documents:view',
  MenuImportsView: 'menu:imports:view',
  MenuAiQualityView: 'menu:ai-quality:view',
  MenuPublicationView: 'menu:publication:view',
  MenuIntegrationsView: 'menu:integrations:view',
  MenuReportsView: 'menu:reports:view',
  MenuAdministrationView: 'menu:administration:view',
  CatalogRead: 'catalog:read',
  CatalogWrite: 'catalog:write',
  AttributesRead: 'attributes:read',
  AttributesWrite: 'attributes:write',
  AttributesSensitiveRead: 'attributes:sensitive:read',
  ApplicationsRead: 'applications:read',
  ApplicationsWrite: 'applications:write',
  EquivalencesRead: 'equivalences:read',
  EquivalencesWrite: 'equivalences:write',
  ImportsExecute: 'imports:execute',
  AiQualityExecute: 'ai-quality:execute',
  AiDocumentExtract: 'ai-document:extract',
  PublicationExecute: 'publication:execute',
  IntegrationsManage: 'integrations:manage',
  ReportsRead: 'reports:read',
  AuditRead: 'audit:read',
  AdministrationManage: 'administration:manage',
  OperationsManage: 'operations:manage',
} as const satisfies Record<string, AuthCapability>;

export type Capability = (typeof Capability)[keyof typeof Capability];

const ALL_CAPABILITIES = Object.values(Capability);

const VIEWING_CAPABILITIES: readonly Capability[] = [
  Capability.IdentitySelfRead,
  Capability.MenuHomeView,
  Capability.MenuProductsView,
  Capability.MenuApplicationsView,
  Capability.MenuEquivalencesView,
  Capability.MenuDocumentsView,
  Capability.MenuReportsView,
  Capability.CatalogRead,
  Capability.AttributesRead,
  Capability.ApplicationsRead,
  Capability.EquivalencesRead,
  Capability.ReportsRead,
];

const PURCHASING_CAPABILITIES: readonly Capability[] = [
  ...VIEWING_CAPABILITIES,
  Capability.MenuCategoriesView,
  Capability.MenuTemplatesView,
  Capability.MenuImportsView,
  Capability.MenuAiQualityView,
  Capability.CatalogWrite,
  Capability.AttributesWrite,
  Capability.ApplicationsWrite,
  Capability.EquivalencesWrite,
  Capability.ImportsExecute,
  Capability.AiQualityExecute,
  Capability.AiDocumentExtract,
];

const SALES_CAPABILITIES: readonly Capability[] = [
  ...VIEWING_CAPABILITIES,
  Capability.MenuPublicationView,
  Capability.PublicationExecute,
];

/** Explicit grants: adding a capability to one role never grants it to another role. */
const ROLE_CAPABILITIES: Readonly<Record<Role, ReadonlySet<Capability>>> = {
  [Role.Administrator]: new Set(ALL_CAPABILITIES),
  [Role.Purchasing]: new Set(PURCHASING_CAPABILITIES),
  [Role.Sales]: new Set(SALES_CAPABILITIES),
  // Temporary aliases preserve existing development configuration and JWTs.
  [Role.Admin]: new Set(ALL_CAPABILITIES),
  [Role.Editor]: new Set(PURCHASING_CAPABILITIES),
  [Role.Viewer]: new Set(SALES_CAPABILITIES),
};

export type BusinessRole = typeof Role.Administrator | typeof Role.Purchasing | typeof Role.Sales;

export function normalizeBusinessRole(role: Role): BusinessRole {
  switch (role) {
    case Role.Admin:
    case Role.Administrator:
      return Role.Administrator;
    case Role.Editor:
    case Role.Purchasing:
      return Role.Purchasing;
    case Role.Viewer:
    case Role.Sales:
      return Role.Sales;
  }
}

export function isRole(value: string): value is Role {
  return Object.hasOwn(ROLE_CAPABILITIES, value);
}

export function assertRole(value: string): Role {
  if (!isRole(value)) throw new ValidationError('Unknown role', { role: value });
  return value;
}

export function roleHasCapability(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

/** Compatibility helper preserving the old hierarchy only for legacy `@RequireRole` routes. */
export function satisfies(actual: Role, required: Role): boolean {
  const actualBusinessRole = normalizeBusinessRole(actual);
  switch (required) {
    case Role.Viewer:
      return true;
    case Role.Editor:
      return actualBusinessRole === Role.Administrator || actualBusinessRole === Role.Purchasing;
    case Role.Admin:
      return actualBusinessRole === Role.Administrator;
    default:
      return actualBusinessRole === required;
  }
}

/** The authenticated principal, as the rest of the application sees it. */
export interface AuthenticatedActor {
  readonly id: string;
  readonly email: string;
  readonly roles: readonly Role[];
}

export function actorSatisfies(actor: AuthenticatedActor, required: Role): boolean {
  return actor.roles.some((role) => satisfies(role, required));
}

export function actorHasCapability(actor: AuthenticatedActor, capability: Capability): boolean {
  return actor.roles.some((role) => roleHasCapability(role, capability));
}

export function capabilitiesForActor(actor: AuthenticatedActor): Capability[] {
  const granted = new Set<Capability>();
  for (const role of actor.roles) {
    for (const capability of ROLE_CAPABILITIES[role]) granted.add(capability);
  }
  return [...granted].sort();
}
