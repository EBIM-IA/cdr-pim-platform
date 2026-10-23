import { DependencyUnavailableError, ValidationError } from '@cdr/shared';
import { InMemoryStorageAdapter } from '@cdr/storage';
import { describe, expect, it, vi } from 'vitest';

import { PlatformAssetStorageAdapter } from './platform-asset-storage.adapter';

describe('PlatformAssetStorageAdapter malware errors', () => {
  it.each([
    new ValidationError('Archivo bloqueado'),
    new DependencyUnavailableError('malware-scanner'),
  ])('preserves scanner domain failures: %s', async (error) => {
    const binary = new InMemoryStorageAdapter();
    vi.spyOn(binary, 'put').mockRejectedValue(error);
    const storage = new PlatformAssetStorageAdapter(binary);
    await expect(
      storage.put({
        key: 'products/test.pdf',
        content: new Uint8Array([1]),
        mimeType: 'application/pdf',
        metadata: {},
      }),
    ).rejects.toBe(error);
  });
});
