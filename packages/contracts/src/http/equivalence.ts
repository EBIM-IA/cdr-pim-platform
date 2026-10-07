import { z } from 'zod';

import { uuidSchema } from './common';

export const homologApprovalStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type HomologApprovalStatus = z.infer<typeof homologApprovalStatusSchema>;

export const externalHomologSchema = z.object({
  id: uuidSchema,
  groupId: uuidSchema,
  unifiedCode: z.string().min(1).max(120),
  externalCode: z.string().min(1).max(160),
  externalBrand: z.string().min(1).max(160),
  active: z.boolean(),
  approvalStatus: homologApprovalStatusSchema,
  source: z.enum(['manual', 'import']),
  importBatchId: uuidSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ExternalHomologDto = z.infer<typeof externalHomologSchema>;

export const createExternalHomologSchema = z.object({
  unifiedCode: z.string().trim().min(1).max(120),
  externalCode: z.string().trim().min(1).max(160),
  externalBrand: z.string().trim().min(1).max(160),
  active: z.boolean().default(true),
  approvalStatus: homologApprovalStatusSchema.default('pending'),
});
export type CreateExternalHomologInput = z.infer<typeof createExternalHomologSchema>;

export const updateExternalHomologSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    externalCode: z.string().trim().min(1).max(160).optional(),
    externalBrand: z.string().trim().min(1).max(160).optional(),
    active: z.boolean().optional(),
    approvalStatus: homologApprovalStatusSchema.optional(),
  })
  .refine(
    (value) =>
      value.externalCode !== undefined ||
      value.externalBrand !== undefined ||
      value.active !== undefined ||
      value.approvalStatus !== undefined,
    'At least one mutable field is required',
  );
export type UpdateExternalHomologInput = z.infer<typeof updateExternalHomologSchema>;

export const deactivateExternalHomologQuerySchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});
export type DeactivateExternalHomologQuery = z.infer<typeof deactivateExternalHomologQuerySchema>;

export const homologListQuerySchema = z.object({
  unifiedCode: z.string().trim().min(1).max(120).optional(),
  includeInactive: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
    .default(false),
});
export type HomologListQuery = z.infer<typeof homologListQuerySchema>;

export const eligibleHomologSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(160),
});
export type EligibleHomologSearchQuery = z.infer<typeof eligibleHomologSearchQuerySchema>;

export const homologSearchResultSchema = z.object({
  homolog: externalHomologSchema,
  products: z.array(
    z.object({
      id: uuidSchema,
      sku: z.string().min(1).max(64),
      name: z.string().min(1).max(300),
      brand: z.string().nullable(),
      status: z.string().min(1).max(40),
    }),
  ),
});
export type HomologSearchResultDto = z.infer<typeof homologSearchResultSchema>;

export const oemApprovalStatusSchema = homologApprovalStatusSchema;
export type OemApprovalStatus = z.infer<typeof oemApprovalStatusSchema>;

const oemBrandsSchema = z
  .array(z.string().trim().min(1).max(160))
  .min(1)
  .max(20)
  .refine(
    (brands) =>
      new Set(brands.map((brand) => brand.toLocaleUpperCase('es'))).size === brands.length,
    'OEM brands must be unique',
  );

export const groupOemCodeSchema = z.object({
  id: uuidSchema,
  groupId: uuidSchema,
  unifiedCode: z.string().min(1).max(120),
  oemCode: z.string().min(1).max(160),
  brands: oemBrandsSchema,
  active: z.boolean(),
  approvalStatus: oemApprovalStatusSchema,
  source: z.enum(['manual', 'import']),
  importBatchId: uuidSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type GroupOemCodeDto = z.infer<typeof groupOemCodeSchema>;

export const createGroupOemCodeSchema = z.object({
  unifiedCode: z.string().trim().min(1).max(120),
  oemCode: z.string().trim().min(1).max(160),
  brands: oemBrandsSchema,
  active: z.boolean().default(true),
  approvalStatus: oemApprovalStatusSchema.default('pending'),
});
export type CreateGroupOemCodeInput = z.infer<typeof createGroupOemCodeSchema>;

export const updateGroupOemCodeSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    oemCode: z.string().trim().min(1).max(160).optional(),
    brands: oemBrandsSchema.optional(),
    active: z.boolean().optional(),
    approvalStatus: oemApprovalStatusSchema.optional(),
  })
  .refine(
    (value) =>
      value.oemCode !== undefined ||
      value.brands !== undefined ||
      value.active !== undefined ||
      value.approvalStatus !== undefined,
    'At least one mutable field is required',
  );
export type UpdateGroupOemCodeInput = z.infer<typeof updateGroupOemCodeSchema>;

export const deactivateGroupOemCodeQuerySchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});
export type DeactivateGroupOemCodeQuery = z.infer<typeof deactivateGroupOemCodeQuerySchema>;

export const oemCodeListQuerySchema = z.object({
  unifiedCode: z.string().trim().min(1).max(120).optional(),
  brand: z.string().trim().min(1).max(160).optional(),
  includeInactive: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
    .default(false),
});
export type OemCodeListQuery = z.infer<typeof oemCodeListQuerySchema>;

export const eligibleOemSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(160),
});
export type EligibleOemSearchQuery = z.infer<typeof eligibleOemSearchQuerySchema>;

export const oemSearchResultSchema = z.object({
  oem: groupOemCodeSchema,
  products: z.array(
    z.object({
      id: uuidSchema,
      sku: z.string().min(1).max(64),
      name: z.string().min(1).max(300),
      brand: z.string().nullable(),
      status: z.string().min(1).max(40),
    }),
  ),
});
export type OemSearchResultDto = z.infer<typeof oemSearchResultSchema>;
