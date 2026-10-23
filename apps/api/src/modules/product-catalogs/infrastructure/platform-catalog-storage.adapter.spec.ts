import { DependencyUnavailableError, ValidationError } from '@cdr/shared';
import { InMemoryStorageAdapter } from '@cdr/storage';
import { describe, expect, it, vi } from 'vitest';

import { PlatformCatalogStorageAdapter } from './platform-catalog-storage.adapter';

describe('PlatformCatalogStorageAdapter error semantics', () => {
  it.each([
    new ValidationError('Archivo bloqueado'),
    new DependencyUnavailableError('malware-scanner'),
  ])('preserves antimalware domain failures without changing their status: %s', async (error) => {
    const binary = new InMemoryStorageAdapter();
    vi.spyOn(binary, 'put').mockRejectedValue(error);
    const storage = new PlatformCatalogStorageAdapter(binary);
    await expect(storage.put('catalogs/test.pdf', new Uint8Array([1]))).rejects.toBe(error);
  });
  it('wraps only unknown storage failures and delegates existence checks', async () => {
    const binary = new InMemoryStorageAdapter();
    const storage = new PlatformCatalogStorageAdapter(binary);
    expect(await storage.exists('catalogs/test.pdf')).toBe(false);
    vi.spyOn(binary, 'put').mockRejectedValue(new Error('vendor-specific error'));
    await expect(storage.put('catalogs/test.pdf', new Uint8Array([1]))).rejects.toBeInstanceOf(
      DependencyUnavailableError,
    );
  });
});
