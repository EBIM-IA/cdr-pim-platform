import { Inject, Injectable } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { ApiEnv } from '@cdr/config';
import { UnauthorizedError, newUuid } from '@cdr/shared';

import { API_ENV } from '../../../shared/tokens';
import { type AuthenticatedActor, assertRole } from '../domain/entities/role';
import type {
  AccessTokenClaims,
  IssuedAccessToken,
  TokenServicePort,
} from '../domain/ports/token-service.port';

/**
 * JWT adapter.
 *
 * Only short-lived access tokens exist in this phase. Refresh tokens require a durable user
 * source so roles can be re-read on refresh; issuing one from a static environment account
 * would imply revocation and rotation guarantees the system does not have.
 */
@Injectable()
export class JwtTokenService implements TokenServicePort {
  constructor(
    private readonly jwt: JwtService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async issue(actor: AuthenticatedActor): Promise<IssuedAccessToken> {
    const claims: AccessTokenClaims = {
      sub: actor.id,
      email: actor.email,
      roles: [...actor.roles],
    };

    // `@nestjs/jwt` types `expiresIn` as the `ms` library's template-literal union, which
    // a `string` from configuration cannot satisfy structurally. The configuration schema
    // already enforces exactly that format, so the cast asserts something we have checked.
    const accessTtl = this.env.JWT_ACCESS_TTL as JwtSignOptions['expiresIn'];
    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: accessTtl,
      algorithm: this.env.JWT_ALGORITHM,
      issuer: this.env.JWT_ISSUER,
      audience: this.env.JWT_AUDIENCE,
      jwtid: newUuid(),
    });

    return { accessToken, expiresIn: this.env.JWT_ACCESS_TTL };
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedActor> {
    return this.verify(token, this.env.JWT_ACCESS_SECRET);
  }

  private async verify(token: string, secret: string): Promise<AuthenticatedActor> {
    try {
      const payload = await this.jwt.verifyAsync<Partial<AccessTokenClaims> & { jti?: string }>(
        token,
        {
          secret,
          algorithms: [this.env.JWT_ALGORITHM],
          issuer: this.env.JWT_ISSUER,
          audience: this.env.JWT_AUDIENCE,
        },
      );
      if (!payload.sub || !payload.email || !payload.jti || !Array.isArray(payload.roles)) {
        throw new UnauthorizedError('Invalid or expired token');
      }
      return {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles.map((role) => assertRole(role)),
      };
    } catch (error) {
      // Never surface the library's reason ("jwt expired", "invalid signature"): it tells
      // an attacker which half of the credential to fix.
      if (error instanceof UnauthorizedError) throw error;
      throw new UnauthorizedError('Invalid or expired token');
    }
  }
}
