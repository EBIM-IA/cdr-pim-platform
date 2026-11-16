import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, ValidationError } from '@cdr/shared';
import {
  MODULE_POLICY,
  type ModulePolicy,
  type ModulePolicyPort,
} from '../domain/ports/module-policy.port';
import {
  Capability,
  Role,
  capabilitiesForRole,
  normalizeBusinessRole,
  type AuthenticatedActor,
  type BusinessRole,
} from '../domain/entities/role';

/** Menu policies never grant data mutation capabilities or modify identity-provider roles. */
@Injectable()
export class ModulePolicyUseCase {
  constructor(@Inject(MODULE_POLICY) private readonly policies: ModulePolicyPort) {}
  async read() {
    return { policies: await this.policies.read() };
  }
  async save(policy: ModulePolicy, actor: AuthenticatedActor) {
    if (!actor.roles.some((role) => normalizeBusinessRole(role) === Role.Administrator))
      throw new ForbiddenError('Solo ADMINISTRADOR puede configurar módulos');
    if (!policy.capability.startsWith('menu:'))
      throw new ValidationError('La política debe identificar un módulo');
    if (
      policy.role === Role.Administrator &&
      policy.capability === Capability.MenuAdministrationView &&
      !policy.visible
    )
      throw new ValidationError(
        'Administración debe permanecer accesible para administrar las políticas',
      );
    await this.policies.save(policy, actor);
    return this.read();
  }
  async reset(actor: AuthenticatedActor) {
    if (!actor.roles.some((role) => normalizeBusinessRole(role) === Role.Administrator))
      throw new ForbiddenError('Solo ADMINISTRADOR puede configurar módulos');
    const policies = await this.policies.read();
    for (const policy of policies) {
      const visible = this.forRole(policy.role, []).includes(policy.capability);
      if (policy.visible !== visible) await this.policies.save({ ...policy, visible }, actor);
    }
    return this.read();
  }
  async resolve(actor: AuthenticatedActor): Promise<AuthenticatedActor> {
    const policies = await this.policies.read();
    const capabilities = new Set<Capability>();
    for (const role of actor.roles) {
      for (const capability of this.forRole(normalizeBusinessRole(role), policies))
        capabilities.add(capability);
    }
    return { ...actor, capabilities: [...capabilities].sort() };
  }
  forRole(role: BusinessRole, policies: readonly ModulePolicy[]): Capability[] {
    const capabilities = new Set(capabilitiesForRole(role));
    // The approved default for consultation profiles is Products and Catalogs.
    if (role !== Role.Administrator)
      for (const capability of capabilities)
        if (
          capability.startsWith('menu:') &&
          capability !== Capability.MenuProductsView &&
          capability !== Capability.MenuCatalogsView
        )
          capabilities.delete(capability);
    for (const policy of policies.filter((entry) => entry.role === role))
      if (policy.visible) capabilities.add(policy.capability);
      else capabilities.delete(policy.capability);
    return [...capabilities].sort();
  }
}
