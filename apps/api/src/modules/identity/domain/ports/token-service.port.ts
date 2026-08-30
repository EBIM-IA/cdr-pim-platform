import type { AuthenticatedActor, Role } from '../entities/role';

/**
 * Outbound port for issuing and verifying credentials.
 *
 * Expressed in terms of actors and roles, not of JWTs — so moving to opaque tokens, to
 * Cognito, or to the customer's Active Directory later is an adapter change.
 */
export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: string;
}

export interface AccessTokenClaims {
  readonly sub: string;
  readonly email: string;
  readonly roles: Role[];
}

export interface TokenServicePort {
  issue(actor: AuthenticatedActor): Promise<TokenPair>;
  /** Throws `UnauthorizedError` semantics via a DomainError when the token is not usable. */
  verifyAccessToken(token: string): Promise<AuthenticatedActor>;
  verifyRefreshToken(token: string): Promise<AuthenticatedActor>;
}

export const TOKEN_SERVICE = Symbol('TokenServicePort');
