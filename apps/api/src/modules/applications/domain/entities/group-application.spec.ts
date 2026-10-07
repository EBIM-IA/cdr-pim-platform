import { describe, expect, it } from 'vitest';
import { assertUuid } from '@cdr/shared';

import { GroupApplication } from './group-application';

const groupId = assertUuid('11111111-1111-4111-8111-111111111111');
const now = new Date('2026-10-05T10:00:00.000Z');

describe('GroupApplication', () => {
  it('is owned by the unifier group and normalizes its code', () => {
    const application = GroupApplication.create(
      {
        groupId,
        unifiedCode: ' d1672 ',
        vehicleType: ' automotriz ',
        make: ' Toyota ',
        model: 'Hilux',
      },
      now,
    );
    expect(application.toSnapshot()).toMatchObject({
      groupId,
      unifiedCode: 'D1672',
      vehicleType: 'AUTOMOTRIZ',
      make: 'Toyota',
      model: 'Hilux',
      active: true,
    });
  });

  it('rejects an inverted year range', () => {
    expect(() =>
      GroupApplication.create(
        {
          groupId,
          unifiedCode: 'D1672',
          vehicleType: 'AUTOMOTRIZ',
          make: 'Toyota',
          model: 'Hilux',
          yearFrom: 2025,
          yearTo: 2020,
        },
        now,
      ),
    ).toThrow('yearFrom must be less than or equal to yearTo');
  });

  it('does not erase fields omitted by a partial update', () => {
    const application = GroupApplication.create(
      {
        groupId,
        unifiedCode: 'D1672',
        vehicleType: 'AUTOMOTRIZ',
        make: 'Toyota',
        model: 'Hilux',
      },
      now,
    );
    application.update({ notes: '4x4' }, new Date('2026-10-05T11:00:00.000Z'));
    expect(application.toSnapshot()).toMatchObject({
      make: 'Toyota',
      model: 'Hilux',
      notes: '4x4',
    });
  });

  it('enforces the same text limits as the HTTP contract on create and update', () => {
    expect(() =>
      GroupApplication.create(
        {
          groupId,
          unifiedCode: 'D'.repeat(121),
          vehicleType: 'AUTOMOTRIZ',
          make: 'Toyota',
          model: 'Hilux',
        },
        now,
      ),
    ).toThrow('unifiedCode must contain at most 120 characters');
    expect(() =>
      GroupApplication.create(
        {
          groupId,
          unifiedCode: 'D1672',
          vehicleType: 'V'.repeat(121),
          make: 'Toyota',
          model: 'Hilux',
        },
        now,
      ),
    ).toThrow('vehicleType must contain at most 120 characters');
    expect(() =>
      GroupApplication.create(
        {
          groupId,
          unifiedCode: 'D1672',
          vehicleType: 'AUTOMOTRIZ',
          make: 'M'.repeat(161),
          model: 'Hilux',
        },
        now,
      ),
    ).toThrow('make must contain at most 160 characters');

    const application = GroupApplication.create(
      {
        groupId,
        unifiedCode: 'D1672',
        vehicleType: 'AUTOMOTRIZ',
        make: 'Toyota',
        model: 'Hilux',
      },
      now,
    );
    expect(() => application.update({ notes: 'N'.repeat(2_001) }, now)).toThrow(
      'notes must contain at most 2000 characters',
    );
  });

  it('requires the approved type, make and model fields', () => {
    expect(() =>
      GroupApplication.create(
        { groupId, unifiedCode: 'D1672', vehicleType: 'CAMIÓN', make: 'Toyota', model: 'Hilux' },
        now,
      ),
    ).toThrow('vehicleType must be AUTOMOTRIZ or INDUSTRIAL');
    expect(() =>
      GroupApplication.create(
        { groupId, unifiedCode: 'D1672', vehicleType: 'AUTOMOTRIZ', make: '', model: 'Hilux' },
        now,
      ),
    ).toThrow('make must not be blank');
    expect(() =>
      GroupApplication.create(
        { groupId, unifiedCode: 'D1672', vehicleType: 'AUTOMOTRIZ', make: 'Toyota', model: '' },
        now,
      ),
    ).toThrow('model must not be blank');
  });
});
