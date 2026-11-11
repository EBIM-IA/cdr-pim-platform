import { describe, expect, it } from 'vitest';
import { saveCatalogParameterSchema } from './catalog-parameters';
const base = { kind: 'brand', value: 'SKF', expectedVersion: 0 };
describe('catalog parameter contracts', () => {
  it('requires a target for synonyms and matching optimistic identity/version', () => {
    expect(
      saveCatalogParameterSchema.safeParse({
        kind: 'synonym',
        value: 'cojinete',
        expectedVersion: 0,
      }).success,
    ).toBe(false);
    expect(saveCatalogParameterSchema.safeParse({ ...base, expectedVersion: 2 }).success).toBe(
      false,
    );
  });
  it('accepts embedded raster logos and rejects remote or SVG resources', () => {
    expect(
      saveCatalogParameterSchema.safeParse({
        ...base,
        logoDataUrl: 'data:image/png;base64,aGVsbG8=',
      }).success,
    ).toBe(true);
    expect(
      saveCatalogParameterSchema.safeParse({
        ...base,
        logoDataUrl: 'https://example.test/logo.png',
      }).success,
    ).toBe(false);
    expect(
      saveCatalogParameterSchema.safeParse({
        ...base,
        logoDataUrl: 'data:image/svg+xml;base64,aGVsbG8=',
      }).success,
    ).toBe(false);
  });
});
