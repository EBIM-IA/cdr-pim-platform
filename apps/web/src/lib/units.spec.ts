import { describe, expect, it } from 'vitest';

import {
  convertMeasurement,
  displayMeasurement,
  inferUnitFromAttributeKey,
  parseMeasurement,
} from '@/lib/units';

describe('conversión visual de unidades', () => {
  it.each([
    ['25.4 mm', 'in', 1],
    ['1 kg', 'lb', 2.20462262],
    ['28.3495231 g', 'oz', 1],
    ['4.4482216 N', 'lbf', 1],
    ['0 °C', '°F', 32],
    ['3.785411784 L', 'gal', 1],
    ['29.5735296 ml', 'fl oz', 1],
    ['1 bar', 'psi', 14.5037738],
  ])('convierte %s del sistema métrico a %s', (raw, unit, expected) => {
    const result = convertMeasurement(raw);

    expect(result?.to).toBe(unit);
    expect(result?.convertedValues[0]).toBeCloseTo(expected, 5);
  });

  it.each([
    ['1 in', 'mm', 25.4],
    ['2.20462262 lb', 'kg', 1],
    ['1 oz', 'g', 28.3495231],
    ['1 lbf', 'N', 4.44822162],
    ['32 °F', '°C', 0],
    ['1 gal', 'L', 3.785411784],
    ['1 fl oz', 'ml', 29.5735296],
    ['14.5037738 psi', 'bar', 1],
  ])('convierte %s del sistema imperial a %s', (raw, unit, expected) => {
    const result = convertMeasurement(raw);

    expect(result?.to).toBe(unit);
    expect(result?.convertedValues[0]).toBeCloseTo(expected, 5);
  });

  it('prioriza la unidad escrita y alterna la vista sin cambiar el original', () => {
    const original = '0.5 in';
    const result = displayMeasurement(
      original,
      { unit: 'mm', attributeKey: 'dDiametroDelAgujeroMm' },
      'metric',
    );

    expect(result).toMatchObject({
      sourceText: original,
      primary: { text: '12,7 mm', registered: false },
      secondary: { text: '0,5 in', registered: true },
      registeredIsPrimary: false,
    });
    expect(original).toBe('0.5 in');
  });

  it('usa la unidad sugerida por metadato o por la clave', () => {
    expect(parseMeasurement(15, 'mm')).toMatchObject({
      values: [15],
      unit: 'mm',
      hasWrittenUnit: false,
    });
    expect(parseMeasurement(35, { attributeKey: 'dDiametroExteriorMm' })).toMatchObject({
      values: [35],
      unit: 'mm',
    });
    expect(inferUnitFromAttributeKey('temperaturaMinimaC')).toBe('°C');
  });

  it('convierte temperatura negativa en ambos sentidos', () => {
    const metric = displayMeasurement('-22 °F', undefined, 'metric');
    const imperial = displayMeasurement('-30 °C', undefined, 'imperial');

    expect(metric?.primary).toMatchObject({
      text: '-30 °C',
      registered: false,
    });
    expect(imperial?.primary).toMatchObject({
      text: '-22 °F',
      registered: false,
    });
  });

  it('conserva sin conversión los valores compuestos o no soportados', () => {
    expect(convertMeasurement('5900@-35⁰C', '°C')).toBeNull();
    expect(convertMeasurement('40.000 km ó 2 años', 'mm')).toBeNull();
    expect(displayMeasurement('M12 × 1,5', 'mm', 'imperial')).toBeNull();
  });
});
