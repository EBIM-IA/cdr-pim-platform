import { describe, expect, it } from 'vitest';

import { JobType, axBatchReceivedPayloadSchema, jobEnvelopeSchema } from './job-envelope';

const valid = {
  schemaVersion: 1,
  jobId: '11111111-1111-4111-8111-111111111111',
  type: JobType.SKELETON_PING,
  correlationId: 'abc',
  idempotencyKey: 'skeleton:1',
  occurredAt: '2026-08-30T10:00:00.000Z',
  source: 'api',
  payload: { message: 'hola' },
};

describe('jobEnvelopeSchema', () => {
  it('accepts a well-formed envelope', () => {
    expect(jobEnvelopeSchema.parse(valid)).toMatchObject({ type: 'SKELETON_PING' });
  });

  it('rejects an unknown job type instead of silently passing it to a worker', () => {
    expect(() => jobEnvelopeSchema.parse({ ...valid, type: 'DROP_DATABASE' })).toThrow();
  });

  it('rejects a future envelope version', () => {
    expect(() => jobEnvelopeSchema.parse({ ...valid, schemaVersion: 2 })).toThrow();
  });

  it('requires an idempotency key, since SQS delivery is at-least-once', () => {
    const { idempotencyKey: _omitted, ...withoutKey } = valid;
    expect(() => jobEnvelopeSchema.parse(withoutKey)).toThrow();
  });
});

describe('axBatchReceivedPayloadSchema', () => {
  const payload = {
    idLote: 'AX-20260928-000001',
    sistemaOrigen: 'SISMETIC_AX',
    registrosRecibidos: 2,
    fechaEnvio: '2026-09-28T15:30:00Z',
    fechaRecepcion: '2026-09-28T15:30:01.000Z',
    requestHash: `sha256:${'a'.repeat(64)}`,
  };

  it('accepts batch metadata', () => {
    expect(axBatchReceivedPayloadSchema.parse(payload)).toEqual(payload);
    expect(
      jobEnvelopeSchema.parse({ ...valid, type: JobType.AX_BATCH_RECEIVED, payload }),
    ).toMatchObject({ type: 'AX_BATCH_RECEIVED' });
  });

  it('refuses to carry the products themselves', () => {
    expect(() =>
      axBatchReceivedPayloadSchema.parse({ ...payload, productos: [{ codigoArticulo: '1' }] }),
    ).toThrow();
  });

  it('requires a sha256-prefixed request hash', () => {
    expect(() => axBatchReceivedPayloadSchema.parse({ ...payload, requestHash: 'abc' })).toThrow();
  });
});
