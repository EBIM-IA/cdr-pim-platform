import { Inject, Injectable } from '@nestjs/common';
import { type JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { ApiEnv } from '@cdr/config';
import { ForbiddenError } from '@cdr/shared';

import { API_ENV } from '../../../shared/tokens';
import { type AuthenticatedActor, assertRole } from '../domain/entities/role';
import type {
  AccessTokenClaims,
  TokenPair,
  TokenServicePort,
} from '../domain/ports/token-service.port';

/**
 * JWT adapter.
 *
 * Access and refresh tokens are signed with **different** secrets: a leaked access token
 * then cannot be replayed as a refresh token, and rotating one does not invalidate the
 * other. Both secrets come from AWS Secrets Manager in QAS/PRD and are required to be at
 * least 32 characters by the configuration schema.
 */
@Injectable()
export class JwtTokenService implements TokenServicePort {
  constructor(
    private readonly jwt: JwtService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async issue(actor: AuthenticatedActor): Promise<TokenPair> {
    const claims: AccessTokenClaims = {
      sub: actor.id,
      email: actor.email,
      roles: [...actor.roles],
    };

    // `@nestjs/jwt` types `expiresIn` as the `ms` library's template-literal union, which
    // a `string` from configuration cannot satisfy structurally. The configuration schema
    // already enforces exactly that format, so the cast asserts something we have checked.
    const accessTtl = this.env.JWT_ACCESS_TTL as JwtSignOptions['expiresIn'];
    const refreshTtl = this.env.JWT_REFRESH_TTL as JwtSignOptions['expiresIn'];

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(claims, {
        secret: this.env.JWT_ACCESS_SECRET,
        expiresIn: accessTtl,
      }),
      // The refresh token carries the subject only — no roles. Roles are re-read on refresh
      // so that revoking a role takes effect within one access-token lifetime.
      this.jwt.signAsync(
        { sub: actor.id, email: actor.email },
        { secret: this.env.JWT_REFRESH_SECRET, expiresIn: refreshTtl },
      ),
    ]);

    return { accessToken, refreshToken, expiresIn: this.env.JWT_ACCESS_TTL };
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedActor> {
    return this.verify(token, this.env.JWT_ACCESS_SECRET);
  }

  async verifyRefreshToken(token: string): Promise<AuthenticatedActor> {
    return this.verify(token, this.env.JWT_REFRESH_SECRET);
  }

  private async verify(token: string, secret: string): Promise<AuthenticatedActor> {
    try {
      const payload = await this.jwt.verifyAsync<Partial<AccessTokenClaims>>(token, { secret });
      if (!payload.sub || !payload.email) {
        throw new ForbiddenError('Token is missing required claims');
      }
      return {
        id: payload.sub,
        email: payload.email,
        roles: (payload.roles ?? []).map((role) => assertRole(role)),
      };
    } catch (error) {
      if (error instanceof ForbiddenError) throw error;
      // Never surface the library's reason ("jwt expired", "invalid signature"): it tells
      // an attacker which half of the credential to fix.
      throw new ForbiddenError('Invalid or expired token');
    }
  }
}
