import { applyDecorators, UseGuards } from '@nestjs/common';

import { Public } from '../../../shared/http/public.decorator';
import { AxMockAuthGuard } from './ax-mock-auth.guard';

/**
 * Keeps the global human-JWT bypass and the replacement machine guard inseparable.
 * Applying `@Public()` directly to an integration endpoint would be unsafe.
 */
export const AxMockAuthenticated = (): ClassDecorator & MethodDecorator =>
  applyDecorators(Public(), UseGuards(AxMockAuthGuard));
