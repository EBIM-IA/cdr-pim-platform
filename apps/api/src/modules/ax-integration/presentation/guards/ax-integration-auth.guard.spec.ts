import type { ExecutionContext } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import type { ApiEnv } from '@cdr/config';
import { UnauthorizedError } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { AxIntegrationAuthGuard } from './ax-integration-auth.guard';

// Test-only filler values; never real credentials.
const TOKEN = 'ax-test-token-'.padEnd(64, 'x');
// A JWT-shaped human token, assembled at runtime so no token-like literal sits in git.
const segment = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const HUMAN_JWT = [segment({ alg: 'HS256' }), segment({ sub: 'qas-admin' }), 'signature'].join('.');

const mockEnv = {
  AX_INTEGRATION_MODE: 'mock',
  AX_INTEGRATION_AUTH_MODE: 'static_bearer',
  AX_INTEGRATION_TOKEN: TOKEN,
} as ApiEnv;

function contextWith(authorization?: string) {
  const headers: Record<string, string> = {};
  const request = {
    method: 'POST',
    originalUrl: '/api/v1/productos/sincronizar',
    header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
  };
  const response = { setHeader: (name: string, value: string) => (headers[name] = value) };
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  return { context, headers, request };
}

describe('AxIntegrationAuthGuard', () => {
  const guard = new AxIntegrationAuthGuard(mockEnv);

  it('rejects a request without a bearer token with 401', () => {
    expect(() => guard.canActivate(contextWith().context)).toThrow(UnauthorizedError);
    expect(() => guard.canActivate(contextWith('Basic abc').context)).toThrow(UnauthorizedError);
    expect(() => guard.canActivate(contextWith('Bearer   ').context)).toThrow(UnauthorizedError);
  });

  it('rejects a wrong token with 401, whatever its length', () => {
    for (const presented of ['x', TOKEN.slice(0, -1), `${TOKEN}x`, TOKEN.toUpperCase()]) {
      expect(() => guard.canActivate(contextWith(`Bearer ${presented}`).context)).toThrow(
        'Invalid integration token',
      );
    }
  });

  it('rejects a human JWT with 401: this route has no human access', () => {
    expect(() => guard.canActivate(contextWith(`Bearer ${HUMAN_JWT}`).context)).toThrow(
      UnauthorizedError,
    );
  });

  it('accepts the configured AX token, case-insensitive scheme', () => {
    expect(guard.canActivate(contextWith(`Bearer ${TOKEN}`).context)).toBe(true);
    expect(guard.canActivate(contextWith(`bearer ${TOKEN}`).context)).toBe(true);
  });

  it('marks every guarded response as the QAS mock', () => {
    const { context, headers } = contextWith();
    expect(() => guard.canActivate(context)).toThrow();
    expect(headers['X-CDR-QAS-Mock']).toBe('true');
  });

  it('never attaches or echoes the token', () => {
    const { context, request } = contextWith(`Bearer ${TOKEN}`);
    guard.canActivate(context);
    expect(JSON.stringify(request)).not.toContain(TOKEN.slice(14));
    try {
      guard.canActivate(contextWith(`Bearer ${TOKEN}-wrong`).context);
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(TOKEN);
      expect((error as Error).message).not.toContain(TOKEN);
    }
  });

  it.each([
    { AX_INTEGRATION_MODE: 'disabled', AX_INTEGRATION_AUTH_MODE: 'disabled' },
    {
      AX_INTEGRATION_MODE: 'disabled',
      AX_INTEGRATION_AUTH_MODE: 'static_bearer',
      AX_INTEGRATION_TOKEN: TOKEN,
    },
  ])('answers 404 when the integration is disabled (%o)', (env) => {
    const disabled = new AxIntegrationAuthGuard(env as ApiEnv);
    expect(() => disabled.canActivate(contextWith(`Bearer ${TOKEN}`).context)).toThrow(
      NotFoundException,
    );
  });
});
