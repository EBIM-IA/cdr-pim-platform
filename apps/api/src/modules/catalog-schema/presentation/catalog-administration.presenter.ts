import type {
  AdminCatalogCategoryDto,
  AdminTemplateAttributeDto,
  AdminTemplateDto,
} from '@cdr/contracts';

import type {
  AdminAttributeTemplate,
  AdminCatalogCategory,
  AdminTemplateAttribute,
} from '../domain/entities/catalog-administration';

export function toAdminCategoryDto(category: AdminCatalogCategory): AdminCatalogCategoryDto {
  return { ...category, updatedAt: category.updatedAt.toISOString() };
}

export function toAdminTemplateAttributeDto(
  attribute: AdminTemplateAttribute,
): AdminTemplateAttributeDto {
  return {
    ...attribute,
    allowedValues: [...attribute.allowedValues],
    roleAccess: [...attribute.roleAccess],
    updatedAt: attribute.updatedAt.toISOString(),
  };
}

export function toAdminTemplateDto(template: AdminAttributeTemplate): AdminTemplateDto {
  const { attributes, ...header } = template;
  return {
    ...header,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    ...(attributes ? { attributes: attributes.map(toAdminTemplateAttributeDto) } : {}),
  };
}
