import { describe, expect, it } from 'vitest';
import { planCategoryTreeImport } from './category-tree-import';
const row = {
  level1: 'RODAMIENTOS',
  level2: 'BOLAS',
  level3: 'BOLAS',
  code1: '',
  code2: '',
  code3: '',
};
describe('Local category tree import', () => {
  it('collapses the repeated final level and never invents ERP codes', () => {
    let next = 0;
    const plan = planCategoryTreeImport([row], [], [], new Set(), () => `id-${++next}`);
    expect(plan.added).toHaveLength(2);
    expect(plan.codes).toEqual([]);
    expect(plan.rows[0]).toMatchObject({
      row: 2,
      path: 'RODAMIENTOS > BOLAS',
      newCategories: 2,
      error: null,
    });
  });
  it('rejects missing levels row by row, and rolls back only rejected row additions', () => {
    let next = 0;
    const plan = planCategoryTreeImport(
      [{ ...row, level1: '' }, row],
      [],
      [],
      new Set(),
      () => `id-${++next}`,
    );
    expect(plan.rows.map((entry) => entry.error)).toEqual(['Faltan nivel 1 o nivel 2', null]);
    expect(plan.added).toHaveLength(2);
  });
  it('resolves normalized parent names to their persisted path and prevents children under a template', () => {
    const current = [
      {
        id: 'root',
        parentId: null,
        name: 'RODAMIENTOS',
        slug: 'root',
        path: 'RODAMIENTOS',
        active: true,
      },
    ];
    const plan = planCategoryTreeImport(
      [{ ...row, level1: 'rodamientos' }],
      current,
      [],
      new Set(),
      () => 'leaf',
    );
    expect(plan.added[0]?.path).toBe('RODAMIENTOS > BOLAS');
    expect(
      planCategoryTreeImport([row], current, [], new Set(['root']), () => 'leaf').rows[0]?.error,
    ).toContain('plantilla');
  });
  it('retains supplied codes by category path without assuming globally unique AX codes', () => {
    let next = 0;
    const plan = planCategoryTreeImport(
      [{ ...row, code1: '01', code2: '01' }],
      [],
      [],
      new Set(),
      () => `id-${++next}`,
    );
    expect(plan.codes).toEqual([
      { categoryId: 'id-1', code: '01' },
      { categoryId: 'id-2', code: '01' },
    ]);
  });
});
