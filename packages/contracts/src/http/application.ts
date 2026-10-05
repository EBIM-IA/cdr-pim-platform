import { z } from 'zod';

import { uuidSchema } from './common';

export const groupApplicationSchema = z.object({
  id: uuidSchema,
  groupId: uuidSchema,
  unifiedCode: z.string().min(1).max(120),
  vehicleType: z.string().max(120).nullable(),
  make: z.string().max(160).nullable(),
  model: z.string().max(200).nullable(),
  yearFrom: z.number().int().min(1886).max(2200).nullable(),
  yearTo: z.number().int().min(1886).max(2200).nullable(),
  engine: z.string().max(200).nullable(),
  notes: z.string().max(2_000).nullable(),
  active: z.boolean(),
  source: z.enum(['manual', 'import']),
  importBatchId: uuidSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type GroupApplicationDto = z.infer<typeof groupApplicationSchema>;

const queryBooleanSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);

export const applicationListQuerySchema = z.object({
  unifiedCode: z.string().trim().min(1).max(120).optional(),
  productId: uuidSchema.optional(),
  includeInactive: queryBooleanSchema.default(false),
});
export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>;

const groupApplicationWriteFieldsSchema = z.object({
  vehicleType: z.string().trim().max(120).optional(),
  make: z.string().trim().max(160).optional(),
  model: z.string().trim().max(200).optional(),
  yearFrom: z.number().int().min(1886).max(2200).optional(),
  yearTo: z.number().int().min(1886).max(2200).optional(),
  engine: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2_000).optional(),
});

export const createGroupApplicationSchema = groupApplicationWriteFieldsSchema
  .extend({
    unifiedCode: z.string().trim().min(1).max(120),
  })
  .refine((value) => !value.yearFrom || !value.yearTo || value.yearFrom <= value.yearTo, {
    message: 'yearFrom must be less than or equal to yearTo',
    path: ['yearTo'],
  });
export type CreateGroupApplicationInput = z.infer<typeof createGroupApplicationSchema>;

export const updateGroupApplicationSchema = groupApplicationWriteFieldsSchema
  .partial()
  .extend({ active: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')
  .refine((value) => !value.yearFrom || !value.yearTo || value.yearFrom <= value.yearTo, {
    message: 'yearFrom must be less than or equal to yearTo',
    path: ['yearTo'],
  });
export type UpdateGroupApplicationInput = z.infer<typeof updateGroupApplicationSchema>;
