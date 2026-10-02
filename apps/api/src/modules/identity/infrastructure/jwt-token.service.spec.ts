import { loadApiEnv } from '@cdr/config';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';

import { Role } from '../domain/entities/role';
import { JwtTokenService } from './jwt-token.service';

const env = loadApiEnv({
  NODE_ENV: 'test',
  APP_ENV: 'test',
  DATABASE_URL: 'postgres://cdr:cdr@localhost:5432/cdr_pim',
  AUTH_MODE: 'local',
  AUTH_LOCAL_USER_ID: 'jwt-test-user',
  AUTH_LOCAL_EMAIL: 'jwt-test@casadelruliman.com',
  AUTH_LOCAL_PASSWORD: 'a-safe-local-password',
  AUTH_LOCAL_ROLES: 'ADMIN',
  JWT_ACCESS_SECRET: 'jwt-test-access-secret-at-least-32-chars',
  JWT_ISSUER: 'issuer-under-test',
  JWT_AUDIENCE: 'audience-under-test',
});

describe('JwtTokenService', () => {
  const jwt = new JwtService();
  const tokens = new JwtTokenService(jwt, env);
  const actor = {
    id: 'user-1',
    email: 'admin@casadelruliman.com',
    roles: [Role.Admin],
  } as const;

  it('issues a short-lived, audience-bound HS256 token with a unique id', async () => {
    const issued = await tokens.issue(actor);
    const decoded = jwt.decode(issued.accessToken, { complete: true });

    expect(decoded?.header.alg).toBe('HS256');
    expect(decoded?.payload).toMatchObject({
      sub: actor.id,
      iss: env.JWT_ISSUER,
      aud: env.JWT_AUDIENCE,
    });
    expect((decoded?.payload as { jti?: string }).jti).toBeTruthy();
    await expect(tokens.verifyAccessToken(issued.accessToken)).resolves.toEqual(actor);
  });

  it('rejects a correctly signed token issued for another audience', async () => {
    const token = await jwt.signAsync(
      { sub: actor.id, email: actor.email, roles: actor.roles },
      {
        secret: env.JWT_ACCESS_SECRET,
        algorithm: 'HS256',
        issuer: env.JWT_ISSUER,
        audience: 'another-application',
        jwtid: 'token-id',
        expiresIn: '15m',
      },
    );

    await expect(tokens.verifyAccessToken(token)).rejects.toThrow('Invalid or expired token');
  });

  it('rejects legacy tokens without a jti claim', async () => {
    const token = await jwt.signAsync(
      { sub: actor.id, email: actor.email, roles: actor.roles },
      {
        secret: env.JWT_ACCESS_SECRET,
        algorithm: 'HS256',
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        expiresIn: '15m',
      },
    );

    await expect(tokens.verifyAccessToken(token)).rejects.toThrow('Invalid or expired token');
  });
});
