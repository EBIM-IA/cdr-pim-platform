import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { Role } from '../../identity/domain/entities/role';
import { RolesGuard } from '../../identity/presentation/guards/roles.guard';
import { PdfDesignSettingsController } from './pdf-design-settings.controller';

describe('PDF design settings route permissions', () => {
  it.each([Role.Administrator, Role.Purchasing, Role.Sales])(
    'allows %s to read the shared visual settings and reserves changes for administration',
    (role) => {
      const guard = new RolesGuard(new Reflector());
      const context = (method: 'get' | 'save') =>
        ({
          getHandler: () => PdfDesignSettingsController.prototype[method],
          getClass: () => PdfDesignSettingsController,
          switchToHttp: () => ({
            getRequest: () => ({
              actor: { id: 'reader', email: 'reader@example.test', roles: [role] },
            }),
          }),
        }) as unknown as ExecutionContext;
      expect(guard.canActivate(context('get'))).toBe(true);
      if (role === Role.Administrator) expect(guard.canActivate(context('save'))).toBe(true);
      else expect(() => guard.canActivate(context('save'))).toThrow(ForbiddenError);
    },
  );
});
