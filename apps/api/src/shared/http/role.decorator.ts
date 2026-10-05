import { SetMetadata } from '@nestjs/common';
import type { AuthRole } from '@cdr/contracts';

export const REQUIRED_ROLE = 'cdr:required-role';

/** @deprecated Prefer `RequireCapabilities`; retained while legacy routes are migrated. */
export const RequireRole = (role: AuthRole): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLE, role);
