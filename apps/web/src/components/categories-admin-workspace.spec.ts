import type { AdminCatalogCategoryDto, AdminTemplateDto } from '@cdr/contracts';
import { describe, expect, it } from 'vitest';

import {
  filterCategoryTreeRows,
  orderCategoryTree,
  templatesForCategory,
} from '@/components/categories-admin-workspace';

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

  it('keeps every template variant without turning it into another category level', () => {
    const categoryId = categories[2]!.id;
    const template = (
      id: string,
      variantKey: string,
      version: number,
      status: AdminTemplateDto['status'],
    ): AdminTemplateDto => ({
      id,
      categoryId,
      categoryName: 'Rígidos',
      variantKey,
      name: `Plantilla ${variantKey}`,
      version,
      status,
      createdAt: updatedAt,
      updatedAt,
    });
    const variants = templatesForCategory(
      [
        template('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22.1', 1, 'retired'),
        template('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '22.1', 2, 'active'),
        template('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '22.2', 1, 'active'),
        template('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', '22.3', 1, 'retired'),
        template('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', '22.3', 2, 'draft'),
        {
          ...template('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '99.1', 1, 'active'),
          categoryId: categories[1]!.id,
        },
      ],
      categoryId,
    );

    expect(variants.map(({ variantKey, version }) => [variantKey, version])).toEqual([
      ['22.1', 2],
      ['22.2', 1],
      ['22.3', 2],
    ]);
  });
});
