import type { WorkspaceDto, WorkspaceSlug } from '@cdr/contracts';
import { ForbiddenError } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import type { WorkspaceReadModelPort } from '../domain/ports/workspace-read-model.port';
import { GetWorkspaceUseCase } from './get-workspace.use-case';

const actor: AuthenticatedActor = {
  id: 'viewer-1',
  email: 'viewer@casadelruliman.com',
  roles: [Role.Viewer],
};

const projection: WorkspaceDto = {
  slug: 'reports',
  operationalStatus: 'operational',
  generatedAt: '2026-10-01T12:00:00.000Z',
  metrics: [],
  columns: [],
  rows: [],
  totalRows: 0,
  notices: [],
  actions: [],
};

describe('GetWorkspaceUseCase', () => {
  it('delegates the requested slug and authenticated actor to the read model', async () => {
    const read =
      vi.fn<(slug: WorkspaceSlug, currentActor: AuthenticatedActor) => Promise<WorkspaceDto>>();
    read.mockResolvedValue(projection);
    const port: WorkspaceReadModelPort = { read };
    const useCase = new GetWorkspaceUseCase(port);

    await expect(useCase.execute('reports', actor)).resolves.toEqual(projection);
    expect(read).toHaveBeenCalledWith('reports', actor);
  });

  it('rejects a direct workspace request when the actor lacks its menu capability', async () => {
    const read = vi.fn<WorkspaceReadModelPort['read']>();
    const useCase = new GetWorkspaceUseCase({ read });

    expect(() => useCase.execute('imports', actor)).toThrow(ForbiddenError);
    expect(read).not.toHaveBeenCalled();
  });
});
