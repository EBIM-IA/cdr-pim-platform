import { z } from 'zod';

import { uuidSchema } from './common';

export const applicationVehicleTypeSchema = z.enum(['AUTOMOTRIZ', 'INDUSTRIAL']);
export type ApplicationVehicleType = z.infer<typeof applicationVehicleTypeSchema>;

export const groupApplicationSchema = z.object({
  id: uuidSchema,
  groupId: uuidSchema,
  unifiedCode: z.string().min(1).max(120),
  vehicleType: applicationVehicleTypeSchema.nullable(),
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

const applicationVehicleTypeWriteSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
  applicationVehicleTypeSchema,
);

const groupApplicationWriteFieldsSchema = z.object({
  vehicleType: applicationVehicleTypeWriteSchema,
  make: z.string().trim().min(1).max(160),
  model: z.string().trim().min(1).max(200),
  yearFrom: z.number().int().min(1886).max(2200).optional(),
  yearTo: z.number().int().min(1886).max(2200).optional(),
  engine: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2_000).optional(),
});

export const createGroupApplicationSchema = groupApplicationWriteFieldsSchema
  .extend({
    unifiedCode: z.string().trim().min(1).max(120),
  })
  .refine(
    (value) =>
      value.yearFrom === undefined ||
      value.yearFrom === null ||
      value.yearTo === undefined ||
      value.yearTo === null ||
      value.yearFrom <= value.yearTo,
    {
      message: 'yearFrom must be less than or equal to yearTo',
      path: ['yearTo'],
    },
  );
export type CreateGroupApplicationInput = z.infer<typeof createGroupApplicationSchema>;

export const updateGroupApplicationSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    vehicleType: applicationVehicleTypeWriteSchema.optional(),
    make: z.string().trim().min(1).max(160).optional(),
    model: z.string().trim().min(1).max(200).optional(),
    yearFrom: z.number().int().min(1886).max(2200).nullable().optional(),
    yearTo: z.number().int().min(1886).max(2200).nullable().optional(),
    engine: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2_000).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.vehicleType !== undefined ||
      value.make !== undefined ||
      value.model !== undefined ||
      value.yearFrom !== undefined ||
      value.yearTo !== undefined ||
      value.engine !== undefined ||
      value.notes !== undefined ||
      value.active !== undefined,
    'At least one mutable field is required',
  )
  .refine(
    (value) =>
      value.yearFrom === undefined ||
      value.yearFrom === null ||
      value.yearTo === undefined ||
      value.yearTo === null ||
      value.yearFrom <= value.yearTo,
    {
      message: 'yearFrom must be less than or equal to yearTo',
      path: ['yearTo'],
    },
  );
export type UpdateGroupApplicationInput = z.infer<typeof updateGroupApplicationSchema>;

export const deactivateGroupApplicationQuerySchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});
export type DeactivateGroupApplicationQuery = z.infer<typeof deactivateGroupApplicationQuerySchema>;
