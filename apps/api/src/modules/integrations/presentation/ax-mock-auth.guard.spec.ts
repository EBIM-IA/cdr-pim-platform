import type { ExecutionContext } from '@nestjs/common';
import type { ApiEnv } from '@cdr/config';
import { NotFoundError, UnauthorizedError } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { AxMockAuthGuard } from './ax-mock-auth.guard';

const secret = 'local-ax-mock-secret-at-least-32-chars';

describe('AxMockAuthGuard', () => {
  it('accepts only the dedicated mock secret', () => {
    const guard = new AxMockAuthGuard(environment('local'));
    expect(guard.canActivate(context({ 'x-ax-mock-key': secret }))).toBe(true);
    expect(() => guard.canActivate(context({ 'x-ax-mock-key': 'wrong-secret' }))).toThrow(
      UnauthorizedError,
    );
  });

  it('does not treat a bearer JWT as AX machine authentication', () => {
    const guard = new AxMockAuthGuard(environment('local'));
    expect(() => guard.canActivate(context({ authorization: `Bearer ${secret}` }))).toThrow(
      UnauthorizedError,
    );
  });

  it('hides the route while the mock is disabled', () => {
    const guard = new AxMockAuthGuard(environment('disabled'));
    expect(() => guard.canActivate(context({ 'x-ax-mock-key': secret }))).toThrow(NotFoundError);
  });
});

function environment(mode: 'disabled' | 'local'): ApiEnv {
  return {
    AX_MOCK_MODE: mode,
    ...(mode === 'local' ? { AX_MOCK_SHARED_SECRET: secret } : {}),
  } as ApiEnv;
}

function context(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}
