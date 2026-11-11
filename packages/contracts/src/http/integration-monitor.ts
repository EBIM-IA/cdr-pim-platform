import { z } from 'zod';

export const axInboxBatchSchema = z.object({
  id: z.string().uuid(),
  externalId: z.string(),
  sentAt: z.string().datetime(),
  receivedAt: z.string().datetime(),
  sourceSystem: z.string().nullable(),
  correlationId: z.string(),
  status: z.literal('received'),
  recordCount: z.number().int().nonnegative(),
});

/** Reception is durable; catalog application and record-level processing are not enabled. */
export const axInboxMonitorSchema = z.object({
  totalBatches: z.number().int().nonnegative(),
  totalRecords: z.number().int().nonnegative(),
  recentBatches: z.array(axInboxBatchSchema),
  selectedBatch: axInboxBatchSchema.nullable(),
  records: z.array(
    z.object({
      id: z.string().uuid(),
      rowNumber: z.number().int().positive(),
      itemCode: z.string(),
      supplierCode: z.string(),
      sourceModifiedAt: z.string().datetime().nullable(),
    }),
  ),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  catalogApplicationEnabled: z.literal(false),
});
export type AxInboxMonitorDto = z.infer<typeof axInboxMonitorSchema>;
