import { z } from 'zod';

/**
 * Draft transport contract for the local Dynamics AX / Sismetic push simulator.
 *
 * The `mock` route and `draft-0` discriminator are intentional: Casa del Ruliman has not
 * approved the real AX surface, authentication or mapping yet. Nothing in this contract is
 * presented as the production AX API.
 */
export const AX_MOCK_SCHEMA_VERSION = 'draft-0' as const;
export const AX_MOCK_MAX_RECORDS = 100;
/**
 * Maximum number of UTF-16 code units across every string value in one request.
 *
 * With 100 records and every optional key present, the fixed compact-JSON structure is at
 * most 22,257 bytes. JSON escaping needs at most six ASCII bytes per UTF-16 code unit, so
 * this limit keeps the compact representation below 94,257 bytes — safely inside the API's
 * 100 KiB parser ceiling. The raw schema enforces this before trimming so whitespace cannot
 * bypass the bound.
 */
export const AX_MOCK_MAX_TOTAL_TEXT_LENGTH = 12_000;

const rawOptionalText = (max: number) => z.string().max(max).nullable().optional();
const optionalText = (max: number) => z.string().max(max).trim().nullable().optional();

const rawAxMockRecordSchema = z
  .object({
    recordId: rawOptionalText(120),
    codigoArticulo: rawOptionalText(64),
    codigoProveedor: rawOptionalText(120),
    codigoUnificador: rawOptionalText(200),
    linea: rawOptionalText(200),
    tipoAplicacion: rawOptionalText(200),
    marca: rawOptionalText(120),
    categoriaNivel1: rawOptionalText(200),
    categoriaNivel2: rawOptionalText(200),
    categoriaNivel3: rawOptionalText(200),
    modifiedAt: z.string().datetime().nullable().optional(),
  })
  .strict();

export const axMockRecordSchema = z
  .object({
    recordId: optionalText(120),
    // Optional at the transport boundary so a bad row can be reported without rejecting the
    // whole batch. The mock application service marks an absent/blank value as rejected.
    codigoArticulo: optionalText(64),
    codigoProveedor: optionalText(120),
    codigoUnificador: optionalText(200),
    linea: optionalText(200),
    tipoAplicacion: optionalText(200),
    marca: optionalText(120),
    categoriaNivel1: optionalText(200),
    categoriaNivel2: optionalText(200),
    categoriaNivel3: optionalText(200),
    modifiedAt: z.string().datetime().nullable().optional(),
  })
  .strict();
export type AxMockRecordInput = z.infer<typeof axMockRecordSchema>;

const canonicalReceiveAxMockBatchSchema = z
  .object({
    schemaVersion: z.literal(AX_MOCK_SCHEMA_VERSION),
    batchId: z.string().trim().min(1).max(120),
    sentAt: z.string().datetime(),
    records: z.array(axMockRecordSchema).min(1).max(AX_MOCK_MAX_RECORDS),
  })
  .strict();

export const receiveAxMockBatchSchema = z
  .object({
    schemaVersion: z.literal(AX_MOCK_SCHEMA_VERSION),
    batchId: z.string().min(1).max(120),
    sentAt: z.string().datetime(),
    records: z.array(rawAxMockRecordSchema).min(1).max(AX_MOCK_MAX_RECORDS),
  })
  .strict()
  .superRefine((batch, context) => {
    const totalTextLength = countTextCodeUnits(batch);
    if (totalTextLength > AX_MOCK_MAX_TOTAL_TEXT_LENGTH) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['records'],
        message: `Batch text exceeds the ${AX_MOCK_MAX_TOTAL_TEXT_LENGTH} character limit`,
      });
    }
  })
  .pipe(canonicalReceiveAxMockBatchSchema);
export type ReceiveAxMockBatchInput = z.infer<typeof receiveAxMockBatchSchema>;

export const axMockIdempotencyKeySchema = z.string().trim().min(8).max(200);
export const axMockBatchIdSchema = z.string().trim().min(1).max(120);

export const axMockRecordIssueSchema = z.object({
  code: z.string().min(1).max(80),
  severity: z.enum(['warning', 'error']),
  field: z.string().min(1).max(120).nullable(),
  message: z.string().min(1).max(1_000),
  retryable: z.boolean(),
});
export type AxMockRecordIssueDto = z.infer<typeof axMockRecordIssueSchema>;

export const axMockRecordResultSchema = z.object({
  rowNumber: z.number().int().positive(),
  recordId: z.string().nullable(),
  codigoArticulo: z.string().nullable(),
  status: z.enum(['accepted', 'warning', 'rejected']),
  issues: z.array(axMockRecordIssueSchema),
});
export type AxMockRecordResultDto = z.infer<typeof axMockRecordResultSchema>;

export const axMockBatchStatusSchema = z.enum(['processed', 'partially_processed', 'rejected']);
export type AxMockBatchStatus = z.infer<typeof axMockBatchStatusSchema>;

export const axMockBatchSchema = z
  .object({
    schemaVersion: z.literal(AX_MOCK_SCHEMA_VERSION),
    batchId: z.string().min(1).max(120),
    sentAt: z.string().datetime(),
    receivedAt: z.string().datetime(),
    status: axMockBatchStatusSchema,
    totals: z.object({
      received: z.number().int().positive(),
      accepted: z.number().int().nonnegative(),
      warnings: z.number().int().nonnegative(),
      rejected: z.number().int().nonnegative(),
    }),
    records: z.array(axMockRecordResultSchema).max(AX_MOCK_MAX_RECORDS),
    correlationId: z.string().min(1),
  })
  .superRefine((batch, context) => {
    const statusCounts = { accepted: 0, warning: 0, rejected: 0 };
    for (const [index, record] of batch.records.entries()) {
      statusCounts[record.status] += 1;
      addInvariantIssue(context, record.rowNumber === index + 1, ['records', index, 'rowNumber']);
    }

    addInvariantIssue(context, batch.totals.received === batch.records.length, [
      'totals',
      'received',
    ]);
    addInvariantIssue(context, batch.totals.accepted === statusCounts.accepted, [
      'totals',
      'accepted',
    ]);
    addInvariantIssue(context, batch.totals.warnings === statusCounts.warning, [
      'totals',
      'warnings',
    ]);
    addInvariantIssue(context, batch.totals.rejected === statusCounts.rejected, [
      'totals',
      'rejected',
    ]);

    const expectedStatus =
      statusCounts.rejected === batch.records.length
        ? 'rejected'
        : statusCounts.rejected > 0
          ? 'partially_processed'
          : 'processed';
    addInvariantIssue(context, batch.status === expectedStatus, ['status']);
  });
export type AxMockBatchDto = z.infer<typeof axMockBatchSchema>;

function countTextCodeUnits(value: unknown): number {
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) {
    return value.reduce<number>((total, item) => total + countTextCodeUnits(item), 0);
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value).reduce<number>(
      (total, item) => total + countTextCodeUnits(item),
      0,
    );
  }
  return 0;
}

function addInvariantIssue(
  context: z.RefinementCtx,
  invariantHolds: boolean,
  path: Array<string | number>,
): void {
  if (invariantHolds) return;
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message: 'AX mock batch totals, records and status must be coherent',
  });
}

/**
 * Sismetic / Microsoft Dynamics AX -> CDR PIM inbound contract v1.1.
 *
 * This is intentionally separate from the local `draft-0` simulator above. The production
 * direction is now confirmed as one-way: AX sends product information and the PIM receives
 * it. Persisting the inbox does not yet decide how each AX field updates the master catalog.
 */
export const AX_SYNC_ROUTE = {
  controller: 'productos',
  action: 'sincronizar',
} as const;
export const AX_SYNC_PATH = `/${AX_SYNC_ROUTE.controller}/${AX_SYNC_ROUTE.action}` as const;
export const AX_SYNC_STATUS_ROUTE = 'sincronizaciones' as const;
export const AX_ID_LOTE_MAX_LENGTH = 128;
const isNotBlank = (value: string): boolean => value.trim().length > 0;
export const axBatchIdSchema = z.string().min(1).max(AX_ID_LOTE_MAX_LENGTH).refine(isNotBlank, {
  message: 'must not be blank',
});

const axIsoDateTime = z.string().datetime({ offset: true });
const axRequiredCode = z.string().min(1).refine(isNotBlank, { message: 'must not be blank' });
const axOptionalText = z.string().nullable().optional();

export const axProductSchema = z
  .object({
    codigoArticulo: axRequiredCode,
    codigoProveedor: axRequiredCode,
    codigoUnificador: axOptionalText,
    codigoLinea: axRequiredCode,
    tipoAplicacion: axOptionalText,
    marca: axOptionalText,
    fechaModificacion: axIsoDateTime.nullable().optional(),
  })
  .strict();
export type AxProduct = z.infer<typeof axProductSchema>;

export const axSyncRequestSchema = z
  .object({
    idLote: axBatchIdSchema,
    fechaEnvio: axIsoDateTime,
    sistemaOrigen: axOptionalText,
    productos: z.array(axProductSchema).min(1),
  })
  .strict();
export type AxSyncRequest = z.infer<typeof axSyncRequestSchema>;

export const axSyncStatusSchema = z.enum(['RECIBIDO']);
export type AxSyncStatus = z.infer<typeof axSyncStatusSchema>;

export const axSyncAcceptedResponseSchema = z
  .object({
    idLote: z.string(),
    estado: axSyncStatusSchema,
    registrosRecibidos: z.number().int().positive(),
    fechaRecepcion: z.string().datetime(),
    correlationId: z.string(),
  })
  .strict();
export type AxSyncAcceptedResponse = z.infer<typeof axSyncAcceptedResponseSchema>;

export const axSyncBatchStatusResponseSchema = axSyncAcceptedResponseSchema.extend({
  fechaEnvio: axIsoDateTime,
  sistemaOrigen: z.string().nullable(),
  requestHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});
export type AxSyncBatchStatusResponse = z.infer<typeof axSyncBatchStatusResponseSchema>;
