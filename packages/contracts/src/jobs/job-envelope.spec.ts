import { describe, expect, it } from 'vitest';

import { JobType, jobEnvelopeSchema } from './job-envelope';

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
