import type {
  CatalogCategorySummaryDto,
  CatalogWorkbookColumnDto,
  CatalogWorkbookProductDto,
  CatalogWorkbookResultDto,
  ExternalHomologDto,
  GroupOemCodeDto,
} from '@cdr/contracts';

import { fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';

export interface EquivalenceCatalog {
  items: CatalogWorkbookProductDto[];
  columns: CatalogWorkbookColumnDto[];
}
export async function fetchEquivalenceCatalog(signal?: AbortSignal): Promise<EquivalenceCatalog> {
  const first = await fetchCatalogWorkbook({ page: 1, pageSize: 100, filter: [] }, signal);
  const items = [...first.items],
    ids = new Set(items.map((item) => item.id));
  let page = 2;
  const columns = new Map(first.columns.map((column) => [column.key, column]));
  while (items.length < first.total) {
    const next: CatalogWorkbookResultDto = await fetchCatalogWorkbook(
      { page: page++, pageSize: 100, filter: [] },
      signal,
    );
    let added = 0;
    for (const item of next.items) {
      if (!ids.has(item.id)) {
        ids.add(item.id);
        items.push(item);
        added += 1;
      }
    }
    next.columns.forEach((column) => columns.set(column.key, column));
    if (!added)
      throw new Error(
        'El catálogo cambió durante la consulta. Actualiza para cargar todas las asignaciones.',
      );
  }
  return { items, columns: [...columns.values()] };
}
export const normalizedEquivalenceText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es');
export function equivalenceMatches(query: string, values: readonly unknown[]): boolean {
  const haystack = normalizedEquivalenceText(values.map((value) => String(value ?? '')).join(' '));
  return normalizedEquivalenceText(query)
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}
export function categoryLevels(
  product: CatalogWorkbookProductDto,
  categories: readonly CatalogCategorySummaryDto[],
): string[] {
  const selected =
    categories.find(
      (category) =>
        category.id === product.category?.id && category.templateId === product.template?.id,
    ) ?? categories.find((category) => category.id === product.category?.id);
  if (selected?.ancestors?.length) {
    const names = selected.ancestors.map((category) => category.name);
    if (selected.ancestors.at(-1)?.id !== selected.id) names.push(selected.name);
    return names.slice(0, 3);
  }
  if (selected?.path)
    return selected.path
      .split(/\s*[/>›]\s*/u)
      .filter(Boolean)
      .slice(0, 3);
  return ['', '', product.category?.name ?? ''];
}
export interface EquivalenceRelation {
  id: string;
  unifiedCode: string;
  code: string;
  brand: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  active: boolean;
  source: 'manual' | 'import';
  updatedAt: string;
}
export function homologRelation(row: ExternalHomologDto): EquivalenceRelation {
  return {
    id: row.id,
    unifiedCode: row.unifiedCode,
    code: row.externalCode,
    brand: row.externalBrand,
    approvalStatus: row.approvalStatus,
    active: row.active,
    source: row.source,
    updatedAt: row.updatedAt,
  };
}
export function oemRelation(row: GroupOemCodeDto): EquivalenceRelation {
  return {
    id: row.id,
    unifiedCode: row.unifiedCode,
    code: row.oemCode,
    brand: row.brands.join(', '),
    approvalStatus: row.approvalStatus,
    active: row.active,
    source: row.source,
    updatedAt: row.updatedAt,
  };
}
export function relationGroupMembers(
  code: string,
  products: readonly CatalogWorkbookProductDto[],
): CatalogWorkbookProductDto[] {
  return products.filter((product) => product.unifiedCode === code);
}
export function splitOemBrands(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[;,]/u)
        .map((brand) => brand.trim())
        .filter(Boolean),
    ),
  ];
}
