import type { CatalogWorkbookProduct } from './catalog-schema';

/** Each unassigned SKU is its own group; only filtered members are included. */
export function groupCatalogWorkbookProducts(
  items: readonly CatalogWorkbookProduct[],
): CatalogWorkbookProduct[] {
  const groups = new Map<string, CatalogWorkbookProduct[]>();
  for (const item of items) {
    const key = item.unifiedCode?.trim() || `sku:${item.id}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()].map((members) => ({
    ...members[0]!,
    name: [...new Set(members.map((member) => member.name))].join(' · '),
    brand:
      [...new Set(members.flatMap((member) => (member.brand ? [member.brand] : [])))].join(' · ') ||
      null,
    applicationTypes: [
      ...new Set(members.flatMap((member) => [...member.applicationTypes])),
    ].sort(),
    groupMembers: members.map(({ id, sku, name, brand }) => ({ id, sku, name, brand })),
  }));
}
