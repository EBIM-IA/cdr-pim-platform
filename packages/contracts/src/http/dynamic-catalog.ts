import { z } from 'zod';

import { paginatedSchema, paginationQuerySchema, uuidSchema } from './common';

export const dynamicAttributeDataTypeSchema = z.enum([
  'text',
  'number',
  'boolean',
  'date',
  'enum',
  'measurement',
]);
export type DynamicAttributeDataType = z.infer<typeof dynamicAttributeDataTypeSchema>;

export const attributeSourceAuthoritySchema = z.enum(['pim', 'erp', 'supplier', 'calculated']);
export type AttributeSourceAuthority = z.infer<typeof attributeSourceAuthoritySchema>;

export const attributeValueSourceSchema = z.enum([
  'manual',
  'erp',
  'import',
  'document_extraction',
  'ai_generated',
]);
export type AttributeValueSource = z.infer<typeof attributeValueSourceSchema>;

export const catalogAttributeValueSchema = z.union([
  z.string().max(20_000),
  z.number().finite(),
  z.boolean(),
]);
export type CatalogAttributeValue = z.infer<typeof catalogAttributeValueSchema>;

export const catalogGridColumnSchema = z.object({
  id: uuidSchema,
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  dataType: dynamicAttributeDataTypeSchema,
  unit: z.string().nullable(),
  allowedValues: z.array(z.string()),
  required: z.boolean(),
  replicable: z.boolean(),
  searchable: z.boolean(),
  includeInTechnicalSheet: z.boolean(),
  sourceAuthority: attributeSourceAuthoritySchema,
  position: z.number().int().min(0),
  permissions: z.object({
    edit: z.boolean(),
    import: z.boolean(),
    export: z.boolean(),
  }),
});
export type CatalogGridColumnDto = z.infer<typeof catalogGridColumnSchema>;

export const catalogGridSchemaSchema = z.object({
  category: z.object({
    id: uuidSchema,
    slug: z.string(),
    name: z.string(),
  }),
  template: z.object({
    id: uuidSchema,
    name: z.string(),
    version: z.number().int().positive(),
  }),
  columns: z.array(catalogGridColumnSchema),
});
export type CatalogGridSchemaDto = z.infer<typeof catalogGridSchemaSchema>;

export const catalogCategorySummarySchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  path: z.string(),
  templateId: uuidSchema,
  templateName: z.string(),
  templateVersion: z.number().int().positive(),
});
export const catalogCategoryListSchema = z.array(catalogCategorySummarySchema);
export type CatalogCategorySummaryDto = z.infer<typeof catalogCategorySummarySchema>;

export const catalogGridCellSchema = z.object({
  // Cleared values remain visible as versioned tombstones for optimistic concurrency.
  value: catalogAttributeValueSchema.nullable(),
  version: z.number().int().min(0),
  source: attributeValueSourceSchema,
  updatedAt: z.string().datetime(),
});

export const catalogGridProductSchema = z.object({
  id: uuidSchema,
  sku: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  status: z.string(),
  attributes: z.record(catalogGridCellSchema),
});
export type CatalogGridProductDto = z.infer<typeof catalogGridProductSchema>;

export const productAttributeSheetSchema = z.object({
  schema: catalogGridSchemaSchema,
  product: catalogGridProductSchema,
});
export type ProductAttributeSheetDto = z.infer<typeof productAttributeSheetSchema>;

export const catalogGridResultSchema = paginatedSchema(catalogGridProductSchema);
export type CatalogGridResultDto = z.infer<typeof catalogGridResultSchema>;

/**
 * Spreadsheet view of the complete catalog. Unlike the category grid, its columns are the
 * role-filtered union of the active templates represented by the query. Applicability lives on
 * each cell so an absent value is never confused with an attribute that does not belong to the
 * product's template.
 */
export const catalogWorkbookColumnSchema = catalogGridColumnSchema.extend({
  applicableTemplateIds: z.array(uuidSchema).min(1),
});
export type CatalogWorkbookColumnDto = z.infer<typeof catalogWorkbookColumnSchema>;

export const catalogWorkbookCellSchema = z.discriminatedUnion('applicable', [
  catalogGridCellSchema.extend({
    applicable: z.literal(true),
    required: z.boolean(),
    permissions: z.object({ edit: z.boolean(), export: z.boolean() }),
  }),
  z.object({ applicable: z.literal(false) }),
]);
export type CatalogWorkbookCellDto = z.infer<typeof catalogWorkbookCellSchema>;

export const catalogWorkbookProductSchema = z.object({
  id: uuidSchema,
  sku: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  brand: z.string().nullable(),
  status: z.string(),
  updatedAt: z.string().datetime(),
  category: z.object({ id: uuidSchema, name: z.string() }),
  template: z.object({ id: uuidSchema, name: z.string(), version: z.number().int().positive() }),
  providerCode: z.string().nullable(),
  unifiedCode: z.string().nullable(),
  applicationTypes: z.array(z.string()),
  completeness: z.number().int().min(0).max(100),
  attributes: z.record(catalogWorkbookCellSchema),
});
export type CatalogWorkbookProductDto = z.infer<typeof catalogWorkbookProductSchema>;

export const catalogWorkbookResultSchema = z.object({
  columns: z.array(catalogWorkbookColumnSchema),
  facets: z.object({
    brands: z.array(z.string()),
    applicationTypes: z.array(z.string()),
    statuses: z.array(z.enum(['draft', 'in_review', 'published', 'archived'])),
  }),
  items: z.array(catalogWorkbookProductSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().min(0),
});
export type CatalogWorkbookResultDto = z.infer<typeof catalogWorkbookResultSchema>;

export const attributeFilterOperatorSchema = z.enum(['eq', 'contains', 'gt', 'gte', 'lt', 'lte']);
export type AttributeFilterOperator = z.infer<typeof attributeFilterOperatorSchema>;

const filterQuerySchema = z.preprocess(
  (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]),
  z.array(z.string().min(3).max(500)).max(25),
);

const workbookColumnFilterQuerySchema = z.preprocess(
  (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]),
  z.array(z.string().min(3).max(4_000)).max(25),
);

export const catalogGridQuerySchema = paginationQuerySchema.extend({
  categoryId: uuidSchema,
  q: z.string().trim().min(1).max(300).optional(),
  filter: filterQuerySchema.default([]),
});
export type CatalogGridQuery = z.infer<typeof catalogGridQuerySchema>;

export const catalogWorkbookQuerySchema = paginationQuerySchema.extend({
  categoryId: uuidSchema.optional(),
  q: z.string().trim().min(1).max(300).optional(),
  brand: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['draft', 'in_review', 'published', 'archived']).optional(),
  applicationType: z.enum(['AUTOMOTRIZ', 'INDUSTRIAL']).optional(),
  completeness: z.enum(['complete', 'attention', 'critical']).optional(),
  filter: filterQuerySchema.default([]),
  /** Repeated JSON wire values: `{ "key": string, "values": string[] }`. */
  columnFilter: workbookColumnFilterQuerySchema.optional(),
  /** JSON wire value: `{ "key": string, "direction": "asc" | "desc" }`. */
  sort: z.string().min(3).max(500).optional(),
});
export type CatalogWorkbookQuery = z.infer<typeof catalogWorkbookQuerySchema>;

export const catalogSchemaQuerySchema = z.object({ categoryId: uuidSchema });
export type CatalogSchemaQuery = z.infer<typeof catalogSchemaQuerySchema>;

export const updateProductAttributeSchema = z.object({
  value: catalogAttributeValueSchema.nullable(),
  expectedVersion: z.number().int().min(0),
});
export type UpdateProductAttributeInput = z.infer<typeof updateProductAttributeSchema>;

export const updatedProductAttributeSchema = z.object({
  productId: uuidSchema,
  attributeKey: z.string(),
  value: catalogAttributeValueSchema.nullable(),
  version: z.number().int().min(0),
  source: attributeValueSourceSchema,
  updatedAt: z.string().datetime(),
  replicatedProductIds: z.array(uuidSchema),
});
export type UpdatedProductAttributeDto = z.infer<typeof updatedProductAttributeSchema>;

export const updateProductAttributesBatchSchema = z
  .object({
    updates: z
      .array(
        z.object({
          attributeKey: z.string().trim().min(1).max(100),
          value: catalogAttributeValueSchema.nullable(),
          expectedVersion: z.number().int().min(0),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((input, context) => {
    const seen = new Set<string>();
    input.updates.forEach((update, index) => {
      if (seen.has(update.attributeKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['updates', index, 'attributeKey'],
          message: 'Each attribute may be updated only once per batch',
        });
      }
      seen.add(update.attributeKey);
    });
  });
export type UpdateProductAttributesBatchInput = z.infer<typeof updateProductAttributesBatchSchema>;

export const updatedProductAttributesBatchSchema = z.object({
  productId: uuidSchema,
  attributes: z.array(updatedProductAttributeSchema).min(1).max(100),
});
export type UpdatedProductAttributesBatchDto = z.infer<typeof updatedProductAttributesBatchSchema>;

export const categorySourcePrioritySchema = z.object({
  tecdoc: z.number().int().positive().optional(),
  fabricante: z.number().int().positive().optional(),
  archivo: z.number().int().positive().optional(),
  manual: z.number().int().positive().optional(),
});
export type CategorySourcePriorityDto = z.infer<typeof categorySourcePrioritySchema>;

export const adminCatalogCategorySchema = z.object({
  id: uuidSchema,
  parentId: uuidSchema.nullable(),
  slug: z.string(),
  name: z.string(),
  path: z.string(),
  application: z.string().nullable(),
  sourcePriority: categorySourcePrioritySchema,
  position: z.number().int().min(0),
  active: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type AdminCatalogCategoryDto = z.infer<typeof adminCatalogCategorySchema>;

export const adminCategoryListQuerySchema = z.object({
  includeInactive: z.preprocess(
    (value) => (value === undefined ? false : value === true || value === 'true'),
    z.boolean(),
  ),
});
export type AdminCategoryListQuery = z.infer<typeof adminCategoryListQuerySchema>;

export const updateCatalogCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    active: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
    expectedUpdatedAt: z.string().datetime(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.active !== undefined || value.position !== undefined,
    { message: 'At least one category field must be changed' },
  );
export type UpdateCatalogCategoryInput = z.infer<typeof updateCatalogCategorySchema>;

export const adminAttributeRoleAccessSchema = z.object({
  role: z.enum(['ADMINISTRADOR', 'COMPRAS', 'VENTAS']),
  canView: z.boolean(),
  canEdit: z.boolean(),
  canImport: z.boolean(),
  canExport: z.boolean(),
});
export type AdminAttributeRoleAccessDto = z.infer<typeof adminAttributeRoleAccessSchema>;

export const adminTemplateAttributeSchema = catalogGridColumnSchema
  .omit({ permissions: true })
  .extend({
    active: z.boolean(),
    updatedAt: z.string().datetime(),
    roleAccess: z.array(adminAttributeRoleAccessSchema),
  });
export type AdminTemplateAttributeDto = z.infer<typeof adminTemplateAttributeSchema>;

export const adminTemplateSchema = z.object({
  id: uuidSchema,
  categoryId: uuidSchema,
  categoryName: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  status: z.enum(['draft', 'active', 'retired']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  attributes: z.array(adminTemplateAttributeSchema).optional(),
});
export type AdminTemplateDto = z.infer<typeof adminTemplateSchema>;

export const adminTemplateListQuerySchema = z.object({
  categoryId: uuidSchema.optional(),
});
export type AdminTemplateListQuery = z.infer<typeof adminTemplateListQuerySchema>;

export const updateTemplateAttributeSchema = z
  .object({
    active: z.boolean().optional(),
    required: z.boolean().optional(),
    replicable: z.boolean().optional(),
    searchable: z.boolean().optional(),
    includeInTechnicalSheet: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
    roleAccess: z.array(adminAttributeRoleAccessSchema).max(3).optional(),
    expectedUpdatedAt: z.string().datetime(),
  })
  .superRefine((value, context) => {
    const hasChange =
      value.active !== undefined ||
      value.required !== undefined ||
      value.replicable !== undefined ||
      value.searchable !== undefined ||
      value.includeInTechnicalSheet !== undefined ||
      value.position !== undefined ||
      value.roleAccess !== undefined;
    if (!hasChange)
      context.addIssue({ code: 'custom', message: 'At least one field must be changed' });
    const roles = value.roleAccess?.map((access) => access.role) ?? [];
    if (new Set(roles).size !== roles.length) {
      context.addIssue({ code: 'custom', message: 'Role access entries must be unique' });
    }
    for (const access of value.roleAccess ?? []) {
      if (!access.canView && (access.canEdit || access.canImport || access.canExport)) {
        context.addIssue({
          code: 'custom',
          message: `${access.role} requires canView for edit, import or export`,
        });
      }
    }
  });
export type UpdateTemplateAttributeInput = z.infer<typeof updateTemplateAttributeSchema>;
