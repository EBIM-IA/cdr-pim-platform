import { z } from 'zod';

import { uuidSchema } from './common';

export const applicationVehicleTypeSchema = z.enum(['AUTOMOTRIZ', 'INDUSTRIAL']);
export type ApplicationVehicleType = z.infer<typeof applicationVehicleTypeSchema>;

// Archived/renamed columns retain their values, so stored rows can contain more than
// 60 historical keys even though each write and the active configuration remain limited.
const storedApplicationAdditionalFieldsSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
  z.string().trim().max(500).nullable(),
);
export const applicationAdditionalFieldsSchema = storedApplicationAdditionalFieldsSchema.refine(
  (fields) => Object.keys(fields).length <= 60,
  'Máximo 60 campos adicionales',
);
export const applicationColumnSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
  header: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
  required: z.boolean(),
  aliases: z.array(z.string().trim().min(1).max(120)).max(20),
});
export const applicationColumnSettingsSchema = z.object({
  columns: z.array(applicationColumnSchema).max(60),
  version: z.number().int().min(0),
});
export const updateApplicationColumnSettingsSchema = z.object({
  columns: z.array(applicationColumnSchema).max(60),
  expectedVersion: z.number().int().min(0),
});
export type ApplicationColumnDto = z.infer<typeof applicationColumnSchema>;
export type ApplicationColumnSettingsDto = z.infer<typeof applicationColumnSettingsSchema>;
export type UpdateApplicationColumnSettingsInput = z.infer<
  typeof updateApplicationColumnSettingsSchema
>;

export const groupApplicationSchema = z.object({
  id: uuidSchema,
  groupId: uuidSchema,
  unifiedCode: z.string().min(1).max(120),
  vehicleType: applicationVehicleTypeSchema.nullable(),
  make: z.string().max(160).nullable(),
  model: z.string().max(200).nullable(),
  bodyStyle: z.string().max(200).nullable(),
  fuel: z.string().max(200).nullable(),
  traction: z.string().max(200).nullable(),
  displacement: z.string().max(200).nullable(),
  yearFrom: z.number().int().min(1886).max(2200).nullable(),
  yearTo: z.number().int().min(1886).max(2200).nullable(),
  area: z.string().max(200).nullable(),
  subarea: z.string().max(200).nullable(),
  engine: z.string().max(200).nullable(),
  notes: z.string().max(2_000).nullable(),
  additionalFields: storedApplicationAdditionalFieldsSchema.optional(),
  active: z.boolean(),
  verificationStatus: z.enum(['pending', 'verified']).optional(),
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
  additionalFields: applicationAdditionalFieldsSchema.optional(),
  vehicleType: applicationVehicleTypeWriteSchema,
  verificationStatus: z.enum(['pending', 'verified']).optional(),
  make: z.string().trim().min(1).max(160),
  model: z.string().trim().min(1).max(200),
  bodyStyle: z.string().trim().max(200).nullable().optional(),
  fuel: z.string().trim().max(200).nullable().optional(),
  traction: z.string().trim().max(200).nullable().optional(),
  displacement: z.string().trim().max(200).nullable().optional(),
  yearFrom: z.number().int().min(1886).max(2200).optional(),
  yearTo: z.number().int().min(1886).max(2200).optional(),
  area: z.string().trim().max(200).nullable().optional(),
  subarea: z.string().trim().max(200).nullable().optional(),
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
    additionalFields: applicationAdditionalFieldsSchema.optional(),
    verificationStatus: z.enum(['pending', 'verified']).optional(),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    vehicleType: applicationVehicleTypeWriteSchema.optional(),
    make: z.string().trim().min(1).max(160).optional(),
    model: z.string().trim().min(1).max(200).optional(),
    bodyStyle: z.string().trim().max(200).nullable().optional(),
    fuel: z.string().trim().max(200).nullable().optional(),
    traction: z.string().trim().max(200).nullable().optional(),
    displacement: z.string().trim().max(200).nullable().optional(),
    yearFrom: z.number().int().min(1886).max(2200).nullable().optional(),
    yearTo: z.number().int().min(1886).max(2200).nullable().optional(),
    area: z.string().trim().max(200).nullable().optional(),
    subarea: z.string().trim().max(200).nullable().optional(),
    engine: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2_000).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.additionalFields !== undefined ||
      value.verificationStatus !== undefined ||
      value.vehicleType !== undefined ||
      value.make !== undefined ||
      value.model !== undefined ||
      value.bodyStyle !== undefined ||
      value.fuel !== undefined ||
      value.traction !== undefined ||
      value.displacement !== undefined ||
      value.yearFrom !== undefined ||
      value.yearTo !== undefined ||
      value.area !== undefined ||
      value.subarea !== undefined ||
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
