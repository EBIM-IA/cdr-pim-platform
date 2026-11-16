import type { AuthenticatedActor, BusinessRole, Capability } from '../entities/role';

export interface ModulePolicy {
  role: BusinessRole;
  capability: Capability;
  visible: boolean;
}
export interface ModulePolicyPort {
  read(): Promise<ModulePolicy[]>;
  save(policy: ModulePolicy, actor: AuthenticatedActor): Promise<void>;
}
export const MODULE_POLICY = Symbol('ModulePolicy');

export interface ModulePolicyResolverPort {
  read(): Promise<{ policies: ModulePolicy[] }>;
  forRole(role: BusinessRole, policies: readonly ModulePolicy[]): Capability[];
}
export const MODULE_POLICY_RESOLVER = Symbol('ModulePolicyResolver');
