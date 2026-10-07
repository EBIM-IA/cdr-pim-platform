import { describe, expect, it } from 'vitest';

import { normalizeWorkbookApplicationTypes } from './drizzle-dynamic-catalog.repository';

describe('normalizeWorkbookApplicationTypes', () => {
  it.each([
    ['AUTOMOTRIZ', ['AUTOMOTRIZ']],
    ['INDUSTRIAL', ['INDUSTRIAL']],
    ['AUTOMOTRI E INDUSTRIAL', ['AUTOMOTRIZ', 'INDUSTRIAL']],
    ['INDUSTRIAL Y AUTOMOTRIZ', ['AUTOMOTRIZ', 'INDUSTRIAL']],
    ['AUTOMOTRIZ E NINDUSTRIAL', ['AUTOMOTRIZ', 'INDUSTRIAL']],
  ])('normalizes %s to the supported facets', (value, expected) => {
    expect(normalizeWorkbookApplicationTypes(value)).toEqual(expected);
  });

  it('does not invent a scope for empty or unknown values', () => {
    expect(normalizeWorkbookApplicationTypes(null)).toEqual([]);
    expect(normalizeWorkbookApplicationTypes('OTRO')).toEqual([]);
  });
});
