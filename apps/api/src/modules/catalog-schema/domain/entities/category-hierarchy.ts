import { ValidationError } from '@cdr/shared';

export interface CategoryNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly slug: string;
}

/** Validate the approved three-level tree before computing all affected descendant paths. */
export function categoryHierarchyPaths(
  nodes: readonly CategoryNode[],
): ReadonlyMap<string, string> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const paths = new Map<string, string>();
  const siblingNames = new Set<string>();
  for (const node of nodes) {
    const key = `${node.parentId ?? ''}:${node.name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .toLocaleLowerCase('es')}`;
    if (siblingNames.has(key))
      throw new ValidationError('Ya existe una categoría con ese nombre en el mismo nivel');
    siblingNames.add(key);
  }
  for (const node of nodes) {
    const visited = new Set<string>();
    const names: string[] = [];
    let current: CategoryNode | undefined = node;
    while (current) {
      if (visited.has(current.id))
        throw new ValidationError('La categoría no puede ser su propio descendiente');
      visited.add(current.id);
      names.unshift(current.name);
      if (names.length > 3) throw new ValidationError('El árbol admite como máximo tres niveles');
      if (current.parentId && !byId.has(current.parentId))
        throw new ValidationError('La categoría padre no existe');
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    const path = names.join(' > ');
    if ([...paths.values()].includes(path))
      throw new ValidationError('Ya existe una categoría con esa ruta');
    paths.set(node.id, path);
  }
  return paths;
}
