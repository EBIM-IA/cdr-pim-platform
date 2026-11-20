import { describe, expect, it } from 'vitest';
import { ModulePolicyUseCase } from './module-policy.use-case';
import { Capability, Role, actorHasCapability } from '../domain/entities/role';
import type { ModulePolicy } from '../domain/ports/module-policy.port';

describe('Application module policies', () => {
  it.each([Role.Purchasing, Role.Sales])(
    'defaults bulk generation on for %s and revokes it immediately without restricting individual reads',
    async (role) => {
      let policies: ModulePolicy[] = [];
      const useCase = new ModulePolicyUseCase({
        read: async () => policies,
        save: async (policy) => {
          policies = [policy];
        },
      });
      const reader = { id: 'reader', email: 'reader@example.test', roles: [role] };
      const administrator = { ...reader, roles: [Role.Administrator] };
      expect(
        actorHasCapability(await useCase.resolve(reader), Capability.TechnicalSheetsBulk),
      ).toBe(true);
      await useCase.save(
        { role, capability: Capability.TechnicalSheetsBulk, visible: false },
        administrator,
      );
      const disabled = await useCase.resolve(reader);
      expect(actorHasCapability(disabled, Capability.TechnicalSheetsBulk)).toBe(false);
      expect(actorHasCapability(disabled, Capability.CatalogRead)).toBe(true);
      expect(actorHasCapability(disabled, Capability.AttributesRead)).toBe(true);
      expect(actorHasCapability(disabled, Capability.CatalogWrite)).toBe(false);
      expect(
        actorHasCapability(await useCase.resolve(administrator), Capability.TechnicalSheetsBulk),
      ).toBe(true);
      await useCase.reset(administrator);
      expect(
        actorHasCapability(await useCase.resolve(reader), Capability.TechnicalSheetsBulk),
      ).toBe(true);
    },
  );

  it('keeps the administrator bulk grant enabled and reserves policy changes for administration', async () => {
    const useCase = new ModulePolicyUseCase({ read: async () => [], save: async () => {} });
    const actor = { id: 'admin', email: 'admin@example.test', roles: [Role.Administrator] };
    await expect(
      useCase.save(
        { role: Role.Administrator, capability: Capability.TechnicalSheetsBulk, visible: false },
        actor,
      ),
    ).rejects.toThrow('conserva');
    await expect(
      useCase.save(
        { role: Role.Sales, capability: Capability.TechnicalSheetsBulk, visible: false },
        { ...actor, roles: [Role.Sales] },
      ),
    ).rejects.toThrow('ADMINISTRADOR');
  });
  it('defaults consultation profiles to Products and Catalogs, and never elevates mutation grants', async () => {
    const policies: ModulePolicy[] = [
      { role: Role.Sales, capability: Capability.MenuApplicationsView, visible: true },
    ];
    const useCase = new ModulePolicyUseCase({ read: async () => policies, save: async () => {} });
    const actor = await useCase.resolve({
      id: 'sales',
      email: 'sales@example.com',
      roles: [Role.Sales],
    });
    expect(actorHasCapability(actor, Capability.MenuApplicationsView)).toBe(true);
    expect(actorHasCapability(actor, Capability.ApplicationsWrite)).toBe(false);
    expect(actorHasCapability(actor, Capability.MenuDocumentsView)).toBe(false);
  });
  it('applies disabling immediately and preserves administration access', async () => {
    let policies: ModulePolicy[] = [];
    const useCase = new ModulePolicyUseCase({
      read: async () => policies,
      save: async (policy) => {
        policies = [policy];
      },
    });
    const admin = { id: 'admin', email: 'admin@example.com', roles: [Role.Administrator] };
    await useCase.save(
      { role: Role.Sales, capability: Capability.MenuProductsView, visible: false },
      admin,
    );
    expect(
      actorHasCapability(
        await useCase.resolve({ ...admin, roles: [Role.Sales] }),
        Capability.MenuProductsView,
      ),
    ).toBe(false);
    await expect(
      useCase.save(
        { role: Role.Administrator, capability: Capability.MenuAdministrationView, visible: false },
        admin,
      ),
    ).rejects.toThrow('permanecer');
    await expect(
      useCase.save(
        { role: Role.Sales, capability: Capability.MenuProductsView, visible: true },
        { ...admin, roles: [Role.Sales] },
      ),
    ).rejects.toThrow('ADMINISTRADOR');
  });
  it('restores server-defined menu defaults without changing data capabilities or identity roles', async () => {
    const policies: ModulePolicy[] = [
      { role: Role.Sales, capability: Capability.MenuProductsView, visible: false },
      { role: Role.Sales, capability: Capability.MenuApplicationsView, visible: true },
      { role: Role.Purchasing, capability: Capability.MenuReportsView, visible: true },
    ];
    let writes = 0;
    const useCase = new ModulePolicyUseCase({
      read: async () => policies,
      save: async (policy) => {
        writes += 1;
        policies.splice(
          policies.findIndex(
            (entry) => entry.role === policy.role && entry.capability === policy.capability,
          ),
          1,
          policy,
        );
      },
    });
    const admin = { id: 'admin', email: 'admin@example.test', roles: [Role.Administrator] };
    await expect(useCase.reset({ ...admin, roles: [Role.Sales] })).rejects.toThrow('ADMINISTRADOR');
    expect(writes).toBe(0);
    await useCase.reset(admin);
    expect(writes).toBe(3);
    const sales = await useCase.resolve({ ...admin, roles: [Role.Sales] });
    expect(sales.roles).toEqual([Role.Sales]);
    expect(sales.capabilities?.filter((capability) => capability.startsWith('menu:'))).toEqual([
      Capability.MenuCatalogsView,
      Capability.MenuProductsView,
    ]);
    expect(actorHasCapability(sales, Capability.ApplicationsWrite)).toBe(false);
    expect(actorHasCapability(sales, Capability.ReportsRead)).toBe(false);
    await useCase.reset(admin);
    expect(writes).toBe(3);
  });
});
