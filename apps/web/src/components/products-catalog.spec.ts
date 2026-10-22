import { describe, expect, it } from 'vitest';

import {
  catalogFamily,
  catalogFilterCategories,
  matchesCompleteness,
  workbookCatalogProduct,
} from '@/components/products-catalog';
import type { CatalogCategorySummaryDto, CatalogWorkbookProductDto } from '@cdr/contracts';
import type { Product } from '@/lib/types';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    sku: '6205-2RS',
    name: 'Rodamiento rígido de bolas',
    brand: 'FAG',
    category: 'Rodamientos',
    application: 'Industrial',
    status: 'published',
    completeness: 85,
    attributes: [],
    ...overrides,
  };
}

describe('products catalog reference filters', () => {
  it('derives the visual family from real product text', () => {
    expect(catalogFamily(product())).toBe('Rodamientos');
    expect(catalogFamily(product({ name: 'Aceite sintético 0W-20' }))).toBe(
      'Lubricantes y fluidos',
    );
    expect(catalogFamily(product({ name: 'Producto sin taxonomía reconocida' }))).toBe('Otros');
  });

  it('applies the same completeness bands shown by the filter', () => {
    expect(matchesCompleteness(95, 'complete')).toBe(true);
    expect(matchesCompleteness(85, 'attention')).toBe(true);
    expect(matchesCompleteness(69, 'critical')).toBe(true);
    expect(matchesCompleteness(null, 'unavailable')).toBe(true);
    expect(matchesCompleteness(null, 'complete')).toBe(false);
    expect(matchesCompleteness(95, '')).toBe(true);
  });
});

describe('workbook catalog classification', () => {
  const row: CatalogWorkbookProductDto = {
    id: '11111111-1111-4111-8111-111111111111',
    sku: 'SIN-PLANTILLA',
    name: 'SKU sin clasificación',
    description: null,
    brand: null,
    category: null,
    template: null,
    status: 'draft',
    completeness: null,
    providerCode: null,
    unifiedCode: null,
    applicationTypes: [],
    updatedAt: '2026-10-22T10:00:00.000Z',
    attributes: {},
  };

  it('preserves unclassified SKU identity while leaving completeness unmeasured', () => {
    expect(workbookCatalogProduct(row, [])).toMatchObject({
      id: row.id,
      sku: row.sku,
      category: 'Pendiente de clasificación',
      classificationPending: true,
      completeness: null,
      attributes: [],
    });
  });

  it('keeps a known category visible when its template is unavailable', () => {
    expect(
      workbookCatalogProduct(
        {
          ...row,
          category: { id: '22222222-2222-4222-8222-222222222222', name: 'Categoría inactiva' },
        },
        [],
      ),
    ).toMatchObject({
      category: 'Categoría inactiva',
      classificationPending: true,
      completeness: null,
    });
  });

  it('merges persisted ancestor IDs with category variants without duplicate options', () => {
    const category: CatalogCategorySummaryDto = {
      id: '33333333-3333-4333-8333-333333333333',
      slug: 'bolas',
      name: 'De bolas',
      path: 'Industria > Rodamientos > De bolas',
      templateId: '44444444-4444-4444-8444-444444444444',
      templateName: 'De bolas',
      templateVariantKey: '14',
      templateVersion: 1,
      ancestors: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          slug: 'industria',
          name: 'Industria',
          path: 'Industria',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          slug: 'rodamientos',
          name: 'Rodamientos',
          path: 'Industria > Rodamientos',
        },
      ],
    };
    const options = catalogFilterCategories([
      category,
      { ...category, templateVariantKey: '14.2' },
    ]);
    expect(options.map((option) => option.value)).toEqual([
      category.ancestors![0]!.id,
      category.ancestors![1]!.id,
      category.id,
    ]);
    expect(options[0]).toMatchObject({ label: 'Industria', path: 'Industria' });
  });
});
