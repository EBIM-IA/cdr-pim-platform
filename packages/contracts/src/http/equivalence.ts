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
    externalCode: z.string().trim().min(1).max(160).optional(),
    externalBrand: z.string().trim().min(1).max(160).optional(),
    active: z.boolean().optional(),
    approvalStatus: homologApprovalStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdateExternalHomologInput = z.infer<typeof updateExternalHomologSchema>;

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
