import { describe, expect, it } from 'vitest';

import { getCorrelationId, newExecutionContext, runWithContext } from './correlation';

describe('execution context', () => {
  it('propagates the correlation id across async boundaries', async () => {
    const context = newExecutionContext('11111111-1111-4111-8111-111111111111');

    const observed = await runWithContext(context, async () => {
      await Promise.resolve();
      return getCorrelationId();
    });

    expect(observed).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('is undefined outside of a context', () => {
    expect(getCorrelationId()).toBeUndefined();
  });
});
