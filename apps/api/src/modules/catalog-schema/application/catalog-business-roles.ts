import type { AuthenticatedActor, Role } from '../../identity/domain/entities/role';

const BUSINESS_ROLE_ALIASES: Readonly<Record<string, string>> = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  COMPRAS: 'COMPRAS',
  VENTAS: 'VENTAS',
  ADMIN: 'ADMINISTRADOR',
  EDITOR: 'COMPRAS',
  VIEWER: 'VENTAS',
};

export function catalogBusinessRoles(actor: AuthenticatedActor): string[] {
  return [
    ...new Set(
      actor.roles
        .map((role: Role) => BUSINESS_ROLE_ALIASES[role])
        .filter((role): role is string => Boolean(role)),
    ),
  ];
}
