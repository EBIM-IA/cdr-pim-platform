import { z } from 'zod';

/**
 * Stable identifiers for the operational workspaces rendered by the web application.
 * Keeping this list in the shared contract prevents the API and navigation from drifting.
 */
export const workspaceSlugSchema = z.enum([
  'categories',
  'templates',
  'applications',
  'equivalences',
  'documents',
  'imports',
  'quality',
  'publication',
  'integrations',
  'reports',
  'administration',
]);
export type WorkspaceSlug = z.infer<typeof workspaceSlugSchema>;

/**
 * `operational` means the advertised read capability is live. `partial` means that the
 * response contains live data but one or more business capabilities are deliberately
 * unavailable. `blocked` means the required persistence or confirmed rules do not exist.
 */
export const workspaceOperationalStatusSchema = z.enum(['operational', 'partial', 'blocked']);
export type WorkspaceOperationalStatus = z.infer<typeof workspaceOperationalStatusSchema>;

const workspaceMetricBaseSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
});

export const workspaceMetricSchema = z.discriminatedUnion('format', [
  workspaceMetricBaseSchema.extend({
    value: z.number().int(),
    format: z.literal('integer'),
  }),
  workspaceMetricBaseSchema.extend({
    value: z.string().max(500),
    format: z.literal('text'),
  }),
  workspaceMetricBaseSchema.extend({
    value: z.string().datetime(),
    format: z.literal('datetime'),
  }),
]);
export type WorkspaceMetric = z.infer<typeof workspaceMetricSchema>;

export const workspaceColumnSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  type: z.enum(['text', 'number', 'status', 'datetime']).default('text'),
});
export type WorkspaceColumn = z.infer<typeof workspaceColumnSchema>;

export const workspaceCellSchema = z.union([
  z.string().max(20_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const workspaceRowSchema = z.object({
  id: z.string().min(1).max(200),
  values: z.record(workspaceCellSchema),
});
export type WorkspaceRow = z.infer<typeof workspaceRowSchema>;

export const workspaceNoticeSchema = z.object({
  id: z.string().min(1).max(80),
  severity: z.enum(['info', 'warning', 'error']),
  title: z.string().min(1).max(160),
  message: z.string().min(1).max(2_000),
});
export type WorkspaceNotice = z.infer<typeof workspaceNoticeSchema>;

const workspaceActionBaseSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
});

export const workspaceActionSchema = z.discriminatedUnion('availability', [
  workspaceActionBaseSchema.extend({
    availability: z.literal('supported'),
    method: z.enum(['GET', 'POST', 'PATCH', 'DELETE']),
    endpoint: z.string().startsWith('/api/v1/').max(500),
  }),
  workspaceActionBaseSchema.extend({
    availability: z.literal('blocked'),
    reason: z.string().min(1).max(1_000),
  }),
]);
export type WorkspaceAction = z.infer<typeof workspaceActionSchema>;

/** Read model returned by `GET /api/v1/workspaces/:slug`. */
export const workspaceSchema = z
  .object({
    slug: workspaceSlugSchema,
    operationalStatus: workspaceOperationalStatusSchema,
    generatedAt: z.string().datetime(),
    metrics: z.array(workspaceMetricSchema),
    columns: z.array(workspaceColumnSchema),
    rows: z.array(workspaceRowSchema),
    /** Total live records, which may be greater than `rows.length` when the query is capped. */
    totalRows: z.number().int().nonnegative(),
    notices: z.array(workspaceNoticeSchema),
    actions: z.array(workspaceActionSchema),
  })
  .superRefine((workspace, context) => {
    const unique = (values: string[]): boolean => new Set(values).size === values.length;
    const duplicateIssue = (path: string, values: string[]): void => {
      if (!unique(values)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: `${path} identifiers must be unique`,
        });
      }
    };

    duplicateIssue(
      'metrics',
      workspace.metrics.map((metric) => metric.key),
    );
    duplicateIssue(
      'columns',
      workspace.columns.map((column) => column.key),
    );
    duplicateIssue(
      'rows',
      workspace.rows.map((row) => row.id),
    );
    duplicateIssue(
      'notices',
      workspace.notices.map((notice) => notice.id),
    );
    duplicateIssue(
      'actions',
      workspace.actions.map((action) => action.id),
    );

    const expectedKeys = workspace.columns.map((column) => column.key).sort();
    workspace.rows.forEach((row, rowIndex) => {
      const actualKeys = Object.keys(row.values).sort();
      if (actualKeys.join('\0') !== expectedKeys.join('\0')) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rows', rowIndex, 'values'],
          message: 'row values must match the declared column keys exactly',
        });
        return;
      }

      workspace.columns.forEach((column) => {
        const value = row.values[column.key];
        const valid =
          value === null ||
          (column.type === 'number' && typeof value === 'number') ||
          (column.type === 'text' && typeof value === 'string') ||
          (column.type === 'status' && ['string', 'boolean'].includes(typeof value)) ||
          (column.type === 'datetime' &&
            typeof value === 'string' &&
            z.string().datetime().safeParse(value).success);
        if (!valid) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rows', rowIndex, 'values', column.key],
            message: `cell does not match column type ${column.type}`,
          });
        }
      });
    });
  });
export type WorkspaceDto = z.infer<typeof workspaceSchema>;
