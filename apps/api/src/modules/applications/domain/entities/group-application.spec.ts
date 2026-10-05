import { describe, expect, it } from 'vitest';
import { assertUuid } from '@cdr/shared';

import { GroupApplication } from './group-application';

const groupId = assertUuid('11111111-1111-4111-8111-111111111111');
const now = new Date('2026-10-05T10:00:00.000Z');

describe('GroupApplication', () => {
  it('is owned by the unifier group and normalizes its code', () => {
    const application = GroupApplication.create(
      { groupId, unifiedCode: ' d1672 ', make: ' Toyota ', model: 'Hilux' },
      now,
    );
    expect(application.toSnapshot()).toMatchObject({
      groupId,
      unifiedCode: 'D1672',
      make: 'Toyota',
      model: 'Hilux',
      active: true,
    });
  });

  it('rejects an inverted year range', () => {
    expect(() =>
      GroupApplication.create(
        { groupId, unifiedCode: 'D1672', make: 'Toyota', yearFrom: 2025, yearTo: 2020 },
        now,
      ),
    ).toThrow('yearFrom must be less than or equal to yearTo');
  });

  it('does not erase fields omitted by a partial update', () => {
    const application = GroupApplication.create(
      { groupId, unifiedCode: 'D1672', make: 'Toyota', model: 'Hilux' },
      now,
    );
    application.update({ notes: '4x4' }, new Date('2026-10-05T11:00:00.000Z'));
    expect(application.toSnapshot()).toMatchObject({
      make: 'Toyota',
      model: 'Hilux',
      notes: '4x4',
    });
  });
});
