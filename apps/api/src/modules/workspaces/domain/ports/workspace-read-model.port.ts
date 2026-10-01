import type { WorkspaceDto, WorkspaceSlug } from '@cdr/contracts';

import type { AuthenticatedActor } from '../../../identity/domain/entities/role';

export const WORKSPACE_READ_MODEL = Symbol('WORKSPACE_READ_MODEL');

/**
 * Query-side port for the operational screens. This is deliberately read-only: it may
 * join data owned by several contexts, but it cannot mutate any of them or become a back
 * door around their future business rules.
 */
export interface WorkspaceReadModelPort {
  read(slug: WorkspaceSlug, actor: AuthenticatedActor): Promise<WorkspaceDto>;
}
