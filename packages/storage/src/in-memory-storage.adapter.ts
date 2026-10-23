import type {
  ObjectStorageMaintenancePort,
  StorageObjectIdentity,
  StorageInventoryPage,
} from './object-storage-maintenance.port';
import { createHash } from 'node:crypto';

import { NotFoundError } from '@cdr/shared';

import {
  assertSafeObjectKey,
  type ObjectStoragePort,
  type PutObjectCommand,
  type StoredObject,
} from './object-storage.port';

/** Offline object store for tests and `STORAGE_DRIVER=memory` local runs. */
export class InMemoryStorageAdapter implements ObjectStoragePort, ObjectStorageMaintenancePort {
  private readonly objects = new Map<
    string,
    { object: StoredObject; content: Uint8Array; modifiedAt: Date }
  >();

  constructor(private readonly bucket = 'in-memory') {}

  async put(command: PutObjectCommand): Promise<StoredObject> {
    assertSafeObjectKey(command.key);
    const object: StoredObject = {
      key: command.key,
      bucket: this.bucket,
      mimeType: command.mimeType,
      size: command.content.byteLength,
      checksum: createHash('sha256').update(command.content).digest('base64'),
    };
    this.objects.set(command.key, { object, content: command.content, modifiedAt: new Date() });
    return object;
  }

  async get(key: string): Promise<Uint8Array> {
    assertSafeObjectKey(key);
    const entry = this.objects.get(key);
    if (!entry) throw new NotFoundError('Object', key);
    return entry.content;
  }

  async delete(key: string): Promise<void> {
    assertSafeObjectKey(key);
    this.objects.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    assertSafeObjectKey(key);
    return this.objects.has(key);
  }

  async listPage(input: {
    prefix: string;
    cursor?: string | null;
    limit: number;
  }): Promise<StorageInventoryPage> {
    if (
      !['products/', 'product-catalogs/'].includes(input.prefix) ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 1000
    )
      throw new Error('Invalid maintenance scope');
    const keys = [...this.objects.keys()]
      .filter((key) => key.startsWith(input.prefix) && (!input.cursor || key > input.cursor))
      .sort();
    const selected = keys.slice(0, input.limit);
    return {
      items: selected.map((key) => {
        const entry = this.objects.get(key)!;
        return {
          bucket: this.bucket,
          key,
          identity: `u:${entry.object.checksum}:${entry.modifiedAt.toISOString()}:${entry.object.size}`,
          versionId: null,
          etag: entry.object.checksum,
          modifiedAt: entry.modifiedAt,
          size: entry.object.size,
          deleteMarker: false,
        };
      }),
      nextCursor: keys.length > selected.length ? selected.at(-1)! : null,
    };
  }
  async purgeIdentity(object: StorageObjectIdentity): Promise<'deleted' | 'absent' | 'changed'> {
    assertSafeObjectKey(object.key);
    if (object.bucket !== this.bucket) throw new Error('Maintenance bucket mismatch');
    const entry = this.objects.get(object.key);
    if (!entry) return 'absent';
    if (
      entry.object.checksum !== object.etag ||
      entry.object.size !== object.size ||
      entry.modifiedAt.getTime() !== object.modifiedAt.getTime()
    )
      return 'changed';
    this.objects.delete(object.key);
    return 'deleted';
  }

  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    assertSafeObjectKey(key);
    return `memory://${this.bucket}/${key}?download&ttl=${ttlSeconds}`;
  }

  async presignPut(key: string, ttlSeconds: number, mimeType: string): Promise<string> {
    assertSafeObjectKey(key);
    return `memory://${this.bucket}/${key}?upload&ttl=${ttlSeconds}&type=${encodeURIComponent(mimeType)}`;
  }
}
