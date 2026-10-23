import { describe, expect, it } from 'vitest';

import { assertQasDemoSeedEnvironment } from './qas-demo-seed';

describe('QAS demo environment boundary', () => {
  it('accepts only the explicitly configured QAS environment', () => {
    expect(() => assertQasDemoSeedEnvironment('qas')).not.toThrow();
    for (const environment of ['local', 'test', 'prd', '', 'production']) {
      expect(() => assertQasDemoSeedEnvironment(environment)).toThrow('APP_ENV=qas');
    }
  });
});
