import type { ProductAttributeSheetDto } from '@cdr/contracts';
import { describe, expect, it } from 'vitest';

import {
  groupAttributesByTemplateSections,
  technicalAttributesFromSheet,
  unifiedCodeFromSheet,
} from './product-detail-data';

const sheet: ProductAttributeSheetDto = {
  schema: {
    category: {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'rodamientos',
      name: 'Rodamientos',
    },
    template: {
      id: '22222222-2222-4222-8222-222222222222',
      variantKey: '22.1',
      name: 'Plantilla de rodamientos',
      version: 3,
    },
    columns: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        key: 'descripcion_interna',
        label: 'Descripción interna',
        dataType: 'text',
        unit: null,
        allowedValues: [],
        required: false,
        replicable: false,
        searchable: true,
        includeInTechnicalSheet: false,
        sourceAuthority: 'pim',
        position: 2,
        permissions: { edit: false, import: false, export: false },
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        key: 'codigo_unificador',
        label: 'Código unificador',
        dataType: 'text',
        unit: null,
        allowedValues: [],
        required: true,
        replicable: true,
        searchable: true,
        includeInTechnicalSheet: true,
        sourceAuthority: 'erp',
        position: 1,
        permissions: { edit: false, import: false, export: true },
      },
    ],
  },
  product: {
    id: '55555555-5555-4555-8555-555555555555',
    sku: '6202',
    name: 'Rodamiento 6202',
    brand: 'FAG',
    status: 'published',
    attributes: {
      codigo_unificador: {
        value: '6202-2RS',
        version: 1,
        source: 'erp',
        updatedAt: '2026-10-05T10:00:00.000Z',
      },
      descripcion_interna: {
        value: 'Uso industrial',
        version: 2,
        source: 'manual',
        updatedAt: '2026-10-05T11:00:00.000Z',
      },
    },
  },
};

describe('product detail operational data', () => {
  it('keeps visible attributes even when excluded from the exported technical sheet', () => {
    const attributes = technicalAttributesFromSheet(sheet);
    expect(attributes.map((attribute) => attribute.key)).toEqual([
      'codigo_unificador',
      'descripcion_interna',
    ]);
    expect(attributes[1]).toMatchObject({
      includeInTechnicalSheet: false,
      canExport: false,
      source: 'manual',
      authority: 'pim',
    });
  });

  it('uses template ordering for every authorized attribute and retains unassigned attributes once', () => {
    const configured = {
      ...sheet,
      schema: {
        ...sheet.schema,
        sections: [
          { key: 'technical', label: 'Dimensiones', position: 2 },
          { key: 'identity', label: 'Identificación', position: 0 },
          { key: 'documents', label: 'Documentos', position: 1 },
          { key: 'unused', label: 'Usos', position: 3 },
        ],
        columns: sheet.schema.columns.map((column) => ({
          ...column,
          sectionKey: column.key === 'descripcion_interna' ? 'technical' : 'identity',
        })),
      },
    };
    const attributes = technicalAttributesFromSheet(configured);
    expect(attributes.map((attribute) => attribute.key)).toEqual([
      'codigo_unificador',
      'descripcion_interna',
    ]);
    const unassigned = { ...attributes[1]!, key: 'unassigned' };
    const groups = groupAttributesByTemplateSections(configured, [...attributes, unassigned]);
    expect(groups.map((group) => group.title)).toEqual([
      '1. Identificación',
      '2. Dimensiones',
      '3. Otros atributos',
    ]);
    expect(groups.flatMap((group) => group.attributes)).toEqual([...attributes, unassigned]);
  });

  it('resolves the unifier code from the role-filtered sheet', () => {
    expect(unifiedCodeFromSheet(sheet)).toBe('6202-2RS');
    expect(unifiedCodeFromSheet(null)).toBeUndefined();
  });
});
