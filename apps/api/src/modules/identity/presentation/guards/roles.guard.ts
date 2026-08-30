import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import { ForbiddenError } from '@cdr/shared';

import { type AuthenticatedActor, type Role, actorSatisfies } from '../../domain/entities/role';
import { REQUIRED_ROLE } from '../decorators/auth.decorators';

/** Enforces the minimum role declared with `@RequireRole`. Runs after `JwtAuthGuard`. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role | undefined>(REQUIRED_ROLE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const actor = context.switchToHttp().getRequest<{ actor?: AuthenticatedActor }>().actor;
    if (!actor) throw new ForbiddenError('Not authenticated');
    if (!actorSatisfies(actor, required)) {
      throw new ForbiddenError('Insufficient role', { required });
    }
    return true;
  }
}
