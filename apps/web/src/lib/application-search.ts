import type { GroupApplicationDto } from '@cdr/contracts';

import { fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';
import { equivalenceMatches } from '@/lib/equivalence-view';

export function applicationMatches(query: string, application: GroupApplicationDto): boolean {
  return equivalenceMatches(query, [
    application.unifiedCode,
    application.vehicleType,
    application.make,
    application.model,
    application.bodyStyle,
    application.fuel,
    application.traction,
    application.displacement,
    application.yearFrom,
    application.yearTo,
    application.area,
    application.subarea,
    application.engine,
    application.notes,
  ]);
}

/** Resolves product/SKU searches through the same role-filtered query as the catalog. */
export async function findApplicationUnifiedCodes(
  query: string,
  availableCodes: readonly string[],
  signal: AbortSignal,
): Promise<Set<string>> {
  const available = new Set(availableCodes);
  const matched = new Set<string>();
  if (!available.size) return matched;
  const seen = new Set<string>();
  for (let page = 1; ; page += 1) {
    signal.throwIfAborted();
    const result = await fetchCatalogWorkbook(
      { page, pageSize: 100, q: query, filter: [] },
      signal,
    );
    signal.throwIfAborted();
    let added = 0;
    for (const product of result.items) {
      if (!seen.has(product.id)) {
        seen.add(product.id);
        added += 1;
      }
      if (product.unifiedCode && available.has(product.unifiedCode))
        matched.add(product.unifiedCode);
    }
    if (matched.size === available.size || seen.size >= result.total) return matched;
    if (!added) throw new Error('El catálogo cambió durante la búsqueda. Vuelve a buscar.');
  }
}
