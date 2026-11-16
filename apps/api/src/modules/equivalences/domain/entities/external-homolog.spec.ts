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

  it('normalizes optional reference metadata and retains it across partial edits', () => {
    const homolog = ExternalHomolog.create(
      {
        groupId,
        unifiedCode: 'D1672',
        externalCode: 'EXT-42',
        externalBrand: 'EXTERNAL',
        name: ' Referencia ',
        referenceType: 'Marca alterna',
        referenceSource: 'Fabricante',
        note: ' Documento ',
      },
      now,
    );
    homolog.update({ externalCode: 'EXT-43', note: null }, now);
    expect(homolog.toSnapshot()).toMatchObject({
      name: 'Referencia',
      referenceSource: 'Fabricante',
      note: null,
      source: 'manual',
    });
    expect(() => homolog.update({ name: 'x'.repeat(501) }, now)).toThrow(
      'name must contain at most 500 characters',
    );
  });

  it('enforces the same code and brand limits as the HTTP contract', () => {
    expect(() =>
      ExternalHomolog.create(
        {
          groupId,
          unifiedCode: 'D'.repeat(121),
          externalCode: 'OEM-42',
          externalBrand: 'OEM',
        },
        now,
      ),
    ).toThrow('unifiedCode must contain at most 120 characters');

    const homolog = ExternalHomolog.create(
      {
        groupId,
        unifiedCode: 'D1672',
        externalCode: 'OEM-42',
        externalBrand: 'OEM',
      },
      now,
    );
    expect(() => homolog.update({ externalCode: 'C'.repeat(161) }, now)).toThrow(
      'externalCode must contain at most 160 characters',
    );
    expect(() => homolog.update({ externalBrand: 'B'.repeat(161) }, now)).toThrow(
      'externalBrand must contain at most 160 characters',
    );
  });
});
