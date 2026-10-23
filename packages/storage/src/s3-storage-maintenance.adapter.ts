import {
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { DependencyUnavailableError, ValidationError } from '@cdr/shared';
import type { S3StorageOptions } from './s3-storage.adapter';
import { assertSafeObjectKey } from './object-storage.port';
import type {
  ObjectStorageMaintenancePort,
  StorageInventoryPage,
  StorageObjectIdentity,
} from './object-storage-maintenance.port';

interface InventoryCursor {
  readonly mode: 'versions' | 'objects';
  readonly key?: string;
  readonly version?: string;
  readonly continuation?: string;
}
export class S3StorageMaintenanceAdapter implements ObjectStorageMaintenancePort {
  private readonly client: S3Client;
  private readonly ownsClient: boolean;
  constructor(
    private readonly options: S3StorageOptions,
    client?: S3Client,
  ) {
    this.ownsClient = !client;
    this.client =
      client ??
      new S3Client({
        maxAttempts: 2,
        requestHandler: {
          connectionTimeout: 3000,
          requestTimeout: 10000,
          throwOnRequestTimeout: true,
        },
        region: options.region,
        ...(options.endpoint ? { endpoint: options.endpoint, forcePathStyle: true } : {}),
      });
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
      throw new ValidationError('Invalid maintenance inventory scope');
    try {
      const versioning = await this.client.send(
        new GetBucketVersioningCommand({ Bucket: this.options.bucket }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
      const mode =
        versioning.Status === 'Enabled' || versioning.Status === 'Suspended'
          ? 'versions'
          : 'objects';
      const recordedCursor = readCursor(input.cursor);
      const cursor = recordedCursor?.mode === mode ? recordedCursor : null;
      if (mode === 'versions') {
        const page = await this.client.send(
          new ListObjectVersionsCommand({
            Bucket: this.options.bucket,
            Prefix: input.prefix,
            MaxKeys: input.limit,
            KeyMarker: cursor?.key,
            VersionIdMarker: cursor?.version,
          }),
          { abortSignal: AbortSignal.timeout(10000) },
        );
        const items: StorageObjectIdentity[] = [];
        for (const version of page.Versions ?? [])
          if (version.Key && version.VersionId && version.LastModified && version.ETag)
            items.push({
              bucket: this.options.bucket,
              key: version.Key,
              identity: `v:${version.VersionId}`,
              versionId: version.VersionId,
              etag: version.ETag,
              modifiedAt: version.LastModified,
              size: version.Size ?? 0,
              deleteMarker: false,
            });
        for (const marker of page.DeleteMarkers ?? [])
          if (marker.Key && marker.VersionId && marker.LastModified)
            items.push({
              bucket: this.options.bucket,
              key: marker.Key,
              identity: `v:${marker.VersionId}`,
              versionId: marker.VersionId,
              etag: null,
              modifiedAt: marker.LastModified,
              size: 0,
              deleteMarker: true,
            });
        return {
          items,
          nextCursor: page.IsTruncated
            ? writeCursor({ mode, key: page.NextKeyMarker, version: page.NextVersionIdMarker })
            : null,
        };
      }
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.options.bucket,
          Prefix: input.prefix,
          MaxKeys: input.limit,
          ContinuationToken: cursor?.continuation,
        }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
      const items: StorageObjectIdentity[] = [];
      for (const object of page.Contents ?? [])
        if (object.Key && object.LastModified && object.ETag)
          items.push({
            bucket: this.options.bucket,
            key: object.Key,
            identity: `u:${object.ETag}:${object.LastModified.toISOString()}:${object.Size ?? 0}`,
            versionId: null,
            etag: object.ETag,
            modifiedAt: object.LastModified,
            size: object.Size ?? 0,
            deleteMarker: false,
          });
      return {
        items,
        nextCursor: page.IsTruncated
          ? writeCursor({ mode, continuation: page.NextContinuationToken })
          : null,
      };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new DependencyUnavailableError('s3:maintenance-inventory', error);
    }
  }
  async purgeIdentity(object: StorageObjectIdentity): Promise<'deleted' | 'absent' | 'changed'> {
    assertSafeObjectKey(object.key);
    if (object.bucket !== this.options.bucket)
      throw new ValidationError('Maintenance bucket mismatch');
    try {
      if (!object.versionId) {
        const versioning = await this.client.send(
          new GetBucketVersioningCommand({ Bucket: this.options.bucket }),
          { abortSignal: AbortSignal.timeout(10000) },
        );
        if (versioning.Status === 'Enabled' || versioning.Status === 'Suspended') return 'changed';
      }
      if (!object.deleteMarker) {
        let head;
        try {
          head = await this.client.send(
            new HeadObjectCommand({
              Bucket: object.bucket,
              Key: object.key,
              ...(object.versionId ? { VersionId: object.versionId } : {}),
            }),
            { abortSignal: AbortSignal.timeout(10000) },
          );
        } catch (error) {
          if (missing(error)) return 'absent';
          throw error;
        }
        if (
          head.ETag !== object.etag ||
          head.ContentLength !== object.size ||
          head.LastModified?.getTime() !== object.modifiedAt.getTime()
        )
          return 'changed';
      }
      // A version id removes bytes/markers physically; omitting it on a versioned bucket
      // would merely create another delete marker and falsely report reclaimed storage.
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: object.bucket,
          Key: object.key,
          ...(object.versionId ? { VersionId: object.versionId } : {}),
          ...(object.etag ? { IfMatch: object.etag } : {}),
        }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
      return 'deleted';
    } catch (error) {
      if (missing(error)) return 'absent';
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412)
        return 'changed';
      throw new DependencyUnavailableError('s3:maintenance-delete', error);
    }
  }
  destroy(): void {
    if (this.ownsClient) this.client.destroy();
  }
}
function missing(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    ['NotFound', 'NoSuchKey', 'NoSuchVersion'].includes(e.name ?? '') ||
    e.$metadata?.httpStatusCode === 404
  );
}
function writeCursor(cursor: InventoryCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}
function readCursor(value: string | null | undefined): InventoryCursor | null {
  if (!value) return null;
  try {
    const cursor: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!cursor || typeof cursor !== 'object') throw new Error();
    const c = cursor as InventoryCursor;
    if (
      !['objects', 'versions'].includes(c.mode) ||
      [c.key, c.version, c.continuation].some((v) => v !== undefined && typeof v !== 'string')
    )
      throw new Error();
    return c;
  } catch {
    throw new ValidationError('Invalid maintenance cursor');
  }
}
