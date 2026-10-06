import { describe, expect, it } from 'vitest';

import { loadWebEnv } from './web-env';

describe('loadWebEnv', () => {
  it('keeps localhost available in local development', () => {
    expect(loadWebEnv({}).API_BASE_URL).toBe('http://localhost:3001');
  });

  it('requires production mode and a non-local API in hosted environments', () => {
    expect(() => loadWebEnv({ APP_ENV: 'prd', API_BASE_URL: 'http://localhost:3001' })).toThrow(
      /NODE_ENV.*API_BASE_URL/s,
    );
  });

  it('rejects credentials embedded in a hosted API URL', () => {
    expect(() =>
      loadWebEnv({
        NODE_ENV: 'production',
        APP_ENV: 'qas',
        API_BASE_URL: 'https://user:password@api.example.test',
      }),
    ).toThrow(/embedded credentials/);
  });

  describe('PUBLIC_APP_ORIGIN', () => {
    const hosted = {
      NODE_ENV: 'production',
      APP_ENV: 'qas',
      API_BASE_URL: 'http://api.cdr-pim-qas.internal:3001',
    };

    it('defaults to the local development origin', () => {
      expect(loadWebEnv({}).PUBLIC_APP_ORIGIN).toBe('http://localhost:3100');
    });

    it('accepts an https public origin in hosted environments', () => {
      expect(
        loadWebEnv({ ...hosted, PUBLIC_APP_ORIGIN: 'https://pim-qas.example.test' })
          .PUBLIC_APP_ORIGIN,
      ).toBe('https://pim-qas.example.test');
    });

    it.each(['https://pim.example.test/', 'https://pim.example.test/app', 'pim.example.test'])(
      'rejects %s because it is not a bare origin',
      (PUBLIC_APP_ORIGIN) => {
        expect(() => loadWebEnv({ PUBLIC_APP_ORIGIN })).toThrow(/PUBLIC_APP_ORIGIN/);
      },
    );

    it.each(['qas', 'prd'])('refuses the local default or plain http in %s', (APP_ENV) => {
      expect(() => loadWebEnv({ ...hosted, APP_ENV })).toThrow(
        /PUBLIC_APP_ORIGIN.*https.*PUBLIC_APP_ORIGIN.*public application origin/s,
      );
      expect(() =>
        loadWebEnv({ ...hosted, APP_ENV, PUBLIC_APP_ORIGIN: 'http://pim.example.test' }),
      ).toThrow(/PUBLIC_APP_ORIGIN.*must use https/s);
    });
  });
});
