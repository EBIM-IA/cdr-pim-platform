import type { CategoryTreeImportRow } from '@cdr/contracts';

export interface ImportCategoryNode {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  slug: string;
  active: boolean;
  position?: number;
}
export const normalizeCategoryName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('es');
/** A local file describes taxonomy paths; it cannot create products or configure AX. */
export function planCategoryTreeImport(
  rows: readonly CategoryTreeImportRow[],
  current: readonly ImportCategoryNode[],
  codes: readonly { categoryId: string; code: string }[],
  templates: ReadonlySet<string>,
  createId: () => string,
) {
  let nodes = [...current];
  const codeById = new Map(codes.map((entry) => [entry.categoryId, entry.code]));
  const assignedInFile = new Map<string, string>();
  const added: ImportCategoryNode[] = [];
  const results = rows.map((row, index) => {
    const names = [
      row.level1,
      row.level2,
      ...(row.level3 && normalizeCategoryName(row.level3) !== normalizeCategoryName(row.level2)
        ? [row.level3]
        : []),
    ];
    const suppliedCodes = [row.code1, row.code2, row.code3];
    const staged = [...nodes];
    const stagedCodes = new Map(codeById);
    const fileCodes = new Map(assignedInFile);
    const created: ImportCategoryNode[] = [];
    let parentId: string | null = null;
    let error: string | null = null;
    if (!row.level1 || !row.level2) error = 'Faltan nivel 1 o nivel 2';
    for (let level = 0; !error && level < names.length; level++) {
      if (parentId && templates.has(parentId)) {
        error = 'Una categoría con plantilla no puede recibir subcategorías';
        break;
      }
      const name = names[level]!;
      let node = staged.find(
        (candidate) =>
          candidate.parentId === parentId &&
          normalizeCategoryName(candidate.name) === normalizeCategoryName(name),
      );
      if (node && !node.active) {
        error = 'La ruta contiene una categoría inactiva';
        break;
      }
      if (!node) {
        const id = createId();
        node = {
          id,
          parentId,
          name,
          position:
            Math.max(
              -1,
              ...staged
                .filter((candidate) => candidate.parentId === parentId)
                .map((candidate) => candidate.position ?? 0),
            ) + 1,
          slug: `pim-${id}`,
          path: parentId
            ? `${staged.find((parent) => parent.id === parentId)!.path} > ${name}`
            : name,
          active: true,
        };
        staged.push(node);
        created.push(node);
      }
      const code = suppliedCodes[level] || (level === 1 && names.length === 2 ? row.code3 : '');
      if (code) {
        if (fileCodes.has(node.id) && fileCodes.get(node.id) !== code) {
          error = 'La misma categoría tiene códigos ERP distintos en el archivo';
          break;
        }
        stagedCodes.set(node.id, code);
        fileCodes.set(node.id, code);
      }
      parentId = node.id;
    }
    if (!error) {
      nodes = staged;
      added.push(...created);
      codeById.clear();
      for (const [id, code] of stagedCodes) codeById.set(id, code);
      assignedInFile.clear();
      for (const [id, code] of fileCodes) assignedInFile.set(id, code);
    }
    return {
      ...row,
      row: index + 2,
      path: names.join(' > '),
      newCategories: error ? 0 : created.length,
      error,
    };
  });
  return {
    rows: results,
    added,
    codes: [...assignedInFile].map(([categoryId, code]) => ({ categoryId, code })),
  };
}
