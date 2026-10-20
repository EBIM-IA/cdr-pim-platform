import { describe, expect, it } from 'vitest';

import {
  deactivateExternalHomologQuerySchema,
  createGroupOemCodeSchema,
  eligibleOemSearchQuerySchema,
  oemCodeListQuerySchema,
  updateGroupOemCodeSchema,
  updateExternalHomologSchema,
} from './equivalence';

describe('OEM equivalence contracts', () => {
  it('accepts a multi-brand OEM relation and supplies safe defaults', () => {
    expect(
      createGroupOemCodeSchema.parse({
        unifiedCode: ' d1672 ',
        oemCode: ' 04465-demo ',
        brands: ['TOYOTA', 'LEXUS'],
      }),
    ).toEqual({
      unifiedCode: 'd1672',
      oemCode: '04465-demo',
      brands: ['TOYOTA', 'LEXUS'],
      active: true,
      approvalStatus: 'pending',
    });
  });

  it('rejects empty or duplicate brand collections', () => {
    const base = { unifiedCode: 'D1672', oemCode: 'OEM-1' };
    expect(createGroupOemCodeSchema.safeParse({ ...base, brands: [] }).success).toBe(false);
    expect(
      createGroupOemCodeSchema.safeParse({ ...base, brands: ['Toyota', 'TOYOTA'] }).success,
    ).toBe(false);
  });

  it('requires at least one update field', () => {
    expect(updateGroupOemCodeSchema.safeParse({}).success).toBe(false);
    expect(
      updateGroupOemCodeSchema.parse({
        active: false,
        expectedUpdatedAt: '2026-10-07T10:00:00.000Z',
      }),
    ).toEqual({ active: false, expectedUpdatedAt: '2026-10-07T10:00:00.000Z' });
    expect(
      updateGroupOemCodeSchema.safeParse({
        expectedUpdatedAt: '2026-10-07T10:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('normalizes query transport values', () => {
    expect(oemCodeListQuerySchema.parse({ includeInactive: 'true' })).toMatchObject({
      includeInactive: true,
    });
    expect(eligibleOemSearchQuerySchema.parse({ q: '  Toyota  ' })).toEqual({ q: 'Toyota' });
  });
});

describe('external homolog mutation contracts', () => {
  const expectedUpdatedAt = '2026-10-07T10:00:00.000Z';

  it('requires an optimistic token and at least one mutable field', () => {
    expect(
      updateExternalHomologSchema.parse({ expectedUpdatedAt, approvalStatus: 'approved' }),
    ).toEqual({ expectedUpdatedAt, approvalStatus: 'approved' });
    expect(updateExternalHomologSchema.safeParse({ expectedUpdatedAt }).success).toBe(false);
    expect(updateExternalHomologSchema.safeParse({ approvalStatus: 'approved' }).success).toBe(
      false,
    );
  });

  it('requires the optimistic token to deactivate', () => {
    expect(deactivateExternalHomologQuerySchema.parse({ expectedUpdatedAt })).toEqual({
      expectedUpdatedAt,
    });
    expect(deactivateExternalHomologQuerySchema.safeParse({}).success).toBe(false);
  });
});
