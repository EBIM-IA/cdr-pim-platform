import { describe, expect, it } from 'vitest';
import { categoryHierarchyPaths } from './category-hierarchy';
const root = { id: 'root', parentId: null, name: 'Raíz', slug: 'raiz' };
const child = { id: 'child', parentId: 'root', name: 'Hija', slug: 'hija' };
const leaf = { id: 'leaf', parentId: 'child', name: 'Final', slug: 'final' };
describe('category hierarchy', () => {
  it('computes paths for branches ending at level two and three', () => {
    expect([...categoryHierarchyPaths([root, child, leaf]).entries()]).toEqual([
      ['root', 'Raíz'],
      ['child', 'Raíz > Hija'],
      ['leaf', 'Raíz > Hija > Final'],
    ]);
  });
  it('rejects cycles including self-parenting', () => {
    expect(() => categoryHierarchyPaths([{ ...root, parentId: 'child' }, child])).toThrow(
      /descendiente/,
    );
    expect(() => categoryHierarchyPaths([{ ...root, parentId: 'root' }])).toThrow(/descendiente/);
  });
  it('rejects moves that make a descendant exceed the approved depth', () => {
    expect(() =>
      categoryHierarchyPaths([
        root,
        child,
        leaf,
        { id: 'fourth', parentId: 'leaf', name: 'Cuarta', slug: 'cuarta' },
      ]),
    ).toThrow(/tres niveles/);
  });
  it('rejects duplicate sibling names independent of accents and case', () => {
    expect(() =>
      categoryHierarchyPaths([root, { ...root, id: 'other', slug: 'other', name: 'RAIZ' }]),
    ).toThrow(/mismo nivel/);
  });
  it('rejects a missing parent', () => {
    expect(() => categoryHierarchyPaths([child])).toThrow(/padre no existe/);
  });
});
