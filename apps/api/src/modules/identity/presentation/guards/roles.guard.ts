import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '@cdr/shared';

import { PUBLIC_ROUTE } from '../../../../shared/http/public.decorator';
import { REQUIRED_CAPABILITIES } from '../../../../shared/http/capability.decorator';
import { REQUIRED_ROLE } from '../../../../shared/http/role.decorator';
import {
  type AuthenticatedActor,
  type Capability,
  type Role,
  actorHasCapability,
  actorSatisfies,
} from '../../domain/entities/role';

/** Enforces explicit capabilities, with temporary support for legacy role metadata. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredCapabilities = this.reflector.getAllAndOverride<
      readonly Capability[] | undefined
    >(REQUIRED_CAPABILITIES, [context.getHandler(), context.getClass()]);
    const requiredRole = this.reflector.getAllAndOverride<Role | undefined>(REQUIRED_ROLE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredCapabilities && !requiredRole) {
      throw new ForbiddenError('Route authorization policy missing');
    }

    const actor = context.switchToHttp().getRequest<{ actor?: AuthenticatedActor }>().actor;
    if (!actor) throw new ForbiddenError('Not authenticated');
    if (
      requiredCapabilities &&
      !requiredCapabilities.every((capability) => actorHasCapability(actor, capability))
    ) {
      throw new ForbiddenError('Insufficient capability', {
        required: [...requiredCapabilities],
      });
    }
    if (!requiredCapabilities && requiredRole && !actorSatisfies(actor, requiredRole)) {
      throw new ForbiddenError('Insufficient role', { required: requiredRole });
    }
    return true;
  }
}
