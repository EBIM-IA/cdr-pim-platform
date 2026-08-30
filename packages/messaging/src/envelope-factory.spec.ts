import { JobType } from '@cdr/contracts';
import { newExecutionContext, runWithContext } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { buildJobEnvelope } from './envelope-factory';

describe('buildJobEnvelope', () => {
  it('inherits the ambient correlation id so async work stays traceable', () => {
    const context = newExecutionContext('22222222-2222-4222-8222-222222222222');

    const envelope = runWithContext(context, () =>
      buildJobEnvelope({
        type: JobType.AI_EMBEDDING,
        payload: { productId: '33333333-3333-4333-8333-333333333333' },
        source: 'api',
        idempotencyKey: 'embed:33333333',
      }),
    );

    expect(envelope.correlationId).toBe('22222222-2222-4222-8222-222222222222');
    expect(envelope.schemaVersion).toBe(1);
  });

  it('refuses to build an envelope without an idempotency key', () => {
    expect(() =>
      buildJobEnvelope({
        type: JobType.AI_EMBEDDING,
        payload: {},
        source: 'api',
        idempotencyKey: '',
      }),
    ).toThrow();
  });
});
