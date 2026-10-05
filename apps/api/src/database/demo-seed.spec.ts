import { isUuid } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { DEMO_PRODUCT_SEEDS, assertDemoSeedEnvironment, deterministicDemoUuid } from './demo-seed';

describe('demo seed definition', () => {
  it('contains only the seven source-backed products', () => {
    expect(DEMO_PRODUCT_SEEDS.map((seed) => seed.sku)).toEqual([
      '6202-2RSR-L038-C3',
      '1200-TVH-C3',
      'CDR-0000016843',
      'D1672',
      'CDR-0000000933',
      'CDR-0000014230',
      'CDR-0000024151',
    ]);
  });

  it('generates stable, scoped UUIDs', () => {
    const first = deterministicDemoUuid('product', 'D1672');

    expect(isUuid(first)).toBe(true);
    expect(deterministicDemoUuid('product', 'D1672')).toBe(first);
    expect(deterministicDemoUuid('equivalence-group', 'D1672')).not.toBe(first);
  });

  it.each(['local', 'test'])('allows %s explicitly', (environment) => {
    expect(() => assertDemoSeedEnvironment(environment)).not.toThrow();
  });

  it.each(['qas', 'prd', '', 'development'])('rejects %s', (environment) => {
    expect(() => assertDemoSeedEnvironment(environment)).toThrow(/APP_ENV=local or APP_ENV=test/);
  });
});
