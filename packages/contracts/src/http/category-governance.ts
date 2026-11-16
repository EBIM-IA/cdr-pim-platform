import { z } from 'zod';
export const categoryTreeImportRowSchema = z.object({
  level1: z.string().trim().max(200),
  level2: z.string().trim().max(200),
  level3: z.string().trim().max(200).default(''),
  code1: z.string().trim().max(100).default(''),
  code2: z.string().trim().max(100).default(''),
  code3: z.string().trim().max(100).default(''),
});
export type CategoryTreeImportRow = z.infer<typeof categoryTreeImportRowSchema>;
export const categoryTreeImportSchema = z.object({
  rows: z.array(categoryTreeImportRowSchema).min(1).max(1000),
});
export const categoryTreeConfirmSchema = categoryTreeImportSchema.extend({
  expectedRevision: z.string().min(1).max(100),
});
export const categoryTreePreviewSchema = z.object({
  revision: z.string(),
  rows: z.array(
    categoryTreeImportRowSchema.extend({
      row: z.number(),
      path: z.string(),
      newCategories: z.number(),
      error: z.string().nullable(),
    }),
  ),
});
export const categoryGovernanceSchema = z.object({
  erpCodes: z.array(z.object({ categoryId: z.string().uuid(), code: z.string() })),
  diagnostics: z.array(
    z.object({
      kind: z.enum([
        'unknown_category',
        'incomplete_levels',
        'non_final_category',
        'missing_template',
        'ambiguous_variant',
      ]),
      sku: z.string().nullable(),
      categoryId: z.string().uuid().nullable(),
      category: z.string(),
      detail: z.string(),
    }),
  ),
  dynamicAttributes: z.array(
    z.object({
      id: z.string().uuid(),
      categoryId: z.string().uuid(),
      categoryName: z.string(),
      key: z.string(),
      label: z.string(),
      dataType: z.enum(['text', 'number']),
      unit: z.string().nullable(),
      required: z.boolean(),
      includeInTechnicalSheet: z.boolean(),
      active: z.boolean(),
      updatedAt: z.string().datetime(),
      updatedBy: z.string(),
      templateCount: z.number(),
      skuCount: z.number(),
      filledCount: z.number(),
    }),
  ),
});
export type CategoryGovernanceDto = z.infer<typeof categoryGovernanceSchema>;
export const saveCategoryDynamicAttributeSchema = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid(),
  label: z.string().trim().min(1).max(60),
  dataType: z.enum(['text', 'number']),
  unit: z.string().trim().max(12).nullable(),
  required: z.boolean(),
  includeInTechnicalSheet: z.boolean(),
  active: z.boolean().default(true),
  expectedUpdatedAt: z.string().datetime().optional(),
});
export type SaveCategoryDynamicAttribute = z.infer<typeof saveCategoryDynamicAttributeSchema>;
