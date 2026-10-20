import { describe, expect, it } from 'vitest';

import { isAutomotiveApplicationType } from './drizzle-group-oem-code.repository';

describe('OEM automotive application detection', () => {
  it.each([
    'Automotriz',
    'AUTOMOTRICES',
    'Automóvil',
    'Automóviles livianos',
    'Aplicación automotriz / automóvil',
  ])('accepts the explicit automotive value %s', (value) => {
    expect(isAutomotiveApplicationType(value)).toBe(true);
  });

  it.each([
    'No automotriz',
    'Industrial - no es automotriz',
    'Sin aplicación automóvil',
    'Excepto automóviles',
    'Industrial',
    '',
    null,
  ])('rejects non-automotive or negated value %s', (value) => {
    expect(isAutomotiveApplicationType(value)).toBe(false);
  });
});
