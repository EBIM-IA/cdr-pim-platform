import { describe, expect, it } from 'vitest';

import { assertSafeTestDatabaseUrl } from './database.helper';

describe('integration database safety guard', () => {
  it.each([
    'postgres://cdr:secret@localhost:5432/cdr_pim_test',
    'postgresql://cdr:secret@localhost:5432/test-cdr-pim',
    'postgres://cdr:secret@localhost:5432/cdr_test_2',
  ])('accepts an explicitly named test database: %s', (url) => {
    expect(assertSafeTestDatabaseUrl(url)).toBe(url);
  });

  it.each([
    'postgres://cdr:secret@localhost:5432/cdr_pim',
    'postgres://cdr:secret@localhost:5432/contest',
    'mysql://cdr:secret@localhost:3306/cdr_pim_test',
    'not-a-url',
  ])('rejects an unsafe destructive-cleanup target: %s', (url) => {
    expect(() => assertSafeTestDatabaseUrl(url)).toThrow(/TEST_DATABASE_URL|Refusing/);
  });
});
