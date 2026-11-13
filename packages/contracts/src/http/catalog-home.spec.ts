import { describe, expect, it } from 'vitest';
import { catalogHomeSettingsSchema } from './catalog-home';
const entry = { key: 'BOSCH', visible: true, image: '/home/marcas/bosch.png', text: '' };
const input = { config: { brands: [entry], categories: [] }, version: 0 };
describe('Home settings boundary', () => {
  it('accepts packaged assets and raster uploads, while rejecting remote URLs and uploaded SVG', () => {
    expect(catalogHomeSettingsSchema.safeParse(input).success).toBe(true);
    for (const image of [
      'https://external.test/logo.png',
      'data:image/svg+xml;base64,aGVsbG8=',
      '/home/../private.png',
    ])
      expect(
        catalogHomeSettingsSchema.safeParse({
          ...input,
          config: { ...input.config, brands: [{ ...entry, image }] },
        }).success,
      ).toBe(false);
    expect(
      catalogHomeSettingsSchema.safeParse({
        ...input,
        config: {
          ...input.config,
          brands: [{ ...entry, image: 'data:image/png;base64,aGVsbG8=' }],
        },
      }).success,
    ).toBe(true);
  });
  it('rejects duplicate keys, stale version shapes and oversized image collections', () => {
    expect(catalogHomeSettingsSchema.safeParse({ ...input, version: -1 }).success).toBe(false);
    expect(
      catalogHomeSettingsSchema.safeParse({
        ...input,
        config: { ...input.config, brands: [{ ...entry, text: '\u0000' }] },
      }).success,
    ).toBe(false);
    expect(
      catalogHomeSettingsSchema.safeParse({
        ...input,
        config: { ...input.config, brands: [entry, { ...entry, key: 'bosch' }] },
      }).success,
    ).toBe(false);
    expect(
      catalogHomeSettingsSchema.safeParse({
        ...input,
        config: {
          ...input.config,
          brands: Array.from({ length: 6 }, (_, index) => ({
            ...entry,
            key: `brand-${index}`,
            image: 'data:image/png;base64,' + 'a'.repeat(650_000),
          })),
        },
      }).success,
    ).toBe(false);
  });
});
