import type { CatalogGridSchemaDto, CatalogGridProductDto } from '@cdr/contracts';
import { describe, expect, it } from 'vitest';

import { buildCategoryImportWorkbook } from './category-import-workbook';
import { createWorkbookXlsxBytes } from './tabular-export';
import { parseFirstXlsxWorksheet, worksheetRowsToRecords } from './xlsx-import';

const id = '11111111-1111-4111-8111-111111111111';
const column: CatalogGridSchemaDto['columns'][number] = {
  id,
  key: 'material',
  label: 'Material',
  dataType: 'text',
  unit: null,
  allowedValues: [],
  sourceAuthority: 'pim',
  required: false,
  replicable: true,
  searchable: true,
  includeInTechnicalSheet: true,
  position: 1,
  permissions: { edit: true, import: true, export: true },
};
const schema: CatalogGridSchemaDto = {
  category: { id, slug: 'rodamientos', name: 'Rodamientos' },
  template: { id, variantKey: 'rod', name: 'Rodamientos', version: 1 },
  columns: [
    column,
    { ...column, key: 'privado', permissions: { edit: true, import: true, export: false } },
    { ...column, key: 'codigo_erp', sourceAuthority: 'erp' },
  ],
};
const product: CatalogGridProductDto = {
  id,
  sku: '000123',
  name: 'Rodamiento',
  brand: 'CDR',
  status: 'draft',
  attributes: {
    material: { value: 'Acero', version: 1, source: 'manual', updatedAt: '2026-11-10T15:00:00Z' },
    privado: {
      value: 'No exportar',
      version: 1,
      source: 'manual',
      updatedAt: '2026-11-10T15:00:00Z',
    },
  },
};

describe('category workbook round trip', () => {
  it('imports the data worksheet with stable keys, preserves SKU zeros and excludes protected values', async () => {
    const sheets = buildCategoryImportWorkbook(schema, [product]);
    const bytes = createWorkbookXlsxBytes(sheets);
    const buffer = new ArrayBuffer(bytes.length);
    new Uint8Array(buffer).set(bytes);
    const rows = await parseFirstXlsxWorksheet(buffer);
    expect(worksheetRowsToRecords(rows)).toEqual([
      { codigo_articulo: '000123', material: 'Acero' },
    ]);
    expect(new TextDecoder().decode(bytes)).not.toContain('No exportar');
    expect(sheets[1]?.rows.flat().join(' ')).toContain('Una celda vacía conserva el valor actual');
  });
  it('creates a partial-load example without fabricated SKUs or modifications', () => {
    const sheets = buildCategoryImportWorkbook(schema, [], true);
    expect(sheets[0]).toMatchObject({ headers: ['codigo_articulo', 'material'], rows: [] });
    expect(() => buildCategoryImportWorkbook({ ...schema, columns: [] }, [])).toThrow(
      'autorizados',
    );
  });
});
