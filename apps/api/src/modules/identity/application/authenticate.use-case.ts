import { Inject, Injectable } from '@nestjs/common';
import { UnauthorizedError } from '@cdr/shared';

import type { AuthenticatedActor } from '../domain/entities/role';
import {
  CREDENTIAL_VERIFIER,
  type CredentialVerifierPort,
  type LoginCredentials,
} from '../domain/ports/credential-verifier.port';
import {
  TOKEN_SERVICE,
  type IssuedAccessToken,
  type TokenServicePort,
} from '../domain/ports/token-service.port';

export interface AuthenticationResult extends IssuedAccessToken {
  readonly actor: AuthenticatedActor;
}

@Injectable()
export class AuthenticateUseCase {
  constructor(
    @Inject(CREDENTIAL_VERIFIER) private readonly credentials: CredentialVerifierPort,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenServicePort,
  ) {}

  async execute(input: LoginCredentials): Promise<AuthenticationResult> {
    const actor = await this.credentials.verify(input);
    if (!actor) {
      // Deliberately identical whether the email or password was wrong.
      throw new UnauthorizedError('Invalid email or password');
    }

    return { actor, ...(await this.tokens.issue(actor)) };
  }
}
