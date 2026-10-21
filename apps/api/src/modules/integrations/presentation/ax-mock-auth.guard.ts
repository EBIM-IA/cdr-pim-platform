import { createHash, timingSafeEqual } from 'node:crypto';

import { CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@cdr/config';
import { NotFoundError, UnauthorizedError } from '@cdr/shared';
import type { Request } from 'express';

import { API_ENV } from '../../../shared/tokens';

/** Dedicated machine authentication for the local AX mock; it never accepts a human JWT. */
@Injectable()
export class AxMockAuthGuard implements CanActivate {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.env.AX_MOCK_MODE !== 'local') {
      throw new NotFoundError('AX mock route', 'disabled');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const supplied = request.headers['x-ax-mock-key'];
    if (
      typeof supplied !== 'string' ||
      !constantTimeEquals(supplied, this.env.AX_MOCK_SHARED_SECRET as string)
    ) {
      throw new UnauthorizedError('Invalid AX mock credential');
    }
    return true;
  }
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left, 'utf8').digest();
  const rightDigest = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(leftDigest, rightDigest);
}
