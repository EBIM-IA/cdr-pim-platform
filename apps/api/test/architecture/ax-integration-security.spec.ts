import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { AxIntegrationModule } from '../../src/modules/ax-integration/ax-integration.module';
import { AxIntegrationAuthGuard } from '../../src/modules/ax-integration/presentation/guards/ax-integration-auth.guard';
import { AuthController } from '../../src/modules/identity/presentation/auth.controller';
import { HealthController } from '../../src/modules/health/presentation/health.controller';
import { PUBLIC_ROUTE } from '../../src/shared/http/public.decorator';
import { RATE_LIMIT_PROFILE } from '../../src/shared/http/rate-limit';

/**
 * Security architecture of the AX integration (TEMPORARY QAS MOCK).
 *
 * The AX route must be `@Public()` to leave the HUMAN pipeline (JwtAuthGuard/RolesGuard),
 * which makes `@Public()` dangerous on its own: forgetting the machine guard would publish
 * an unauthenticated endpoint. These rules make that mistake fail the build:
 *
 *  1. every route of the ax-integration module carries AxIntegrationAuthGuard;
 *  2. every public route ANYWHERE is health, login, or carries AxIntegrationAuthGuard;
 *  3. the module touches no database and no other bounded context.
 */

type Controller = abstract new (...args: never[]) => unknown;
const reflector = new Reflector();

interface Route {
  readonly controller: Controller;
  readonly handlerName: string;
  readonly handler: (...args: unknown[]) => unknown;
}

function controllersOf(module: unknown, seen = new Set<unknown>()): Controller[] {
  const target = (module as { module?: unknown })?.module ?? module;
  if (!target || seen.has(target)) return [];
  seen.add(target);
  const own = (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, target as object) ??
    []) as Controller[];
  const dynamicImports = ((module as { imports?: unknown[] })?.imports ?? []) as unknown[];
  const imports = [
    ...((Reflect.getMetadata(MODULE_METADATA.IMPORTS, target as object) ?? []) as unknown[]),
    ...dynamicImports,
  ];
  return [...own, ...imports.flatMap((imported) => controllersOf(imported, seen))];
}

function routesOf(controller: Controller): Route[] {
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor' && typeof prototype[name] === 'function')
    .map((name) => ({
      controller,
      handlerName: name,
      handler: prototype[name] as (...args: unknown[]) => unknown,
    }))
    .filter((route) => Reflect.getMetadata(METHOD_METADATA, route.handler) !== undefined);
}

function guardsOf(route: Route): unknown[] {
  return [
    ...((Reflect.getMetadata(GUARDS_METADATA, route.controller) ?? []) as unknown[]),
    ...((Reflect.getMetadata(GUARDS_METADATA, route.handler) ?? []) as unknown[]),
  ];
}

const isPublic = (route: Route): boolean =>
  reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [route.handler, route.controller]) ?? false;

const label = (route: Route) => `${route.controller.name}.${route.handlerName}`;

const allRoutes = controllersOf(AppModule).flatMap(routesOf);
const axRoutes = controllersOf(AxIntegrationModule).flatMap(routesOf);

describe('AX integration route security', () => {
  it('finds the routes it is supposed to police', () => {
    expect(allRoutes.length).toBeGreaterThan(10);
    expect(axRoutes.map(label)).toEqual(['AxSyncController.sincronizar']);
  });

  it('guards every ax-integration route with AxIntegrationAuthGuard', () => {
    const unguarded = axRoutes
      .filter((route) => !guardsOf(route).includes(AxIntegrationAuthGuard))
      .map(label);
    expect(unguarded, 'Use @AxIntegrationRoute() on every AX controller').toEqual([]);
  });

  it('allows a public route only for health, login, or behind the AX machine guard', () => {
    const allowed = (route: Route) =>
      route.controller === HealthController ||
      (route.controller === AuthController && route.handlerName === 'login') ||
      guardsOf(route).includes(AxIntegrationAuthGuard);

    const violations = allRoutes
      .filter(isPublic)
      .filter((route) => !allowed(route))
      .map(label);
    expect(violations, '@Public() must never stand alone').toEqual([]);
  });

  it('keeps the contractual Spanish route and the integration rate-limit profile', () => {
    const [route] = axRoutes;
    expect(Reflect.getMetadata(PATH_METADATA, route!.controller)).toBe('productos');
    expect(Reflect.getMetadata(PATH_METADATA, route!.handler)).toBe('sincronizar');
    expect(Reflect.getMetadata(RATE_LIMIT_PROFILE, route!.handler)).toBe('integration');
  });

  it('exposes no AX status endpoint yet (STATUS_ENDPOINT=PENDING_DB_PHASE)', () => {
    const gets = axRoutes.filter(
      (route) => Reflect.getMetadata(METHOD_METADATA, route.handler) === 0,
    );
    expect(gets.map(label)).toEqual([]);
  });
});

describe('AX integration module boundaries (no database in the mock phase)', () => {
  const MODULE_DIR = path.resolve(process.cwd(), 'src/modules/ax-integration');
  const IMPORT_PATTERN = /(?:from\s+|import\s+|require\()\s*['"]([^'"]+)['"]/g;

  async function sources(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sources(full);
        return Promise.resolve(
          entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [full] : [],
        );
      }),
    );
    return nested.flat();
  }

  it('imports no database driver, no database token and no other bounded context', async () => {
    const files = await sources(MODULE_DIR);
    expect(files.length).toBeGreaterThan(4);

    const violations: string[] = [];
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      for (const match of content.matchAll(IMPORT_PATTERN)) {
        const specifier = match[1] as string;
        const resolved = specifier.startsWith('.')
          ? path.resolve(path.dirname(file), specifier)
          : specifier;
        const otherModule =
          specifier.startsWith('.') &&
          resolved.includes(`${path.sep}modules${path.sep}`) &&
          !resolved.startsWith(MODULE_DIR);
        const database =
          /^(drizzle-orm|postgres|pg)(\/|$)/.test(specifier) ||
          resolved.includes(`${path.sep}database${path.sep}`);
        if (otherModule || database)
          violations.push(`${path.relative(MODULE_DIR, file)} imports "${specifier}"`);
      }
      if (/\bDATABASE(_SQL)?\b/.test(content)) {
        violations.push(`${path.relative(MODULE_DIR, file)} references a DATABASE token`);
      }
    }
    expect(violations).toEqual([]);
  });
});
