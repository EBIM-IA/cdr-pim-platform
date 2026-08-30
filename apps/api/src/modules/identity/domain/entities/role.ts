import { ValidationError } from '@cdr/shared';

/**
 * Initial role model.
 *
 * Deliberately coarse — three roles, ordered by capability — because the real permission
 * matrix (who may publish, who may approve an AI-generated description, who may edit
 * equivalences) is a functional decision still pending with Casa del Rulimán. Starting
 * coarse and splitting later is far cheaper than inventing permissions nobody asked for.
 */
export const Role = {
  Admin: 'ADMIN',
  Editor: 'EDITOR',
  Viewer: 'VIEWER',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/** Higher rank implies every capability of the ranks below it. */
const RANK: Record<Role, number> = { VIEWER: 1, EDITOR: 2, ADMIN: 3 };

export function isRole(value: string): value is Role {
  return value in RANK;
}

export function assertRole(value: string): Role {
  if (!isRole(value)) throw new ValidationError('Unknown role', { role: value });
  return value;
}

export function satisfies(actual: Role, required: Role): boolean {
  return RANK[actual] >= RANK[required];
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
