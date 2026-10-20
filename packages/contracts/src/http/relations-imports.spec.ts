import { describe, expect, it } from 'vitest';

import { applicationListQuerySchema, previewImportSchema } from './index';

describe('relation and import contracts', () => {
  it('parses false query parameters without JavaScript truthiness surprises', () => {
    expect(applicationListQuerySchema.parse({ includeInactive: 'false' }).includeInactive).toBe(
      false,
    );
  });

  it('requires category scope for category imports', () => {
    expect(
      previewImportSchema.safeParse({
        target: 'category',
        format: 'json',
        idempotencyKey: 'batch-0001',
        records: [{ sku: 'D1672', material: 'ceramic' }],
      }).success,
    ).toBe(false);
  });

  it('accepts only the formal lowercase category slug', () => {
    expect(
      previewImportSchema.safeParse({
        target: 'category',
        format: 'csv',
        idempotencyKey: 'category-slug-1',
        categoryCode: 'pastillas-de-freno',
        csv: 'sku,descripcion_tecnica\nD1672,Ficha',
      }).success,
    ).toBe(true);
    expect(
      previewImportSchema.safeParse({
        target: 'category',
        format: 'csv',
        idempotencyKey: 'category-slug-2',
        categoryCode: 'Pastillas de freno',
        csv: 'sku,descripcion_tecnica\nD1672,Ficha',
      }).success,
    ).toBe(false);
  });

  it('accepts OEM JSON imports with the approved Spanish aliases and brand arrays', () => {
    expect(
      previewImportSchema.parse({
        target: 'oem',
        format: 'json',
        idempotencyKey: 'oem-batch-0001',
        records: [
          { codigo_unificador: 'D1672', codigo_oem: '04465-0K240', marcas: ['TOYOTA', 'LEXUS'] },
        ],
      }),
    ).toMatchObject({ target: 'oem', records: [{ marcas: ['TOYOTA', 'LEXUS'] }] });
  });
});
