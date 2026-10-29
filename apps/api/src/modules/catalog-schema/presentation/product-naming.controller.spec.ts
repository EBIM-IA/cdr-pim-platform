import { type ExecutionContext, RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError, UnauthorizedError } from '@cdr/shared';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

import { REQUIRED_CAPABILITIES } from '../../../shared/http/capability.decorator';
import {
  Capability,
  type AuthenticatedActor,
  type Role,
} from '../../identity/domain/entities/role';
import { JwtAuthGuard } from '../../identity/presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/presentation/guards/roles.guard';
import type { TokenServicePort } from '../../identity/domain/ports/token-service.port';
import type { ProductNamingUseCases } from '../application/product-naming.use-cases';
import { DEFAULT_PRODUCT_NAME_CONFIG } from '../domain/services/product-naming';
import { ProductNamingController } from './product-naming.controller';

const actor: AuthenticatedActor = {
  id: 'admin',
  email: 'admin@example.test',
  roles: ['ADMINISTRADOR'],
};

describe('ProductNamingController', () => {
  it.each(['settings', 'save'] as const)('requires administration permission for %s', (name) => {
    expect(
      Reflect.getMetadata(REQUIRED_CAPABILITIES, ProductNamingController.prototype[name]),
    ).toEqual([Capability.AdministrationManage]);
  });

  it.each(['search', 'experience'] as const)(
    'requires catalog, attributes and applications read permissions for %s',
    (name) => {
      expect(
        Reflect.getMetadata(REQUIRED_CAPABILITIES, ProductNamingController.prototype[name]),
      ).toEqual([Capability.CatalogRead, Capability.AttributesRead, Capability.ApplicationsRead]);
    },
  );

  it('requires both administration and all source read permissions for previews', () => {
    expect(
      Reflect.getMetadata(REQUIRED_CAPABILITIES, ProductNamingController.prototype.preview),
    ).toEqual([
      Capability.AdministrationManage,
      Capability.CatalogRead,
      Capability.AttributesRead,
      Capability.ApplicationsRead,
    ]);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, ProductNamingController.prototype.preview)).toBe(
      200,
    );
  });

  it.each(['ADMINISTRADOR', 'COMPRAS', 'VENTAS'] as const)(
    'enforces real route policies for %s through the production roles guard',
    (role: Role) => {
      const guard = new RolesGuard(new Reflector());
      const context = (method: keyof ProductNamingController): ExecutionContext =>
        ({
          getHandler: () => ProductNamingController.prototype[method],
          getClass: () => ProductNamingController,
          switchToHttp: () => ({ getRequest: () => ({ actor: { ...actor, roles: [role] } }) }),
        }) as unknown as ExecutionContext;
      for (const method of ['settings', 'save', 'preview'] as const) {
        if (role === 'ADMINISTRADOR') expect(guard.canActivate(context(method))).toBe(true);
        else expect(() => guard.canActivate(context(method))).toThrow(ForbiddenError);
      }
      for (const method of ['search', 'experience'] as const)
        expect(guard.canActivate(context(method))).toBe(true);
    },
  );

  it('requires bearer authentication on every naming route with the production JWT guard', async () => {
    const verifyAccessToken = vi.fn();
    const guard = new JwtAuthGuard(new Reflector(), {
      verifyAccessToken,
    } as unknown as TokenServicePort);
    for (const method of ['settings', 'save', 'preview', 'search', 'experience'] as const) {
      const context = {
        getHandler: () => ProductNamingController.prototype[method],
        getClass: () => ProductNamingController,
        switchToHttp: () => ({ getRequest: () => ({ header: () => undefined }) }),
      } as unknown as ExecutionContext;
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedError);
    }
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('documents validated bodies and response shapes on each real route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ProductNamingController)).toBe('product-experience');
    for (const name of ['settings', 'save', 'preview', 'search', 'experience'] as const) {
      const responses = Reflect.getMetadata(
        'swagger/apiResponse',
        ProductNamingController.prototype[name],
      ) as Record<string, { schema?: unknown }>;
      expect(responses['200']?.schema).toBeDefined();
    }
    expect(Reflect.getMetadata(PATH_METADATA, ProductNamingController.prototype.search)).toBe(
      'search',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ProductNamingController.prototype.save)).toBe(
      RequestMethod.PATCH,
    );
    const parameters = Reflect.getMetadata(
      'swagger/apiParameters',
      ProductNamingController.prototype.preview,
    ) as Array<{ in: string; schema?: unknown }>;
    expect(parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ in: 'body', schema: expect.any(Object) })]),
    );
  });

  it('forwards actor and draft to the use cases and does not persist a preview', async () => {
    const response = { nombreGeneral: 'Rodamiento', variants: [], fields: [] };
    const experience = vi.fn().mockResolvedValue(response);
    const saveSettings = vi.fn();
    const controller = new ProductNamingController({
      experience,
      saveSettings,
    } as unknown as ProductNamingUseCases);
    const input = {
      productId: '11111111-1111-4111-8111-111111111111',
      config: structuredClone(DEFAULT_PRODUCT_NAME_CONFIG),
    };
    await expect(controller.preview(input, actor)).resolves.toBe(response);
    expect(experience).toHaveBeenCalledExactlyOnceWith(input.productId, actor, input.config);
    expect(saveSettings).not.toHaveBeenCalled();
  });
});
