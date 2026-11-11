import type { ProductAttributeSheetDto } from '@cdr/contracts';
import { describe, expect, it } from 'vitest';
import { technicalSheetDocument } from './technical-sheet-export';
const column = {
  id: '11111111-1111-4111-8111-111111111111',
  key: 'codigo_unificador',
  label: 'Código unificador',
  dataType: 'text' as const,
  unit: null,
  allowedValues: [],
  required: false,
  replicable: false,
  searchable: true,
  includeInTechnicalSheet: true,
  sourceAuthority: 'pim' as const,
  position: 0,
  permissions: { edit: false, import: false, export: false },
};
const sheet: ProductAttributeSheetDto = {
  schema: {
    category: { id: '11111111-1111-4111-8111-111111111111', slug: 'rod', name: 'Rodamientos' },
    template: {
      id: '22222222-2222-4222-8222-222222222222',
      variantKey: '22.1',
      name: 'Rodamiento',
      version: 1,
    },
    columns: [
      column,
      {
        ...column,
        key: 'diametro',
        label: 'Diámetro',
        unit: 'mm',
        dataType: 'measurement',
        position: 1,
        permissions: { edit: false, import: false, export: true },
      },
      { ...column, key: 'vacío', permissions: { edit: false, import: false, export: true } },
    ],
  },
  product: {
    id: '33333333-3333-4333-8333-333333333333',
    sku: '6205',
    name: 'Rodamiento',
    brand: null,
    status: 'draft',
    attributes: {
      codigo_unificador: {
        value: 'NO EXPORTAR',
        version: 1,
        source: 'manual',
        updatedAt: '2026-11-01T00:00:00Z',
      },
      diametro: { value: 25, version: 1, source: 'manual', updatedAt: '2026-11-01T00:00:00Z' },
      vacío: { value: '', version: 1, source: 'manual', updatedAt: '2026-11-01T00:00:00Z' },
    },
  },
};
describe('Technical sheet export authorization', () => {
  it('omits non-exportable and empty values, including the unifier summary field', () => {
    const output = technicalSheetDocument(sheet, 'metric');
    expect(output.attributes).toEqual([{ key: 'diametro', label: 'Diámetro', value: '25 mm' }]);
    expect(output.unifiedCode).toBeUndefined();
    expect(JSON.stringify(output)).not.toContain('NO EXPORTAR');
  });
});
