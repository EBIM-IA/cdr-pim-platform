import type {
  CatalogGridProductDto,
  CatalogGridSchemaDto,
  CatalogWorkbookResultDto,
  ProductAttributeSheetDto,
  UpdatedProductAttributeDto,
  UpdatedProductAttributesBatchDto,
} from '@cdr/contracts';

import type {
  CatalogGridProduct,
  CatalogWorkbookProduct,
  DynamicCatalogSchema,
} from '../domain/entities/catalog-schema';
import type { CatalogWorkbookResult } from '../domain/ports/dynamic-catalog.repository.port';
import type { UpdatedProductAttribute } from '../application/update-product-attribute.use-case';
import type { UpdatedProductAttributes } from '../application/update-product-attributes.use-case';

export function toGridSchemaDto(schema: DynamicCatalogSchema): CatalogGridSchemaDto {
  return {
    category: schema.category,
    template: schema.template,
    columns: schema.attributes.map((attribute) => ({
      id: attribute.id,
      key: attribute.key,
      label: attribute.label,
      dataType: attribute.dataType,
      unit: attribute.unit,
      allowedValues: [...attribute.allowedValues],
      required: attribute.required,
      replicable: attribute.replicable,
      searchable: attribute.searchable,
      includeInTechnicalSheet: attribute.includeInTechnicalSheet,
      sourceAuthority: attribute.sourceAuthority,
      position: attribute.position,
      permissions: attribute.permissions,
    })),
  };
}

export function toGridProductDto(product: CatalogGridProduct): CatalogGridProductDto {
  return {
    ...product,
    attributes: Object.fromEntries(
      Object.entries(product.attributes).map(([key, cell]) => [
        key,
        { ...cell, updatedAt: cell.updatedAt.toISOString() },
      ]),
    ),
  };
}

function toWorkbookProductDto(product: CatalogWorkbookProduct) {
  return {
    ...product,
    applicationTypes: [...product.applicationTypes],
    updatedAt: product.updatedAt.toISOString(),
    attributes: Object.fromEntries(
      Object.entries(product.attributes).map(([key, cell]) => [
        key,
        cell.applicable ? { ...cell, updatedAt: cell.updatedAt.toISOString() } : cell,
      ]),
    ),
  };
}

export function toWorkbookResultDto(
  result: CatalogWorkbookResult,
  page: number,
  pageSize: number,
): CatalogWorkbookResultDto {
  return {
    columns: result.columns.map((column) => ({
      ...column,
      allowedValues: [...column.allowedValues],
      applicableTemplateIds: [...column.applicableTemplateIds],
    })),
    facets: {
      brands: [...result.facets.brands],
      applicationTypes: [...result.facets.applicationTypes],
      statuses: [...result.facets.statuses],
    },
    items: result.items.map(toWorkbookProductDto),
    page,
    pageSize,
    total: result.total,
  };
}

export function toProductAttributeSheetDto(input: {
  schema: DynamicCatalogSchema;
  product: CatalogGridProduct;
}): ProductAttributeSheetDto {
  return { schema: toGridSchemaDto(input.schema), product: toGridProductDto(input.product) };
}

export function toUpdatedProductAttributeDto(
  attribute: UpdatedProductAttribute,
): UpdatedProductAttributeDto {
  return {
    ...attribute,
    updatedAt: attribute.updatedAt.toISOString(),
    replicatedProductIds: [...attribute.replicatedProductIds],
  };
}

export function toUpdatedProductAttributesBatchDto(
  result: UpdatedProductAttributes,
): UpdatedProductAttributesBatchDto {
  return {
    productId: result.productId,
    attributes: result.attributes.map(toUpdatedProductAttributeDto),
  };
}
