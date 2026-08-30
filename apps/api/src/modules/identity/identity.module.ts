import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { TOKEN_SERVICE } from './domain/ports/token-service.port';
import { JwtTokenService } from './infrastructure/jwt-token.service';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';
import { RolesGuard } from './presentation/guards/roles.guard';

/**
 * Authentication and authorisation foundation.
 *
 * What exists: the role model, the token port, its JWT adapter, and both guards.
 * What does not exist yet, on purpose: a user repository, a login endpoint, refresh-token
 * rotation and revocation. Those need decisions from Casa del Rulimán about where users
 * come from (local accounts? their Active Directory?), which is a functional question.
 */
@Module({
  imports: [JwtModule.register({})],
  providers: [{ provide: TOKEN_SERVICE, useClass: JwtTokenService }, JwtAuthGuard, RolesGuard],
  exports: [TOKEN_SERVICE, JwtAuthGuard, RolesGuard],
})
export class IdentityModule {}
