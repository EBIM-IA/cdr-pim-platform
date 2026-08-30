import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { Role } from '../../domain/entities/role';

export const PUBLIC_ROUTE = 'cdr:public-route';
export const REQUIRED_ROLE = 'cdr:required-role';

/** Marks a route as reachable without authentication (health probes, login, refresh). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE, true);

/** Minimum role required. Higher roles satisfy lower ones (ADMIN > EDITOR > VIEWER). */
export const RequireRole = (role: Role): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLE, role);

/** Injects the authenticated actor established by `JwtAuthGuard`. */
export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<{ actor?: unknown }>().actor;
});
