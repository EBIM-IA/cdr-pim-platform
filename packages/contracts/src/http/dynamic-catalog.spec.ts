import { describe, expect, it } from 'vitest';

import {
  catalogGridQuerySchema,
  updateProductAttributeSchema,
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

  it('requires a non-negative concurrency version and a scalar typed value', () => {
    expect(updateProductAttributeSchema.parse({ value: 25, expectedVersion: 0 })).toEqual({
      value: 25,
      expectedVersion: 0,
    });
    expect(
      updateProductAttributeSchema.parse({ value: 25, expectedVersion: 0, source: 'erp' }),
    ).toEqual({ value: 25, expectedVersion: 0 });
    expect(() => updateProductAttributeSchema.parse({ value: {}, expectedVersion: 0 })).toThrow();
    expect(() => updateProductAttributeSchema.parse({ value: 'x', expectedVersion: -1 })).toThrow();
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
