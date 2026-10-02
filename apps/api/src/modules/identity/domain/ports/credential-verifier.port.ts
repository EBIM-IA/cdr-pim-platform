import type { AuthenticatedActor } from '../entities/role';

export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

/**
 * Port for the source that proves a user's identity.
 *
 * The initial adapter reads one local account from validated environment configuration.
 * Replacing it with Active Directory/OIDC later does not change the login use case.
 */
export interface CredentialVerifierPort {
  verify(credentials: LoginCredentials): Promise<AuthenticatedActor | null>;
}

export const CREDENTIAL_VERIFIER = Symbol('CredentialVerifierPort');
