import { SetMetadata } from '@nestjs/common';

import type { Capability } from '../../modules/identity/domain/entities/role';

export const REQUIRED_CAPABILITIES = 'cdr:required-capabilities';

/** All declared capabilities are required. Roles are resolved to grants in one policy. */
export const RequireCapabilities = (
  ...capabilities: readonly [Capability, ...Capability[]]
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_CAPABILITIES, capabilities);
