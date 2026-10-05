import type { CatalogGridColumnDto } from '@cdr/contracts';
import { describe, expect, it } from 'vitest';

import { catalogFilterOperator, serializeCatalogFilters } from '@/components/dynamic-catalog-sheet';

function column(key: string, dataType: CatalogGridColumnDto['dataType']): CatalogGridColumnDto {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    key,
    label: key,
    dataType,
    unit: null,
    allowedValues: [],
    required: false,
    replicable: false,
    searchable: true,
    includeInTechnicalSheet: false,
    sourceAuthority: 'pim',
    position: 0,
    permissions: { edit: true, import: true, export: true },
  };
}

describe('dynamic catalog filters', () => {
  it('uses contains for text and exact matching for typed attributes', () => {
    expect(catalogFilterOperator(column('material', 'text'))).toBe('contains');
    expect(catalogFilterOperator(column('diametro', 'measurement'))).toBe('eq');
    expect(catalogFilterOperator(column('bloqueado', 'boolean'))).toBe('eq');
  });

  it('serializes every non-empty header filter in the backend wire format', () => {
    const columns = [column('material', 'text'), column('diametro', 'number')];

    expect(
      serializeCatalogFilters(columns, {
        material: ' acero ',
        diametro: '20',
        ignored: 'value',
      }),
    ).toEqual(['material:contains:acero', 'diametro:eq:20']);
    expect(serializeCatalogFilters(columns, { material: '  ' })).toEqual([]);
  });
});
