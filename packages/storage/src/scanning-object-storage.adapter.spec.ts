import { DependencyUnavailableError, ValidationError } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryStorageAdapter } from './in-memory-storage.adapter';
import { ScanningObjectStorageAdapter } from './scanning-object-storage.adapter';

const command = {
  key: 'catalogs/catalog.pdf',
  content: new Uint8Array([1, 2, 3]),
  mimeType: 'application/pdf',
};
describe('ScanningObjectStorageAdapter', () => {
  it('does not store or expose bytes until scanning succeeds', async () => {
    const storage = new InMemoryStorageAdapter();
    let release!: () => void;
    const scan = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const protectedStorage = new ScanningObjectStorageAdapter(storage, { assertClean: scan });
    const content = Uint8Array.from(command.content);
    const writing = protectedStorage.put({ ...command, content });
    expect(await storage.exists(command.key)).toBe(false);
    content.fill(99);
    release();
    await writing;
    expect(scan).toHaveBeenCalledOnce();
    expect(await storage.get(command.key)).toEqual(command.content);
  });
  it.each([
    new ValidationError('Blocked threat'),
    new DependencyUnavailableError('malware-scanner'),
  ])('preserves rejection and never writes when the engine rejects: %s', async (error) => {
    const storage = new InMemoryStorageAdapter();
    const put = vi.spyOn(storage, 'put');
    const protectedStorage = new ScanningObjectStorageAdapter(storage, {
      assertClean: async () => {
        throw error;
      },
    });
    await expect(protectedStorage.put(command)).rejects.toBe(error);
    expect(put).not.toHaveBeenCalled();
    expect(await storage.exists(command.key)).toBe(false);
  });
  it('blocks presigned writes that would bypass scanning and delegates read/delete operations', async () => {
    const storage = new InMemoryStorageAdapter();
    const scan = vi.fn().mockResolvedValue(undefined);
    const protectedStorage = new ScanningObjectStorageAdapter(storage, { assertClean: scan });
    const presignPut = vi.spyOn(storage, 'presignPut');
    await expect(
      protectedStorage.presignPut(command.key, 60, command.mimeType),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(presignPut).not.toHaveBeenCalled();
    await protectedStorage.put(command);
    expect(await protectedStorage.exists(command.key)).toBe(true);
    expect(await protectedStorage.get(command.key)).toEqual(command.content);
    expect(await protectedStorage.presignGet(command.key, 60)).toBe(
      await storage.presignGet(command.key, 60),
    );
    await protectedStorage.delete(command.key);
    expect(await protectedStorage.exists(command.key)).toBe(false);
    expect(scan).toHaveBeenCalledOnce();
  });
});
