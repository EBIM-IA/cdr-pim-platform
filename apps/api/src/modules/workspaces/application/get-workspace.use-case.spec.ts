import { ModulePolicyUseCase } from '../../identity/application/module-policy.use-case';
import type { WorkspaceDto } from '@cdr/contracts';
import { ForbiddenError } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  Capability,
  Role,
  actorHasCapability,
  type AuthenticatedActor,
} from '../../identity/domain/entities/role';
import type { WorkspaceReadModelPort } from '../domain/ports/workspace-read-model.port';
import { GetWorkspaceUseCase } from './get-workspace.use-case';

const actor: AuthenticatedActor = {
  id: 'viewer-1',
  email: 'viewer@casadelruliman.com',
  roles: [Role.Viewer],
};
const administrator: AuthenticatedActor = {
  ...actor,
  id: 'admin-1',
  email: 'admin@casadelruliman.com',
  roles: [Role.Administrator],
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
    const read = vi.fn<WorkspaceReadModelPort['read']>();
    read.mockResolvedValue(projection);
    const port: WorkspaceReadModelPort = { read };
    const useCase = new GetWorkspaceUseCase(port);

    await expect(
      useCase.execute('reports', administrator, { report: 'attribute_changes' }),
    ).resolves.toEqual(projection);
    expect(read).toHaveBeenCalledWith('reports', administrator, { report: 'attribute_changes' });
  });

  it('rejects a direct workspace request when the actor lacks its menu capability', async () => {
    const read = vi.fn<WorkspaceReadModelPort['read']>();
    const useCase = new GetWorkspaceUseCase({ read });

    expect(() => useCase.execute('imports', actor)).toThrow(ForbiddenError);
    expect(read).not.toHaveBeenCalled();
  });

  it('allows a viewer to inspect the blocked catalog capability without granting writes', async () => {
    const catalogs: WorkspaceDto = {
      ...projection,
      slug: 'catalogs',
      operationalStatus: 'blocked',
    };
    const read = vi.fn<WorkspaceReadModelPort['read']>();
    read.mockResolvedValue(catalogs);
    const useCase = new GetWorkspaceUseCase({ read });

    await expect(useCase.execute('catalogs', actor)).resolves.toEqual(catalogs);
    expect(read).toHaveBeenCalledWith('catalogs', actor, {});
  });
  it.each([
    ['reports', Capability.MenuReportsView, Capability.ReportsRead],
    ['quality', Capability.MenuAiQualityView, Capability.AiQualityExecute],
    ['imports', Capability.MenuImportsView, Capability.ImportsExecute],
    ['integrations', Capability.MenuIntegrationsView, Capability.IntegrationsManage],
    ['publication', Capability.MenuPublicationView, Capability.PublicationExecute],
    ['administration', Capability.MenuAdministrationView, Capability.AdministrationManage],
  ] as const)(
    'preserves %s data authorization when an administrator enables its menu for Sales',
    async (slug, menu, dataCapability) => {
      const policies = new ModulePolicyUseCase({
        read: async () => [{ role: Role.Sales, capability: menu, visible: true }],
        save: async () => {},
      });
      const sales = await policies.resolve({ ...actor, roles: [Role.Sales] });
      const read = vi
        .fn<WorkspaceReadModelPort['read']>()
        .mockResolvedValue({ ...projection, slug });
      const useCase = new GetWorkspaceUseCase({ read });
      expect(actorHasCapability(sales, menu)).toBe(true);
      expect(actorHasCapability(sales, dataCapability)).toBe(false);
      expect(() => useCase.execute(slug, sales)).toThrow(ForbiddenError);
      expect(read).not.toHaveBeenCalled();
      await expect(useCase.execute(slug, administrator)).resolves.toMatchObject({ slug });
    },
  );
});
