import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { ModulePolicyUseCase } from '../../identity/application/module-policy.use-case';
import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import type { ModulePolicy } from '../../identity/domain/ports/module-policy.port';
import { RolesGuard } from '../../identity/presentation/guards/roles.guard';
import { DynamicCatalogController } from './dynamic-catalog.controller';

function context(
  actor: AuthenticatedActor,
  method: 'technicalSheet' | 'authorizeBulkTechnicalSheets',
): ExecutionContext {
  return {
    getHandler: () => DynamicCatalogController.prototype[method],
    getClass: () => DynamicCatalogController,
    switchToHttp: () => ({ getRequest: () => ({ actor }) }),
  } as unknown as ExecutionContext;
}

describe('Technical sheet route permissions', () => {
  it.each([Role.Purchasing, Role.Sales])(
    'revokes bulk authorization for %s while keeping the individual endpoint readable',
    async (role) => {
      let policies: ModulePolicy[] = [];
      const modulePolicy = new ModulePolicyUseCase({
        read: async () => policies,
        save: async (policy) => {
          policies = [policy];
        },
      });
      const reader = { id: 'reader', email: 'reader@example.test', roles: [role] };
      const administrator = { ...reader, roles: [Role.Administrator] };
      const guard = new RolesGuard(new Reflector());
      const initial = await modulePolicy.resolve(reader);
      expect(guard.canActivate(context(initial, 'authorizeBulkTechnicalSheets'))).toBe(true);
      await modulePolicy.save(
        { role, capability: 'technical-sheets:bulk', visible: false },
        administrator,
      );
      const restricted = await modulePolicy.resolve(reader);
      expect(() => guard.canActivate(context(restricted, 'authorizeBulkTechnicalSheets'))).toThrow(
        ForbiddenError,
      );
      expect(guard.canActivate(context(restricted, 'technicalSheet'))).toBe(true);
      expect(
        guard.canActivate(
          context(await modulePolicy.resolve(administrator), 'authorizeBulkTechnicalSheets'),
        ),
      ).toBe(true);
    },
  );
});
