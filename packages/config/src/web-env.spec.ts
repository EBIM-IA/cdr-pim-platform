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
});
