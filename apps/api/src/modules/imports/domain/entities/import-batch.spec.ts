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
        rows: [
          { rowNumber: 1, valid: true, data: { externalCode: 'OEM-1' }, errors: [], warnings: [] },
        ],
      },
      now,
    );
    batch.confirm(now);
    batch.confirm(new Date('2026-10-05T11:00:00.000Z'));
    expect(batch.toSnapshot()).toMatchObject({ status: 'confirmed', confirmedAt: now });
  });

  it('refuses to confirm a preview without any applicable row', () => {
    const batch = ImportBatch.preview(
      {
        target: 'category',
        format: 'json',
        idempotencyKey: 'batch-key-2',
        payloadHash: 'abc',
        categoryCode: 'bearings',
        createdBy: 'admin',
        rows: [
          {
            rowNumber: 1,
            valid: false,
            data: {},
            errors: ['sku is required'],
            warnings: [],
          },
        ],
      },
      now,
    );
    expect(() => batch.confirm(now)).toThrow('without valid rows');
  });

  it('confirms the valid subset when the preview also contains rejected rows', () => {
    const batch = ImportBatch.preview(
      {
        target: 'homologs',
        format: 'json',
        idempotencyKey: 'batch-key-3',
        payloadHash: 'def',
        categoryCode: null,
        createdBy: 'admin',
        rows: [
          {
            rowNumber: 1,
            valid: true,
            data: { externalCode: 'OK-1' },
            errors: [],
            warnings: [],
          },
          {
            rowNumber: 2,
            valid: false,
            data: {},
            errors: ['externalCode is required'],
            warnings: [],
          },
        ],
      },
      now,
    );

    batch.confirm(now);

    expect(batch.toSnapshot()).toMatchObject({ status: 'confirmed', confirmedAt: now });
  });

  it('models an exclusive processing state and does not retry a failed claim', () => {
    const batch = ImportBatch.preview(
      {
        target: 'category',
        format: 'json',
        idempotencyKey: 'batch-claim-1',
        payloadHash: 'claim',
        categoryCode: 'pastillas-de-freno',
        createdBy: 'buyer-1',
        rows: [{ rowNumber: 1, valid: true, data: { sku: 'D1672' }, errors: [], warnings: [] }],
      },
      now,
    );
    batch.startConfirmation();
    expect(batch.toSnapshot().status).toBe('processing');
    expect(() => batch.startConfirmation()).toThrow('not available');
    batch.failConfirmation();
    expect(batch.toSnapshot().status).toBe('failed');
    expect(() => batch.confirm(now)).toThrow('failed import batch');
  });
});
