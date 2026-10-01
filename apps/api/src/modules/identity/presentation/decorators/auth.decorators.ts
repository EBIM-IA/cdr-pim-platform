import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export { PUBLIC_ROUTE, Public } from '../../../../shared/http/public.decorator';
export { REQUIRED_ROLE, RequireRole } from '../../../../shared/http/role.decorator';

/** Injects the authenticated actor established by `JwtAuthGuard`. */
export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<{ actor?: unknown }>().actor;
});
