import { describe, expect, it } from 'vitest';
import { CryptoCatalogTokenAdapter } from './crypto-catalog-token.adapter';
describe('private catalog tokens', () => {
  it('generates unique 32-byte URL-safe tokens and deterministic SHA256 digests', () => {
    const adapter = new CryptoCatalogTokenAdapter(),
      one = adapter.generate(),
      two = adapter.generate();
    expect(one.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(Buffer.from(one.token, 'base64url')).toHaveLength(32);
    expect(one.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(one.digest).toBe(adapter.digest(one.token));
    expect(one.token).not.toBe(two.token);
    expect(one.digest).not.toContain(one.token);
  });
});
