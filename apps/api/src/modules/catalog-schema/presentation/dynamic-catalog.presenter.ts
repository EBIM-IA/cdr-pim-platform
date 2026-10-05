import type {
  CatalogGridProductDto,
  CatalogGridSchemaDto,
  ProductAttributeSheetDto,
  UpdatedProductAttributeDto,
} from '@cdr/contracts';

import type { CatalogGridProduct, DynamicCatalogSchema } from '../domain/entities/catalog-schema';
import type { UpdatedProductAttribute } from '../application/update-product-attribute.use-case';

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
