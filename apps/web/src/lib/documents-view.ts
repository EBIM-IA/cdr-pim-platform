import type { CatalogWorkbookProductDto, ProductAssetDto, ProductAssetType } from '@cdr/contracts';

import { fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';
import { listProductAssetsBatch } from '@/lib/product-assets-api';

export type DocumentProduct = CatalogWorkbookProductDto;
export type DocumentAssets = Readonly<Record<string, ProductAssetDto[]>>;

/** Read complete pages before filtering/exporting; the assets endpoint accepts at most 100 IDs. */
export async function fetchDocumentsCatalog(signal?: AbortSignal): Promise<{
  products: DocumentProduct[];
  assets: DocumentAssets;
}> {
  const products: DocumentProduct[] = [];
  const ids = new Set<string>();
  let page = 1;
  let total = 0;
  do {
    const result = await fetchCatalogWorkbook({ page, pageSize: 100, filter: [] }, signal);
    total = result.total;
    let added = 0;
    for (const product of result.items) {
      if (ids.has(product.id)) continue;
      products.push(product);
      ids.add(product.id);
      added += 1;
    }
    if (!added && products.length < total) {
      throw new Error(
        'El catálogo cambió durante la consulta. Actualiza para cargar todos los SKU.',
      );
    }
    page += 1;
  } while (products.length < total);

  const assets: Record<string, ProductAssetDto[]> = {};
  for (let index = 0; index < products.length; index += 100) {
    const batch = await listProductAssetsBatch(
      products.slice(index, index + 100).map((product) => product.id),
      signal,
    );
    for (const item of batch) assets[item.productId] = item.assets;
  }
  return { products, assets };
}

export function documentRequirement(product: DocumentProduct, type: ProductAssetType) {
  if (!product.template || product.assetRequirements === undefined) return undefined;
  return product.assetRequirements.find((requirement) => requirement.type === type) ?? null;
}

export function documentState(
  product: DocumentProduct,
  type: ProductAssetType,
  assets: readonly ProductAssetDto[],
): string {
  const files = assets.filter((asset) => asset.type === type);
  if (files.length) return files.map((asset) => asset.filename).join(' · ');
  const requirement = documentRequirement(product, type);
  if (requirement === undefined)
    return product.template ? 'Política no disponible' : 'Sin plantilla activa';
  if (requirement === null) return 'No aplica';
  return requirement.required ? 'Obligatorio' : 'Pendiente';
}

export function documentCoverage(product: DocumentProduct, assets: readonly ProductAssetDto[]) {
  const requirements = product.template ? product.assetRequirements : undefined;
  if (!requirements) return null;
  return {
    total: requirements.length,
    present: requirements.filter((requirement) =>
      assets.some((asset) => asset.type === requirement.type),
    ).length,
    requiredMissing: requirements.filter(
      (requirement) =>
        requirement.required && !assets.some((asset) => asset.type === requirement.type),
    ).length,
  };
}

/** Empty AX filter on a document means no persisted file, including a non-applicable slot. */
export function documentFilterValue(
  product: DocumentProduct,
  type: ProductAssetType,
  assets: readonly ProductAssetDto[],
  expression: string,
): string {
  if (expression.trim() === '""' && !assets.some((asset) => asset.type === type)) return '(Vacías)';
  return documentState(product, type, assets);
}
