import { createHash } from 'node:crypto';

import { NotFoundError } from '@cdr/shared';

import type { ObjectStoragePort, PutObjectCommand, StoredObject } from './object-storage.port';

/** Offline object store for tests and `STORAGE_DRIVER=memory` local runs. */
export class InMemoryStorageAdapter implements ObjectStoragePort {
  private readonly objects = new Map<string, { object: StoredObject; content: Uint8Array }>();

  constructor(private readonly bucket = 'in-memory') {}

  async put(command: PutObjectCommand): Promise<StoredObject> {
    const object: StoredObject = {
      key: command.key,
      bucket: this.bucket,
      mimeType: command.mimeType,
      size: command.content.byteLength,
      checksum: createHash('sha256').update(command.content).digest('base64'),
    };
    this.objects.set(command.key, { object, content: command.content });
    return object;
  }

  async get(key: string): Promise<Uint8Array> {
    const entry = this.objects.get(key);
    if (!entry) throw new NotFoundError('Object', key);
    return entry.content;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    return `memory://${this.bucket}/${key}?download&ttl=${ttlSeconds}`;
  }

  async presignPut(key: string, ttlSeconds: number, mimeType: string): Promise<string> {
    return `memory://${this.bucket}/${key}?upload&ttl=${ttlSeconds}&type=${encodeURIComponent(mimeType)}`;
  }
}
