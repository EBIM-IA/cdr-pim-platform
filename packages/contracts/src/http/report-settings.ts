import { z } from 'zod';

export const reportLayoutSchema = z.object({
  order: z.array(z.string().min(1).max(160)).max(500),
  hidden: z.array(z.string().min(1).max(160)).max(500),
});
export const personalReportSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(160),
  file: z.string().max(250),
  fields: z
    .array(z.object({ header: z.string().min(1).max(200), field: z.string().max(160) }))
    .min(1)
    .max(500),
});
export const reportBaselineSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(160),
  capturedAt: z.string().datetime(),
  productCount: z.number().int().nonnegative(),
});
export const reportSettingsSchema = z.object({
  layouts: z.record(z.string(), reportLayoutSchema),
  formats: z.array(personalReportSchema),
  baselines: z.array(reportBaselineSchema),
});
export const closedReportPeriodSchema = z.object({
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
  total: z.number().int().min(0).max(100000000),
});
export const updateReportSettingsSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('save-layout'),
    key: z.string().min(1).max(100),
    layout: reportLayoutSchema,
  }),
  z.object({ operation: z.literal('save-format'), format: personalReportSchema }),
  z.object({ operation: z.literal('delete-format'), key: z.string().min(1).max(100) }),
  z
    .object({
      operation: z.literal('save-closed-periods'),
      source: z.string().trim().min(1).max(250),
      periods: z.array(closedReportPeriodSchema).min(1).max(1200),
    })
    .superRefine((value, context) => {
      const keys = value.periods.map((period) => `${period.year}:${period.month}`);
      if (new Set(keys).size !== keys.length)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['periods'],
          message: 'Periods must be unique',
        });
    }),
  z.object({ operation: z.literal('capture-baseline'), label: z.string().trim().min(1).max(160) }),
]);
export type ReportSettingsDto = z.infer<typeof reportSettingsSchema>;
export type UpdateReportSettingsInput = z.infer<typeof updateReportSettingsSchema>;
