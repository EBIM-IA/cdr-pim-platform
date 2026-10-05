import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UnauthorizedError } from '@cdr/shared';
import type { Request } from 'express';

import { PUBLIC_ROUTE } from '../../../../shared/http/public.decorator';
import { TOKEN_SERVICE, type TokenServicePort } from '../../domain/ports/token-service.port';

/**
 * Authenticates a request from its `Authorization: Bearer` header and attaches the actor.
 *
 * Registered globally: every controller is private unless explicitly marked `@Public()`.
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
      throw new UnauthorizedError('Missing bearer token');
    }
    const token = header.slice(7).trim();
    if (!token) throw new UnauthorizedError('Missing bearer token');
    request.actor = await this.tokens.verifyAccessToken(token);
    return true;
  }
}
