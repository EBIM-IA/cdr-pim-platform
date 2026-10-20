import { describe, expect, it } from 'vitest';

import {
  createGroupApplicationSchema,
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
