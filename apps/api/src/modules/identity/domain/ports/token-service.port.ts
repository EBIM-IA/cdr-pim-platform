import type { AuthenticatedActor, Role } from '../entities/role';

/**
 * Outbound port for issuing and verifying credentials.
 *
 * Expressed in terms of actors and roles, not of JWTs — so moving to opaque tokens, to
 * Cognito, or to the customer's Active Directory later is an adapter change.
 */
export interface IssuedAccessToken {
  readonly accessToken: string;
  readonly expiresIn: string;
}

export interface AccessTokenClaims {
  readonly sub: string;
  readonly email: string;
  readonly roles: Role[];
}

export interface TokenServicePort {
  issue(actor: AuthenticatedActor): Promise<IssuedAccessToken>;
  /** Throws `UnauthorizedError` when the token is missing, malformed or expired. */
  verifyAccessToken(token: string): Promise<AuthenticatedActor>;
}

export const TOKEN_SERVICE = Symbol('TokenServicePort');
