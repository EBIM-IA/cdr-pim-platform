import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** Injects the authenticated actor established by the global authentication guard. */
export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<{ actor?: unknown }>().actor;
});
