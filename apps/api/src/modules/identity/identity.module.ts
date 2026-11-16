import { ModulePolicyUseCase } from './application/module-policy.use-case';
import { MODULE_POLICY_RESOLVER, MODULE_POLICY } from './domain/ports/module-policy.port';
import { PostgresModulePolicyAdapter } from './infrastructure/postgres-module-policy.adapter';
import { ModulePolicyController } from './presentation/module-policy.controller';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthenticateUseCase } from './application/authenticate.use-case';
import { CREDENTIAL_VERIFIER } from './domain/ports/credential-verifier.port';
import { TOKEN_SERVICE } from './domain/ports/token-service.port';
import { EnvironmentCredentialVerifier } from './infrastructure/environment-credential-verifier.adapter';
import { JwtTokenService } from './infrastructure/jwt-token.service';
import { AuthController } from './presentation/auth.controller';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';
import { RolesGuard } from './presentation/guards/roles.guard';

/**
 * Authentication and authorisation foundation.
 *
 * Local authentication is a development bridge, configured only through environment
 * variables and rejected at bootstrap in QAS/PRD. The port preserves the seam for the
 * customer's eventual Active Directory/OIDC source.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, ModulePolicyController],
  providers: [
    ModulePolicyUseCase,
    { provide: MODULE_POLICY_RESOLVER, useExisting: ModulePolicyUseCase },
    { provide: MODULE_POLICY, useClass: PostgresModulePolicyAdapter },
    { provide: CREDENTIAL_VERIFIER, useClass: EnvironmentCredentialVerifier },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    AuthenticateUseCase,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    MODULE_POLICY_RESOLVER,
    ModulePolicyUseCase,
    CREDENTIAL_VERIFIER,
    TOKEN_SERVICE,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class IdentityModule {}
