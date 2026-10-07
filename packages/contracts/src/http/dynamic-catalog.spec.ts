import { describe, expect, it } from 'vitest';

import {
  catalogGridQuerySchema,
  catalogWorkbookQuerySchema,
  catalogWorkbookResultSchema,
  updateProductAttributeSchema,
  updateProductAttributesBatchSchema,
  updateTemplateAttributeSchema,
  adminCategoryListQuerySchema,
} from './dynamic-catalog';

describe('dynamic catalog contracts', () => {
  it('normalises one or many attribute filters', () => {
    const categoryId = '11111111-1111-4111-8111-111111111111';
    expect(catalogGridQuerySchema.parse({ categoryId, filter: 'diametro:gte:25' })).toMatchObject({
      categoryId,
      filter: ['diametro:gte:25'],
      page: 1,
      pageSize: 25,
    });
    expect(
      catalogGridQuerySchema.parse({
        categoryId,
        filter: ['diametro:gte:25', 'marca:eq:FAG'],
      }).filter,
    ).toEqual(['diametro:gte:25', 'marca:eq:FAG']);
  });

  it('supports a paginated workbook across every template or one category', () => {
    const categoryId = '11111111-1111-4111-8111-111111111111';
    expect(catalogWorkbookQuerySchema.parse({ q: '2RS' })).toEqual({
      q: '2RS',
      filter: [],
      page: 1,
      pageSize: 25,
    });
    expect(
      catalogWorkbookQuerySchema.parse({ categoryId, filter: 'diametro:gte:25' }),
    ).toMatchObject({ categoryId, filter: ['diametro:gte:25'] });
  });

  it('distinguishes an empty applicable cell from a non-applicable cell', () => {
    const base = {
      id: '11111111-1111-4111-8111-111111111111',
      sku: '6202-2RS',
      name: 'Rodamiento',
      description: null,
      brand: 'FAG',
      status: 'in_review',
      updatedAt: '2026-10-05T10:00:00.000Z',
      category: { id: '22222222-2222-4222-8222-222222222222', name: 'Rodamientos' },
      template: {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Rodamientos',
        version: 1,
      },
      providerCode: null,
      unifiedCode: null,
      applicationTypes: [],
      completeness: 100,
    };
    const parsed = catalogWorkbookResultSchema.parse({
      columns: [],
      facets: { brands: [], applicationTypes: [], statuses: [] },
      items: [
        {
          ...base,
          attributes: {
            descripcion: {
              applicable: true,
              value: null,
              version: 0,
              source: 'manual',
              updatedAt: base.updatedAt,
              required: false,
              permissions: { edit: true, export: true },
            },
            diametro: { applicable: false },
          },
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
    });
    expect(parsed.items[0]?.attributes.diametro).toEqual({ applicable: false });
    expect(parsed.items[0]?.attributes.descripcion).toMatchObject({
      applicable: true,
      value: null,
      version: 0,
    });
  });

  it('requires a non-negative concurrency version and a scalar typed value', () => {
    expect(updateProductAttributeSchema.parse({ value: 25, expectedVersion: 0 })).toEqual({
      value: 25,
      expectedVersion: 0,
    });
    expect(updateProductAttributeSchema.parse({ value: null, expectedVersion: 1 })).toEqual({
      value: null,
      expectedVersion: 1,
    });
    expect(
      updateProductAttributeSchema.parse({ value: 25, expectedVersion: 0, source: 'erp' }),
    ).toEqual({ value: 25, expectedVersion: 0 });
    expect(() => updateProductAttributeSchema.parse({ value: {}, expectedVersion: 0 })).toThrow();
    expect(() => updateProductAttributeSchema.parse({ value: 'x', expectedVersion: -1 })).toThrow();
  });

  it('accepts a bounded atomic attribute batch and rejects duplicate fields', () => {
    expect(
      updateProductAttributesBatchSchema.parse({
        updates: [
          { attributeKey: 'material', value: 'Acero', expectedVersion: 1 },
          { attributeKey: 'diametro', value: null, expectedVersion: 2 },
        ],
      }).updates,
    ).toHaveLength(2);
    expect(() =>
      updateProductAttributesBatchSchema.parse({
        updates: [
          { attributeKey: 'material', value: 'Acero', expectedVersion: 1 },
          { attributeKey: 'material', value: 'Bronce', expectedVersion: 1 },
        ],
      }),
    ).toThrow();
  });

  it('validates role access and technical-sheet configuration', () => {
    const expectedUpdatedAt = '2026-10-05T10:00:00.000Z';
    expect(
      updateTemplateAttributeSchema.parse({
        active: false,
        includeInTechnicalSheet: true,
        expectedUpdatedAt,
      }),
    ).toMatchObject({ active: false, includeInTechnicalSheet: true });
    expect(() =>
      updateTemplateAttributeSchema.parse({
        roleAccess: [
          {
            role: 'VENTAS',
            canView: false,
            canEdit: true,
            canImport: false,
            canExport: false,
          },
        ],
        expectedUpdatedAt,
      }),
    ).toThrow();
  });

  it('parses the includeInactive query without treating "false" as true', () => {
    expect(adminCategoryListQuerySchema.parse({})).toEqual({ includeInactive: false });
    expect(adminCategoryListQuerySchema.parse({ includeInactive: 'false' })).toEqual({
      includeInactive: false,
    });
    expect(adminCategoryListQuerySchema.parse({ includeInactive: 'true' })).toEqual({
      includeInactive: true,
    });
  });
});
