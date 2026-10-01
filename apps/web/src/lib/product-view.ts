import type { ProductDto, ProductListDto } from '@cdr/contracts';

import type { Product, ProductAttribute, ProductListResult } from '@/lib/types';

const identifierLabels: Record<string, string> = {
  sku: 'SKU',
  erp_item_id: 'Código ERP',
  manufacturer_part_number: 'Código del fabricante',
  ean: 'EAN',
  upc: 'UPC',
  internal_legacy: 'Código legado',
};

function identifierAttribute(
  identifier: ProductDto['identifiers'][number],
  index: number,
): ProductAttribute {
  return {
    key: `${identifier.type}-${index}`,
    label: identifierLabels[identifier.type] ?? identifier.type,
    value: identifier.value,
    rawValue: identifier.value,
    source: 'Catálogo maestro',
  };
}

export function toProductView(product: ProductDto): Product {
  const manufacturerCode = product.identifiers.find(
    (identifier) => identifier.type === 'manufacturer_part_number',
  )?.value;

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description ?? undefined,
    brand: product.brand ?? 'Sin marca registrada',
    brandFilter: product.brand ?? undefined,
    category: 'No disponible en el contrato actual',
    application: 'No disponible en el contrato actual',
    status: product.status,
    completeness: null,
    providerCode: manufacturerCode,
    source: 'API del catálogo',
    sourceReference: product.id,
    updatedAt: product.updatedAt,
    attributes: product.identifiers.map(identifierAttribute),
  };
}

export function toProductListView(page: ProductListDto): ProductListResult {
  return {
    items: page.items.map(toProductView),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: Math.max(1, Math.ceil(page.total / page.pageSize)),
  };
}
