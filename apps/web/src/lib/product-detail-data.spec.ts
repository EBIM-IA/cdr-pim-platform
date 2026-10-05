import type { ProductAttributeSheetDto } from '@cdr/contracts';
import { describe, expect, it } from 'vitest';

import { technicalAttributesFromSheet, unifiedCodeFromSheet } from './product-detail-data';

const sheet: ProductAttributeSheetDto = {
  schema: {
    category: {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'rodamientos',
      name: 'Rodamientos',
    },
    template: {
      id: '22222222-2222-4222-8222-222222222222',
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
      source: 'manual',
      authority: 'pim',
    });
  });

  it('resolves the unifier code from the role-filtered sheet', () => {
    expect(unifiedCodeFromSheet(sheet)).toBe('6202-2RS');
    expect(unifiedCodeFromSheet(null)).toBeUndefined();
  });
});
