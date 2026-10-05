import { describe, expect, it } from 'vitest';
import { assertUuid } from '@cdr/shared';

import { ExternalHomolog, HomologApprovalStatus } from './external-homolog';

const groupId = assertUuid('11111111-1111-4111-8111-111111111111');
const now = new Date('2026-10-05T10:00:00.000Z');

describe('ExternalHomolog eligibility', () => {
  it('requires both active and approved', () => {
    const homolog = ExternalHomolog.create(
      {
        groupId,
        unifiedCode: 'D1672',
        externalCode: 'OEM-42',
        externalBrand: 'OEM',
        approvalStatus: HomologApprovalStatus.Pending,
      },
      now,
    );
    expect(homolog.eligibleForSearch).toBe(false);
    homolog.update({ approvalStatus: HomologApprovalStatus.Approved }, now);
    expect(homolog.eligibleForSearch).toBe(true);
    homolog.update({ active: false }, now);
    expect(homolog.eligibleForSearch).toBe(false);
  });
});
