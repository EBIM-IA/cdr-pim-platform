import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import { ForbiddenError } from '@cdr/shared';
import type { Request } from 'express';

import { TOKEN_SERVICE, type TokenServicePort } from '../../domain/ports/token-service.port';
import { PUBLIC_ROUTE } from '../decorators/auth.decorators';

/**
 * Authenticates a request from its `Authorization: Bearer` header and attaches the actor.
 *
 * NOT registered as a global `APP_GUARD` yet — see `docs/architecture/SECURITY_BASELINE.md`.
 * There is no user store or login endpoint in the foundation, so enabling it globally would
 * make every route return 403 with no way to obtain a token. Turning it on is a two-line
 * change in `AppModule` once the identity module has a real user repository.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenServicePort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { actor?: unknown }>();
    const header = request.header('authorization');
    if (!header?.toLowerCase().startsWith('bearer ')) {
      throw new ForbiddenError('Missing bearer token');
    }

    request.actor = await this.tokens.verifyAccessToken(header.slice(7).trim());
    return true;
  }
}
