import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';

import { Public } from '../../../shared/http/public.decorator';
import { AxIntegrationAuthGuard } from './guards/ax-integration-auth.guard';

export const AX_INTEGRATION_ROUTE = 'cdr:ax-integration-route';

/**
 * The only way to declare an AX integration route.
 *
 * `@Public()` takes the route out of the HUMAN pipeline (JwtAuthGuard, RolesGuard), because
 * a system integration has neither a user session nor a role — and in the same breath
 * attaches the dedicated machine guard. Public never stands alone here:
 * test/architecture/ax-integration-security.spec.ts fails if any route of this module, or
 * any public route anywhere, lacks AxIntegrationAuthGuard (health and login excepted).
 */
export const AxIntegrationRoute = (): ClassDecorator =>
  applyDecorators(
    SetMetadata(AX_INTEGRATION_ROUTE, true),
    Public(),
    UseGuards(AxIntegrationAuthGuard),
  );
