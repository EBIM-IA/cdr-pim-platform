import { createHash } from 'node:crypto';

import { SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { ThrottlerGetTrackerFunction } from '@nestjs/throttler';
import type { Request } from 'express';

import type { AuthenticatedActor } from '../../modules/identity/domain/entities/role';

export const RATE_LIMIT_PROFILE = Symbol('rate-limit-profile');
export type RateLimitProfile = 'login' | 'ai' | 'index' | 'integration';

/** Marks the small set of endpoints that need a stricter limit than the API default. */
export const RateLimit = (profile: RateLimitProfile): MethodDecorator =>
  SetMetadata(RATE_LIMIT_PROFILE, profile);

export function hasRateLimitProfile(context: ExecutionContext, profile: RateLimitProfile): boolean {
  return Reflect.getMetadata(RATE_LIMIT_PROFILE, context.getHandler()) === profile;
}

type RateLimitedRequest = Request & { actor?: AuthenticatedActor };

function normalizedIp(request: RateLimitedRequest): string {
  return request.ip || request.socket?.remoteAddress || 'unknown';
}

export const actorOrIpTracker: ThrottlerGetTrackerFunction = (rawRequest) => {
  const request = rawRequest as RateLimitedRequest;
  return request.actor?.id ? `actor:${request.actor.id}` : `ip:${normalizedIp(request)}`;
};

export const loginAccountTracker: ThrottlerGetTrackerFunction = (rawRequest) => {
  const request = rawRequest as RateLimitedRequest & { body?: { email?: unknown } };
  const email =
    typeof request.body?.email === 'string'
      ? request.body.email.trim().toLowerCase().slice(0, 254)
      : 'unknown';
  return `account:${email || 'unknown'}`;
};

/** Global keys intentionally omit controller/handler so hopping routes cannot evade the cap. */
export function globalRateLimitKey(
  _context: ExecutionContext,
  tracker: string,
  throttlerName: string,
): string {
  return createHash('sha256').update(`${throttlerName}:${tracker}`).digest('hex');
}
