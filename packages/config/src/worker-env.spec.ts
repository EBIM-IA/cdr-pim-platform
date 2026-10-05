import { describe, expect, it } from 'vitest';

import { loadWorkerEnv } from './worker-env';

describe('loadWorkerEnv', () => {
  it('keeps local adapters available for development', () => {
    const env = loadWorkerEnv({ NODE_ENV: 'test', APP_ENV: 'test' });
    expect(env.QUEUE_DRIVER).toBe('memory');
    expect(env.STORAGE_DRIVER).toBe('memory');
  });

  it('fails closed when a production worker starts with local defaults', () => {
    expect(() => loadWorkerEnv({ NODE_ENV: 'production' })).toThrow(/APP_ENV.*qas or prd/s);
  });

  it('rejects development endpoints and volatile adapters in hosted environments', () => {
    expect(() =>
      loadWorkerEnv({
        NODE_ENV: 'production',
        APP_ENV: 'qas',
        QUEUE_DRIVER: 'memory',
        STORAGE_DRIVER: 'memory',
        AWS_ENDPOINT_URL: 'http://localhost:4566',
        OPENAI_BASE_URL: 'https://proxy.example.test',
      }),
    ).toThrow(/QUEUE_DRIVER.*STORAGE_DRIVER.*AWS_ENDPOINT_URL.*OPENAI_BASE_URL/s);
  });
});
