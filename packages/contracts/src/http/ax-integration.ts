import { z } from 'zod';

/**
 * Sismetic / Microsoft Dynamics AX → CDR PIM — contract v1.1 (PUSH, REST batch).
 *
 * ── TEMPORARY QAS MOCK ──────────────────────────────────────────────────────────────
 * This schema validates the envelope Sismetic sends to
 * `POST /api/v1/productos/sincronizar`. In this phase the PIM only RECEIVES the batch:
 * nothing is persisted, no product is created or updated, there is no idempotency and no
 * status endpoint. The decisions that need a database (codigoArticulo mapping, null
 * semantics, stale rule, provenance) are listed in docs/integrations/ax/NEXT_DB_PHASE.md
 * and deliberately NOT encoded here.
 *
 * Field names are Spanish because they are the contract delivered to Sismetic — never
 * rename them. Every object is `.strict()`: an unknown field (e.g. a future `atributosErp`)
 * is rejected rather than silently dropped, so an extension is always a visible change.
 */

/** The contractual route, relative to `API_PREFIX`. Part of the Sismetic contract. */
export const AX_SYNC_ROUTE = {
  controller: 'productos',
  action: 'sincronizar',
} as const;
export const AX_SYNC_PATH = `/${AX_SYNC_ROUTE.controller}/${AX_SYNC_ROUTE.action}` as const;

/**
 * Technical bound, not a contractual one: the job envelope caps `idempotencyKey` at 200
 * characters and the mock derives it as `ax-batch-received:<idLote>`. P-01 (format and
 * uniqueness of idLote) is still open.
 */
export const AX_ID_LOTE_MAX_LENGTH = 128;

/** ISO-8601 date-time with `Z` or an explicit offset (AX may send `-05:00`). */
const isoDateTime = z.string().datetime({ offset: true });

/**
 * A required code. Validated, never transformed: no trim, no case change, no numeric
 * coercion — `"000123"` must stay `"000123"`. Blank values are rejected.
 */
const notBlank = (value: string): boolean => value.trim().length > 0;
const requiredCode = z.string().min(1).refine(notBlank, { message: 'must not be blank' });

/**
 * An optional field. `null` is accepted and treated exactly like an absent field in this
 * mock, because the final absent/null/empty semantics (P-08) are not decided yet and .NET
 * serializers emit `null` by default. Nothing is persisted, so nothing is decided here.
 */
const optionalText = z.string().nullable().optional();

export const axProductSchema = z
  .object({
    /** The AX item code. JSON string only — a JSON number is rejected (leading zeros). */
    codigoArticulo: requiredCode,
    codigoProveedor: requiredCode,
    codigoUnificador: optionalText,
    codigoLinea: requiredCode,
    /**
     * Required by v1.1, but P-05 (template-4 exception) is open: the mock accepts its
     * absence and logs a structured warning instead of rejecting the whole batch.
     */
    tipoAplicacion: optionalText,
    /** Same temporary tolerance as `tipoAplicacion`. */
    marca: optionalText,
    /** Not used for stale detection yet (P-03). */
    fechaModificacion: isoDateTime.nullable().optional(),
  })
  .strict();
export type AxProduct = z.infer<typeof axProductSchema>;

export const axSyncRequestSchema = z
  .object({
    idLote: z
      .string()
      .min(1)
      .max(AX_ID_LOTE_MAX_LENGTH)
      .refine(notBlank, { message: 'must not be blank' }),
    fechaEnvio: isoDateTime,
    sistemaOrigen: optionalText,
    /** At least one product. No contractual maximum yet (P-02): the body limit applies. */
    productos: z.array(axProductSchema).min(1),
  })
  .strict();
export type AxSyncRequest = z.infer<typeof axSyncRequestSchema>;

/**
 * `RECIBIDO` means "the API validated the batch and handed an event to SQS" — NOT that any
 * product was persisted.
 */
export const axSyncStatusSchema = z.enum(['RECIBIDO']);
export type AxSyncStatus = z.infer<typeof axSyncStatusSchema>;

/** 202 Accepted body. Contractual: do not add experimental fields. */
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
