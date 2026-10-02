import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { ProductsController } from '../../src/modules/catalog/presentation/products.controller';
import { HealthController } from '../../src/modules/health/presentation/health.controller';
import { AuthController } from '../../src/modules/identity/presentation/auth.controller';
import { Role } from '../../src/modules/identity/domain/entities/role';
import { ImportsController } from '../../src/modules/imports/presentation/imports.controller';
import { SearchController } from '../../src/modules/search/presentation/search.controller';
import { WorkspacesController } from '../../src/modules/workspaces/presentation/workspaces.controller';
import { PUBLIC_ROUTE } from '../../src/shared/http/public.decorator';
import { REQUIRED_ROLE } from '../../src/shared/http/role.decorator';

const reflector = new Reflector();

function requiredRole(
  controller: abstract new (...args: never[]) => unknown,
  method?: string,
): Role | undefined {
  const targets = method
    ? [controller.prototype[method as keyof typeof controller.prototype], controller]
    : [controller];
  return reflector.getAllAndOverride<Role | undefined>(REQUIRED_ROLE, targets);
}

function isPublic(
  controller: abstract new (...args: never[]) => unknown,
  method?: string,
): boolean {
  const targets = method
    ? [controller.prototype[method as keyof typeof controller.prototype], controller]
    : [controller];
  return reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets) ?? false;
}

describe('HTTP RBAC policy', () => {
  it('keeps only login and health explicitly public', () => {
    expect(isPublic(HealthController)).toBe(true);
    expect(isPublic(AuthController, 'login')).toBe(true);

    expect(isPublic(AuthController, 'me')).toBe(false);
    expect(isPublic(ProductsController, 'list')).toBe(false);
    expect(isPublic(SearchController, 'search')).toBe(false);
    expect(isPublic(ImportsController, 'embed')).toBe(false);
    expect(isPublic(WorkspacesController, 'findOne')).toBe(false);
  });

  it('requires VIEWER for protected reads', () => {
    expect(requiredRole(AuthController, 'me')).toBe(Role.Viewer);
    expect(requiredRole(ProductsController, 'list')).toBe(Role.Viewer);
    expect(requiredRole(ProductsController, 'findOne')).toBe(Role.Viewer);
    expect(requiredRole(SearchController, 'search')).toBe(Role.Viewer);
    expect(requiredRole(WorkspacesController, 'findOne')).toBe(Role.Viewer);
  });

  it('requires EDITOR for catalog, import and indexing mutations', () => {
    expect(requiredRole(ProductsController, 'create')).toBe(Role.Editor);
    expect(requiredRole(SearchController, 'index')).toBe(Role.Editor);
    expect(requiredRole(ImportsController, 'embed')).toBe(Role.Editor);
  });

  it('reserves the operational skeleton probe for ADMIN', () => {
    expect(requiredRole(ImportsController, 'ping')).toBe(Role.Admin);
  });
});
