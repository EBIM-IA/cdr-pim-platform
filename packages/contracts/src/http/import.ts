import { z } from 'zod';

import { uuidSchema } from './common';

export const importTargetSchema = z.enum(['category', 'applications', 'homologs']);
export type ImportTarget = z.infer<typeof importTargetSchema>;

export const importFormatSchema = z.enum(['csv', 'json']);
export type ImportFormat = z.infer<typeof importFormatSchema>;

export const importBatchStatusSchema = z.enum(['previewed', 'confirmed', 'failed']);
export type ImportBatchStatus = z.infer<typeof importBatchStatusSchema>;

const safeImportRecordSchema = z.record(
  z.union([z.string().max(20_000), z.number().finite(), z.boolean(), z.null()]),
);

export const previewImportSchema = z
  .object({
    target: importTargetSchema,
    format: importFormatSchema,
    idempotencyKey: z.string().trim().min(8).max(200),
    categoryCode: z.string().trim().min(1).max(120).optional(),
    csv: z.string().max(2_000_000).optional(),
    records: z.array(safeImportRecordSchema).max(10_000).optional(),
  })
  .superRefine((value, context) => {
    if (value.format === 'csv' && value.csv === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['csv'], message: 'csv is required' });
    }
    if (value.format === 'json' && value.records === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['records'],
        message: 'records is required',
      });
    }
    if (value.target === 'category' && !value.categoryCode) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['categoryCode'],
        message: 'categoryCode is required for category imports',
      });
    }
  });
export type PreviewImportInput = z.infer<typeof previewImportSchema>;

export const importRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  valid: z.boolean(),
  data: safeImportRecordSchema,
  errors: z.array(z.string().min(1).max(1_000)),
});
export type ImportRowDto = z.infer<typeof importRowSchema>;

export const importBatchSchema = z.object({
  id: uuidSchema,
  target: importTargetSchema,
  format: importFormatSchema,
  status: importBatchStatusSchema,
  idempotencyKey: z.string().min(8).max(200),
  categoryCode: z.string().nullable(),
  totalRows: z.number().int().nonnegative(),
  validRows: z.number().int().nonnegative(),
  invalidRows: z.number().int().nonnegative(),
  rows: z.array(importRowSchema),
  createdAt: z.string().datetime(),
  confirmedAt: z.string().datetime().nullable(),
});
export type ImportBatchDto = z.infer<typeof importBatchSchema>;
