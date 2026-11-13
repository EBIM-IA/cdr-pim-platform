import type { CatalogWorkbookProductDto } from '@cdr/contracts';
import { fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';

export async function fetchUnifiedMembers(
  code: string,
  signal?: AbortSignal,
): Promise<CatalogWorkbookProductDto[]> {
  const members: CatalogWorkbookProductDto[] = [];
  const ids = new Set<string>();
  let total = 1;
  for (let page = 1; members.length < total; page++) {
    const result = await fetchCatalogWorkbook(
      {
        page,
        pageSize: 100,
        filter: [],
        columnFilter: [JSON.stringify({ key: 'base:unifier', values: [`value:${code}`] })],
        sort: JSON.stringify({ key: 'base:sku', direction: 'asc' }),
      },
      signal,
    );
    total = result.total;
    let added = 0;
    for (const row of result.items)
      if (!ids.has(row.id)) {
        members.push(row);
        ids.add(row.id);
        added++;
      }
    if (!added && members.length < total)
      throw new Error('Las equivalencias cambiaron durante la consulta. Recarga la ficha.');
  }
  return members;
}
