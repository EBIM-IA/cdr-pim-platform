import { ValidationError, assertUuid } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { GroupOemCode, OemApprovalStatus } from './group-oem-code';

const groupId = assertUuid('11111111-1111-4111-8111-111111111111');
const now = new Date('2026-10-07T10:00:00.000Z');

describe('GroupOemCode', () => {
  it('normalizes codes and multiple brands', () => {
    const oem = GroupOemCode.create(
      {
        groupId,
        unifiedCode: ' d1672 ',
        oemCode: ' oem  42 ',
        brands: [' Toyota ', 'LEXUS', 'toyota'],
      },
      now,
    );

    expect(oem.toSnapshot()).toMatchObject({
      unifiedCode: 'D1672',
      oemCode: 'OEM 42',
      brands: ['TOYOTA', 'LEXUS'],
    });
  });

  it('is searchable only while active and approved', () => {
    const oem = GroupOemCode.create(
      { groupId, unifiedCode: 'D1672', oemCode: 'OEM-42', brands: ['TOYOTA'] },
      now,
    );
    expect(oem.eligibleForSearch).toBe(false);
    oem.update({ approvalStatus: OemApprovalStatus.Approved }, now);
    expect(oem.eligibleForSearch).toBe(true);
    oem.deactivate(now);
    expect(oem.eligibleForSearch).toBe(false);
  });

  it('rejects an OEM relation without brands', () => {
    expect(() =>
      GroupOemCode.create({ groupId, unifiedCode: 'D1672', oemCode: 'OEM-42', brands: [] }, now),
    ).toThrow(ValidationError);
  });

  it('enforces the same code, brand and collection limits as the HTTP contract', () => {
    expect(() =>
      GroupOemCode.create(
        { groupId, unifiedCode: 'D'.repeat(121), oemCode: 'OEM-42', brands: ['TOYOTA'] },
        now,
      ),
    ).toThrow('unifiedCode must contain at most 120 characters');
    expect(() =>
      GroupOemCode.create(
        { groupId, unifiedCode: 'D1672', oemCode: 'O'.repeat(161), brands: ['TOYOTA'] },
        now,
      ),
    ).toThrow('oemCode must contain at most 160 characters');
    expect(() =>
      GroupOemCode.create(
        { groupId, unifiedCode: 'D1672', oemCode: 'OEM-42', brands: ['B'.repeat(161)] },
        now,
      ),
    ).toThrow('Each OEM brand must contain at most 160 characters');
    expect(() =>
      GroupOemCode.create(
        {
          groupId,
          unifiedCode: 'D1672',
          oemCode: 'OEM-42',
          brands: Array.from({ length: 21 }, (_, index) => `BRAND-${index}`),
        },
        now,
      ),
    ).toThrow('brands must contain at most 20 brands');
  });
});
