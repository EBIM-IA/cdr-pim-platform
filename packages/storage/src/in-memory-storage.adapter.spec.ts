import { NotFoundError } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { InMemoryStorageAdapter } from './in-memory-storage.adapter';

describe('InMemoryStorageAdapter', () => {
  it('round-trips content and reports a stable checksum', async () => {
    const storage = new InMemoryStorageAdapter('cdr-pim-local-assets');
    const content = new TextEncoder().encode('ficha técnica 6205-2RS');

    const stored = await storage.put({
      key: 'documents/6205-2rs.pdf',
      content,
      mimeType: 'application/pdf',
    });

    expect(stored.size).toBe(content.byteLength);
    expect(stored.checksum).toHaveLength(44);
    expect(await storage.get('documents/6205-2rs.pdf')).toEqual(content);
  });

  it('raises a domain NotFoundError for an unknown key', async () => {
    const storage = new InMemoryStorageAdapter();
    await expect(storage.get('missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each(['../secret', '/absolute/key', 'products//asset.pdf', 'products/./asset.pdf'])(
    'rejects unsafe object key %s',
    async (key) => {
      const storage = new InMemoryStorageAdapter();
      await expect(
        storage.put({ key, content: new Uint8Array([1]), mimeType: 'application/pdf' }),
      ).rejects.toThrow('Unsafe object storage key');
    },
  );
});
