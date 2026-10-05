import { describe, expect, it } from 'vitest';

import { parseImportPayload } from './parse-import-payload';

describe('parseImportPayload', () => {
  it('parses quoted CSV and validates homolog eligibility fields', () => {
    const rows = parseImportPayload({
      target: 'homologs',
      format: 'csv',
      idempotencyKey: 'meeting-0001',
      csv: 'unifiedCode,externalCode,externalBrand,active,approvalStatus\nD1672,"OEM,42",BOSCH,true,approved',
    });
    expect(rows).toEqual([
      expect.objectContaining({
        valid: true,
        data: expect.objectContaining({ externalCode: 'OEM,42' }),
      }),
    ]);
  });

  it('reports invalid application rows without discarding their data', () => {
    const rows = parseImportPayload({
      target: 'applications',
      format: 'json',
      idempotencyKey: 'meeting-0002',
      records: [{ unifiedCode: 'D1672', yearFrom: 2025, yearTo: 2020 }],
    });
    expect(rows[0]).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'At least one application description field is required',
        'yearFrom must not exceed yearTo',
      ]),
    });
  });

  it('rejects prototype-polluting CSV headers', () => {
    expect(() =>
      parseImportPayload({
        target: 'category',
        categoryCode: 'bearings',
        format: 'csv',
        idempotencyKey: 'meeting-0003',
        csv: 'sku,__proto__\n6202,value',
      }),
    ).toThrow('forbidden header');
  });
});
