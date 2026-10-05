import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('GET /healthz', () => {
  it('answers 200 with a minimal, uncacheable body', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});
