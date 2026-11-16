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

export const integrationExecutionSchema = z.object({
  id: z.string(),
  system: z.enum(['ax', 'import']),
  operation: z.string(),
  status: z.enum([
    'received',
    'previewed',
    'queued',
    'processing',
    'confirmed',
    'completed',
    'failed',
  ]),
  records: z.number().int().nonnegative(),
  succeededRecords: z.number().int().nonnegative().nullable(),
  failedRecords: z.number().int().nonnegative().nullable(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  durationMs: z.number().nonnegative().nullable(),
  actor: z.string().nullable(),
  correlationId: z.string().nullable(),
  error: z.string().nullable(),
});
export const integrationExecutionMonitorSchema = z.object({
  summary: z.object({
    axBatches: z.number().int().nonnegative(),
    axRecords: z.number().int().nonnegative(),
    importsProcessing: z.number().int().nonnegative(),
    importsFailed: z.number().int().nonnegative(),
    importsConfirmed: z.number().int().nonnegative(),
    importRowsApplied: z.number().int().nonnegative(),
    aiGenerations: z.number().int().nonnegative(),
  }),
  executions: z.array(integrationExecutionSchema),
});
export type IntegrationExecutionMonitorDto = z.infer<typeof integrationExecutionMonitorSchema>;
