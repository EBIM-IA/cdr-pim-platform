import type { AdminCatalogCategoryDto } from '@cdr/contracts';
import { describe, expect, it } from 'vitest';

import { filterCategoryTreeRows, orderCategoryTree } from '@/components/categories-admin-workspace';

const updatedAt = '2026-10-15T12:00:00.000Z';
const categories: AdminCatalogCategoryDto[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    parentId: null,
    slug: 'rodamientos',
    name: 'Rodamientos',
    path: 'rodamientos',
    application: null,
    sourcePriority: {},
    position: 1,
    active: true,
    updatedAt,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    parentId: '11111111-1111-4111-8111-111111111111',
    slug: 'bolas',
    name: 'Rodamientos de Bolas',
    path: 'rodamientos/bolas',
    application: 'AUTOMOTRIZ',
    sourcePriority: {},
    position: 1,
    active: true,
    updatedAt,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    parentId: '22222222-2222-4222-8222-222222222222',
    slug: 'rigidos',
    name: 'Rígidos',
    path: 'rodamientos/bolas/rigidos',
    application: 'AUTOMOTRIZ',
    sourcePriority: {},
    position: 1,
    active: true,
    updatedAt,
  },
];

describe('category tree projection', () => {
  it('orders the hierarchy and marks only its final category as a leaf', () => {
    const rows = orderCategoryTree(categories);

    expect(rows.map(({ category, depth, leaf }) => [category.name, depth, leaf])).toEqual([
      ['Rodamientos', 0, false],
      ['Rodamientos de Bolas', 1, false],
      ['Rígidos', 2, true],
    ]);
  });

  it('includes descendants for a parent search and ancestors for a leaf search', () => {
    const rows = orderCategoryTree(categories);

    expect(filterCategoryTreeRows(categories, rows, 'Rodamientos', false)).toHaveLength(3);
    expect(
      filterCategoryTreeRows(categories, rows, 'Rígidos', false).map(
        ({ category }) => category.name,
      ),
    ).toEqual(['Rodamientos', 'Rodamientos de Bolas', 'Rígidos']);
  });

  it('does not restore an inactive ancestor when inactive categories are hidden', () => {
    const withInactiveParent = [{ ...categories[0]!, active: false }, ...categories.slice(1)];
    const rows = orderCategoryTree(withInactiveParent);

    expect(
      filterCategoryTreeRows(withInactiveParent, rows, 'Rígidos', false).map(
        ({ category }) => category.name,
      ),
    ).toEqual(['Rodamientos de Bolas', 'Rígidos']);
  });
});
