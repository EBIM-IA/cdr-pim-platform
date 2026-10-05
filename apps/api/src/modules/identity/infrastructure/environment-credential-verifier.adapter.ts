import { createHash, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@cdr/config';

import { API_ENV } from '../../../shared/tokens';
import type { AuthenticatedActor } from '../domain/entities/role';
import type {
  CredentialVerifierPort,
  LoginCredentials,
} from '../domain/ports/credential-verifier.port';

/**
 * Local-only identity source backed entirely by validated environment variables.
 *
 * Both comparisons hash first and then use `timingSafeEqual`, so differing input lengths do
 * not throw or create an obvious early-exit timing signal. Configuration rejects it in PRD
 * and admits it in QAS only behind ALLOW_LOCAL_AUTH_IN_QAS; it is not a user directory.
 */
@Injectable()
export class EnvironmentCredentialVerifier implements CredentialVerifierPort {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  async verify(credentials: LoginCredentials): Promise<AuthenticatedActor | null> {
    const { AUTH_LOCAL_EMAIL, AUTH_LOCAL_PASSWORD, AUTH_LOCAL_ROLES, AUTH_LOCAL_USER_ID } =
      this.env;
    // The schema requires all four when AUTH_MODE=local; fail closed if that ever changes.
    if (!AUTH_LOCAL_EMAIL || !AUTH_LOCAL_PASSWORD || !AUTH_LOCAL_ROLES || !AUTH_LOCAL_USER_ID) {
      return null;
    }

    const emailMatches = constantTimeEqual(
      credentials.email.trim().toLowerCase(),
      AUTH_LOCAL_EMAIL.trim().toLowerCase(),
    );
    const passwordMatches = constantTimeEqual(credentials.password, AUTH_LOCAL_PASSWORD);

    // Do not short-circuit either comparison above. Return one generic miss for both fields.
    if (!(emailMatches && passwordMatches)) return null;

    return {
      id: AUTH_LOCAL_USER_ID,
      email: AUTH_LOCAL_EMAIL.trim().toLowerCase(),
      roles: [...AUTH_LOCAL_ROLES],
    };
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left, 'utf8').digest();
  const rightDigest = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(leftDigest, rightDigest);
}
