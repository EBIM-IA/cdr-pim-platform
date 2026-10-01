import { SetMetadata } from '@nestjs/common';
import type { AuthRole } from '@cdr/contracts';

export const REQUIRED_ROLE = 'cdr:required-role';

/** Minimum role required. Higher roles satisfy lower ones (ADMIN > EDITOR > VIEWER). */
export const RequireRole = (role: AuthRole): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLE, role);
