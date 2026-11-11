import { describe, expect, it } from 'vitest';
import { expandCatalogSynonyms } from './catalog-synonyms';
describe('configured search synonyms', () => {
  it('matches case and accents and preserves the original term', () => {
    expect(expandCatalogSynonyms('Rulimán', [{ value: 'ruliman', target: 'rodamiento' }])).toEqual([
      'Rulimán',
      'rodamiento',
    ]);
  });
  it('does not recurse through cycles or expand unrelated terms', () => {
    const rules = [
      { value: 'a', target: 'b' },
      { value: 'b', target: 'a' },
    ];
    expect(expandCatalogSynonyms('a', rules)).toEqual(['a', 'b']);
    expect(expandCatalogSynonyms('c', rules)).toEqual(['c']);
  });
});
