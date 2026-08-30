import { describe, expect, it } from 'vitest';

import { ValidationError } from '../errors/domain-error';
import { assertUuid, isUuid, newUuid } from './identifier';

describe('identifier', () => {
  it('generates valid v4 UUIDs', () => {
    expect(isUuid(newUuid())).toBe(true);
  });

  it('rejects non-UUID input', () => {
    expect(isUuid('SKF-6205-2RS')).toBe(false);
    expect(() => assertUuid('not-an-id', 'productId')).toThrow(ValidationError);
  });
});
