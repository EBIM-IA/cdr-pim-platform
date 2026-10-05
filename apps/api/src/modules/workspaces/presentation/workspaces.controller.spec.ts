import type { WorkspaceDto } from '@cdr/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { GetWorkspaceUseCase } from '../application/get-workspace.use-case';
import { Capability, Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { WorkspacesController } from './workspaces.controller';

const actor: AuthenticatedActor = {
  id: 'admin-1',
  email: 'admin@casadelruliman.com',
  roles: [Role.Admin],
};

describe('WorkspacesController', () => {
  it('requires catalog read access through the global capability guard protocol', () => {
    expect(Reflect.getMetadata('cdr:required-capabilities', WorkspacesController)).toEqual([
      Capability.CatalogRead,
    ]);
  });

  it('returns a contract-valid projection from the use case', async () => {
    const projection: WorkspaceDto = {
      slug: 'administration',
      operationalStatus: 'partial',
      generatedAt: '2026-10-01T12:00:00.000Z',
      metrics: [{ key: 'actor', label: 'Actor', value: actor.email, format: 'text' }],
      columns: [{ key: 'role', label: 'Rol', type: 'status' }],
      rows: [{ id: 'ADMIN', values: { role: 'ADMIN' } }],
      totalRows: 1,
      notices: [],
      actions: [],
    };
    const execute = vi.fn().mockResolvedValue(projection);
    const useCase = { execute } as unknown as GetWorkspaceUseCase;
    const controller = new WorkspacesController(useCase);

    await expect(controller.findOne('administration', { actor })).resolves.toEqual(projection);
    expect(execute).toHaveBeenCalledWith('administration', actor);
  });

  it('rejects a malformed projection before it reaches the web renderer', async () => {
    const execute = vi.fn().mockResolvedValue({
      slug: 'reports',
      operationalStatus: 'invented',
      generatedAt: 'not-a-date',
    });
    const controller = new WorkspacesController({ execute } as unknown as GetWorkspaceUseCase);

    await expect(controller.findOne('reports', { actor })).rejects.toThrow();
  });
});
