import { createHash, timingSafeEqual } from 'node:crypto';

import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ApiEnv } from '@cdr/config';
import { UnauthorizedError } from '@cdr/shared';
import type { Request, Response } from 'express';

import { API_ENV } from '../../../../shared/tokens';

/** Marks every response of the temporary mock, success or failure. */
export const AX_QAS_MOCK_HEADER = 'X-CDR-QAS-Mock';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Machine-to-machine authentication of the AX integration — TEMPORARY, QAS ONLY.
 *
 * `Authorization: Bearer <token>` is compared with AX_INTEGRATION_TOKEN in constant time.
 * Both sides are hashed first, so the comparison never depends on (or leaks) the length
 * of the presented value. A human JWT, a wrong token and a missing header all get 401:
 * this route accepts exactly one credential and no role.
 *
 * With AX_INTEGRATION_MODE=disabled the route answers 404, exactly like a route that does
 * not exist, so a deployment without the mock exposes nothing.
 *
 * The token is never logged, never echoed and never attached to the request.
 */
@Injectable()
export class AxIntegrationAuthGuard implements CanActivate {
  private readonly expected: Buffer | null;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    const enabled =
      env.AX_INTEGRATION_MODE === 'mock' &&
      env.AX_INTEGRATION_AUTH_MODE === 'static_bearer' &&
      Boolean(env.AX_INTEGRATION_TOKEN);
    this.expected = enabled ? digest(env.AX_INTEGRATION_TOKEN as string) : null;
  }

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    if (!this.expected) {
      throw new NotFoundException(`Cannot ${request.method} ${request.originalUrl}`);
    }
    http.getResponse<Response>().setHeader(AX_QAS_MOCK_HEADER, 'true');

    const header = request.header('authorization');
    if (!header || !/^bearer\s/i.test(header)) {
      throw new UnauthorizedError('Missing bearer token');
    }
    const presented = header.slice(7).trim();
    if (!presented) throw new UnauthorizedError('Missing bearer token');

    if (!timingSafeEqual(digest(presented), this.expected)) {
      throw new UnauthorizedError('Invalid integration token');
    }
    return true;
  }
}
