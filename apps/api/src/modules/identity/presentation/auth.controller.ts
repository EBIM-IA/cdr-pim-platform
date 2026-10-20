import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AuthMeResponse,
  type AuthenticatedActorDto,
  type LoginRequest,
  type LoginResponse,
  authMeResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
} from '@cdr/contracts';

import { openApiSchema } from '../../../shared/http/openapi';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { RateLimit } from '../../../shared/http/rate-limit';
import { AuthenticateUseCase } from '../application/authenticate.use-case';
import { type AuthenticatedActor, Capability, capabilitiesForActor } from '../domain/entities/role';
import { CurrentActor, Public, RequireCapabilities } from './decorators/auth.decorators';

@ApiTags('identity')
@Controller('auth')
@RequireCapabilities(Capability.IdentitySelfRead)
export class AuthController {
  constructor(private readonly authenticate: AuthenticateUseCase) {}

  @Public()
  @RateLimit('login')
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Authenticate with the configured local development account' })
  @ApiOkResponse({ schema: openApiSchema(loginResponseSchema) })
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
  ): Promise<LoginResponse> {
    const result = await this.authenticate.execute(body);
    return { ...result, actor: toActorDto(result.actor) };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the actor represented by the access token' })
  @ApiOkResponse({ schema: openApiSchema(authMeResponseSchema) })
  me(@CurrentActor() actor: AuthenticatedActor): AuthMeResponse {
    return { actor: toActorDto(actor) };
  }
}

function toActorDto(actor: AuthenticatedActor): AuthenticatedActorDto {
  return {
    id: actor.id,
    email: actor.email,
    roles: [...actor.roles],
    capabilities: capabilitiesForActor(actor),
  };
}
