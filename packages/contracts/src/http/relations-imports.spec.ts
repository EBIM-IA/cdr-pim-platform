import { describe, expect, it } from 'vitest';

import { applicationListQuerySchema, previewImportSchema } from './index';

describe('relation and import contracts', () => {
  it('preserves uploaded CSV/XLSX metadata separately from JSON record transport', () => {
    const input = {
      target: 'homologs',
      format: 'json',
      idempotencyKey: 'file-metadata-1',
      records: [{ codigo_unificador: 'D1672', codigo_homologo: 'EXT', marca: 'EXTERNA' }],
      originalFileName: 'Homólogos catálogo.csv',
      sourceFileFormat: 'csv',
    };
    expect(previewImportSchema.parse(input)).toMatchObject({
      format: 'json',
      originalFileName: 'Homólogos catálogo.csv',
      sourceFileFormat: 'csv',
    });
    expect(
      previewImportSchema.safeParse({
        ...input,
        originalFileName: 'Listado.xlsx',
        sourceFileFormat: 'xlsx',
      }).success,
    ).toBe(true);
    for (const originalFileName of [
      '../catalogo.csv',
      'C:\\catalogo.csv',
      'a\nb.csv',
      '.',
      '..',
      '',
      'a'.repeat(256),
    ]) {
      expect(previewImportSchema.safeParse({ ...input, originalFileName }).success).toBe(false);
    }
    expect(previewImportSchema.safeParse({ ...input, sourceFileFormat: 'json' }).success).toBe(
      false,
    );
  });

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

  it('accepts an explicit template variant only for category imports', () => {
    const templateId = '22222222-2222-4222-8222-222222222222';
    expect(
      previewImportSchema.safeParse({
        target: 'category',
        format: 'json',
        idempotencyKey: 'category-variant-1',
        categoryCode: 'filtros-de-aire',
        templateId,
        records: [{ sku: 'FILTRO-1' }],
      }).success,
    ).toBe(true);
    expect(
      previewImportSchema.safeParse({
        target: 'oem',
        format: 'json',
        idempotencyKey: 'oem-template-1',
        templateId,
        records: [{ codigo_unificador: 'D1672', codigo_oem: 'OEM-1' }],
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
