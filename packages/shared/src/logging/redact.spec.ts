import { describe, expect, it } from 'vitest';

import { REDACTED, redact, sanitizeLogText } from './redact';

describe('redact', () => {
  it('masks sensitive keys at any depth', () => {
    const input = {
      user: 'jdoe',
      password: 'hunter2',
      nested: { apiKey: 'sk-live-123', OPENAI_API_KEY: 'sk-x', keep: 1 },
      list: [{ authorization: 'Bearer abc' }],
    };

    expect(redact(input)).toEqual({
      user: 'jdoe',
      password: REDACTED,
      nested: { apiKey: REDACTED, OPENAI_API_KEY: REDACTED, keep: 1 },
      list: [{ authorization: REDACTED }],
    });
  });

  it('masks the variants actually used by this platform', () => {
    const input = {
      DATABASE_PASSWORD: 'x',
      refreshToken: 'x',
      vpn_psk: 'x',
      privateKey: 'x',
      sessionId: 'x',
    };
    for (const value of Object.values(redact(input) as Record<string, unknown>)) {
      expect(value).toBe(REDACTED);
    }
  });

  it('serialises Errors and Dates instead of dropping them', () => {
    const result = redact({ at: new Date('2026-01-01T00:00:00Z'), boom: new Error('nope') }) as {
      at: string;
      boom: { name: string; message: string };
    };
    expect(result.at).toBe('2026-01-01T00:00:00.000Z');
    expect(result.boom.message).toBe('nope');
  });

  it('scrubs credentials embedded in free-form errors and stacks', () => {
    const cause = new Error('Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature');
    const error = new Error(
      'connection to postgres://cdr:super-secret@db.internal:5432/pim failed?token=abc123',
      { cause },
    );
    const result = redact({ error, path: '/callback?access_token=visible' }) as {
      error: { message: string; stack: string; cause: { message: string } };
      path: string;
    };

    expect(JSON.stringify(result)).not.toContain('super-secret');
    expect(JSON.stringify(result)).not.toContain('abc123');
    expect(JSON.stringify(result)).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(result.error.message).toContain(REDACTED);
    expect(result.path).toContain(REDACTED);
  });

  it('scrubs common vendor key formats in log messages', () => {
    expect(sanitizeLogText('OpenAI failed for sk-live_1234567890')).toBe(
      `OpenAI failed for ${REDACTED}`,
    );
  });

  it('does not recurse forever on cyclic structures', () => {
    const cyclic: Record<string, unknown> = { name: 'loop' };
    cyclic.self = cyclic;
    expect(() => JSON.stringify(redact(cyclic))).not.toThrow();
  });
});
