import { describe, expect, it } from 'vitest';

import {
  createGroupApplicationSchema,
  groupApplicationSchema,
  deactivateGroupApplicationQuerySchema,
  updateGroupApplicationSchema,
} from './application';

describe('group application contracts', () => {
  it('normalizes the approved application type and requires make and model', () => {
    expect(
      createGroupApplicationSchema.parse({
        unifiedCode: 'D1672',
        vehicleType: ' automotriz ',
        make: 'Toyota',
        model: 'Hilux',
        bodyStyle: ' HB ',
        fuel: ' GSL ',
        traction: ' 4X2 ',
        displacement: ' 1.6L ',
        area: ' RUEDA POSTERIOR ',
        subarea: ' MANZANA 5 PERNOS CON ABS ',
      }),
    ).toMatchObject({
      vehicleType: 'AUTOMOTRIZ',
      bodyStyle: 'HB',
      fuel: 'GSL',
      traction: '4X2',
      displacement: '1.6L',
      area: 'RUEDA POSTERIOR',
      subarea: 'MANZANA 5 PERNOS CON ABS',
    });

    expect(
      createGroupApplicationSchema.safeParse({
        unifiedCode: 'D1672',
        vehicleType: 'AUTOMOTRIZ',
        make: '',
        model: 'Hilux',
      }).success,
    ).toBe(false);
    expect(
      createGroupApplicationSchema.safeParse({
        unifiedCode: 'D1672',
        vehicleType: 'CAMIÓN',
        make: 'Toyota',
        model: 'Hilux',
      }).success,
    ).toBe(false);
  });

  it('reads retained historical columns beyond 60 without relaxing write limits', () => {
    const previous = Object.fromEntries(
      Array.from({ length: 60 }, (_, index) => [`campo_${index}`, `Valor ${index}`]),
    );
    const historical = { ...previous, renamed: 'Valor vigente' };
    const read = groupApplicationSchema
      .pick({ additionalFields: true })
      .parse({ additionalFields: historical });
    expect(read.additionalFields).toEqual(historical);
    expect(Object.keys(read.additionalFields!)).toHaveLength(61);
    const expectedUpdatedAt = '2026-11-16T10:00:00.000Z';
    expect(
      updateGroupApplicationSchema.parse({
        expectedUpdatedAt,
        additionalFields: { renamed: 'Nuevo valor' },
      }),
    ).toMatchObject({ additionalFields: { renamed: 'Nuevo valor' } });
    expect(
      updateGroupApplicationSchema.safeParse({ expectedUpdatedAt, additionalFields: historical })
        .success,
    ).toBe(false);
    expect(
      createGroupApplicationSchema.safeParse({
        unifiedCode: 'D1672',
        vehicleType: 'AUTOMOTRIZ',
        make: 'Toyota',
        model: 'Hilux',
        additionalFields: historical,
      }).success,
    ).toBe(false);
    expect(
      groupApplicationSchema
        .pick({ additionalFields: true })
        .safeParse({ additionalFields: { invalid: 'x'.repeat(501) } }).success,
    ).toBe(false);
  });

  it('keeps updates partial while validating supplied fields', () => {
    const expectedUpdatedAt = '2026-10-07T10:00:00.000Z';
    expect(updateGroupApplicationSchema.parse({ expectedUpdatedAt, make: 'Toyota' })).toEqual({
      expectedUpdatedAt,
      make: 'Toyota',
    });
    expect(updateGroupApplicationSchema.parse({ expectedUpdatedAt, yearFrom: null })).toEqual({
      expectedUpdatedAt,
      yearFrom: null,
    });
    expect(updateGroupApplicationSchema.parse({ expectedUpdatedAt, bodyStyle: null })).toEqual({
      expectedUpdatedAt,
      bodyStyle: null,
    });
    expect(
      updateGroupApplicationSchema.safeParse({ expectedUpdatedAt, vehicleType: 'OTRO' }).success,
    ).toBe(false);
    expect(updateGroupApplicationSchema.safeParse({ expectedUpdatedAt }).success).toBe(false);
    expect(updateGroupApplicationSchema.safeParse({ make: 'Toyota' }).success).toBe(false);
    expect(deactivateGroupApplicationQuerySchema.parse({ expectedUpdatedAt })).toEqual({
      expectedUpdatedAt,
    });
    expect(deactivateGroupApplicationQuerySchema.safeParse({}).success).toBe(false);
  });
});
