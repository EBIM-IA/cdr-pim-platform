import { z } from 'zod';

import { AX_ID_LOTE_MAX_LENGTH } from '../http/ax-integration';

/**
 * The set of asynchronous jobs the platform knows about.
 *
 * Adding a value here is a deliberate architectural act: it needs a handler in
 * `apps/worker`, a queue in `cdr-pim-infrastructure`, and a DLQ alarm.
 * See `docs/architecture/INTEGRATION_ARCHITECTURE.md`.
 */
export const JobType = {
  /** Reserved for the earlier PULL design (ADR-008). Not used by the PUSH contract v1.1. */
  AX_SYNC: 'AX_SYNC',
  /**
   * TEMPORARY QAS MOCK: an AX batch was received and validated by the API. Carries batch
   * metadata only — never the products — and changes nothing in the database.
   */
  AX_BATCH_RECEIVED: 'AX_BATCH_RECEIVED',
  AI_EMBEDDING: 'AI_EMBEDDING',
  DOCUMENT_EXTRACTION: 'DOCUMENT_EXTRACTION',
  IMPORT_BATCH: 'IMPORT_BATCH',
  CHANNEL_PUBLISH: 'CHANNEL_PUBLISH',
  /** Walking-skeleton probe. Proves API -> QueuePort -> adapter -> worker end to end. */
  SKELETON_PING: 'SKELETON_PING',
} as const;

export type JobType = (typeof JobType)[keyof typeof JobType];

export const jobTypeSchema = z.nativeEnum(JobType);

/**
 * Every message on every queue is wrapped in this envelope.
 *
 * `idempotencyKey` is the contract that makes SQS at-least-once delivery safe: a handler
 * must be able to receive the same key twice and produce the same end state. Handlers that
 * cannot guarantee that must record processed keys themselves.
 */
export const jobEnvelopeSchema = z.object({
  /** Envelope schema version — lets a worker reject a payload it cannot understand. */
  schemaVersion: z.literal(1),
  jobId: z.string().uuid(),
  type: jobTypeSchema,
  /** Propagated from the originating HTTP request, so logs stitch together. */
  correlationId: z.string(),
  idempotencyKey: z.string().min(1).max(200),
  occurredAt: z.string().datetime(),
  /** Producer name, e.g. `api` or `eventbridge:ax-delta-sync`. */
  source: z.string().min(1),
  payload: z.record(z.unknown()),
});

export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;

/** Typed payload schemas, resolved by the worker's handler registry. */
export const skeletonPingPayloadSchema = z.object({
  message: z.string().min(1).max(500),
  productId: z.string().uuid().optional(),
});
export type SkeletonPingPayload = z.infer<typeof skeletonPingPayloadSchema>;

export const aiEmbeddingPayloadSchema = z.object({
  productId: z.string().uuid(),
  /** Forces re-embedding even if a vector for the current model already exists. */
  force: z.boolean().default(false),
});
export type AiEmbeddingPayload = z.infer<typeof aiEmbeddingPayloadSchema>;

/**
 * AX_BATCH_RECEIVED (TEMPORARY QAS MOCK). Metadata of a received batch, deliberately
 * WITHOUT the products: there is no database claim-check yet, and an SQS message is capped
 * at 256 KiB. `requestHash` is a technical trace (SHA-256 of the canonical request), NOT
 * an idempotency guarantee — nothing records it.
 */
export const axBatchReceivedPayloadSchema = z
  .object({
    idLote: z.string().min(1).max(AX_ID_LOTE_MAX_LENGTH),
    sistemaOrigen: z.string().nullable(),
    registrosRecibidos: z.number().int().positive(),
    fechaEnvio: z.string().datetime({ offset: true }),
    fechaRecepcion: z.string().datetime(),
    requestHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  })
  .strict();
export type AxBatchReceivedPayload = z.infer<typeof axBatchReceivedPayloadSchema>;
