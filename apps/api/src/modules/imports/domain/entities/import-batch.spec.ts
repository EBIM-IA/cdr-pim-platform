import { describe, expect, it } from 'vitest';

import { ImportBatch } from './import-batch';

const now = new Date('2026-10-05T10:00:00.000Z');

describe('ImportBatch', () => {
  it('confirms a clean preview idempotently', () => {
    const batch = ImportBatch.preview(
      {
        target: 'homologs',
        format: 'json',
        idempotencyKey: 'batch-key-1',
        payloadHash: 'abc',
        categoryCode: null,
        createdBy: 'admin',
        rows: [{ rowNumber: 1, valid: true, data: { externalCode: 'OEM-1' }, errors: [] }],
      },
      now,
    );
    batch.confirm(now);
    batch.confirm(new Date('2026-10-05T11:00:00.000Z'));
    expect(batch.toSnapshot()).toMatchObject({ status: 'confirmed', confirmedAt: now });
  });

  it('refuses to confirm a preview with invalid rows', () => {
    const batch = ImportBatch.preview(
      {
        target: 'category',
        format: 'json',
        idempotencyKey: 'batch-key-2',
        payloadHash: 'abc',
        categoryCode: 'bearings',
        createdBy: 'admin',
        rows: [{ rowNumber: 1, valid: false, data: {}, errors: ['sku is required'] }],
      },
      now,
    );
    expect(() => batch.confirm(now)).toThrow('invalid rows');
  });
});
