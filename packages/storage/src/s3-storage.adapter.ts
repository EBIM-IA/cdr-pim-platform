import { S3StorageMaintenanceAdapter } from './s3-storage-maintenance.adapter';
import type {
  ObjectStorageMaintenancePort,
  StorageObjectIdentity,
} from './object-storage-maintenance.port';
import { createHash } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand as S3PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DependencyUnavailableError, NotFoundError } from '@cdr/shared';

import {
  assertSafeObjectKey,
  type ObjectStoragePort,
  type PutObjectCommand,
  type StoredObject,
} from './object-storage.port';

export interface S3StorageOptions {
  readonly bucket: string;
  readonly region: string;
  /** LocalStack only; must be undefined in QAS/PRD. */
  readonly endpoint?: string;
}

/**
 * Amazon S3 adapter.
 *
 * Server-side encryption is requested explicitly on every write in addition to the
 * bucket's default encryption — defence in depth, so an object is never stored in the
 * clear even if the bucket policy is later changed by mistake.
 */
export class S3StorageAdapter implements ObjectStoragePort, ObjectStorageMaintenancePort {
  private readonly client: S3Client;
  private readonly maintenance: S3StorageMaintenanceAdapter;

  constructor(private readonly options: S3StorageOptions) {
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint
        ? // LocalStack does not support virtual-hosted-style addressing by default.
          { endpoint: options.endpoint, forcePathStyle: true }
        : {}),
    });
    this.maintenance = new S3StorageMaintenanceAdapter(options, this.client);
  }

  async put(command: PutObjectCommand): Promise<StoredObject> {
    assertSafeObjectKey(command.key);
    const checksum = createHash('sha256').update(command.content).digest('base64');
    try {
      const response = await this.client.send(
        new S3PutObjectCommand({
          Bucket: this.options.bucket,
          Key: command.key,
          Body: command.content,
          ContentType: command.mimeType,
          ChecksumSHA256: checksum,
          ServerSideEncryption: 'AES256',
          ...(command.metadata ? { Metadata: { ...command.metadata } } : {}),
        }),
      );

      return {
        key: command.key,
        bucket: this.options.bucket,
        mimeType: command.mimeType,
        size: command.content.byteLength,
        checksum,
        ...(response.VersionId ? { versionId: response.VersionId } : {}),
      };
    } catch (error) {
      throw new DependencyUnavailableError('s3:putObject', error);
    }
  }

  async get(key: string): Promise<Uint8Array> {
    assertSafeObjectKey(key);
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
      );
      if (!response.Body) throw new NotFoundError('Object', key);
      return await response.Body.transformToByteArray();
    } catch (error) {
      if (isNotFound(error)) throw new NotFoundError('Object', key);
      throw new DependencyUnavailableError('s3:getObject', error);
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeObjectKey(key);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }));
    } catch (error) {
      throw new DependencyUnavailableError('s3:deleteObject', error);
    }
  }

  async exists(key: string): Promise<boolean> {
    assertSafeObjectKey(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(10000),
      });
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw new DependencyUnavailableError('s3:headObject', error);
    }
  }

  presignGet(key: string, ttlSeconds: number): Promise<string> {
    assertSafeObjectKey(key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }

  presignPut(key: string, ttlSeconds: number, mimeType: string): Promise<string> {
    assertSafeObjectKey(key);
    return getSignedUrl(
      this.client,
      new S3PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        ContentType: mimeType,
        ServerSideEncryption: 'AES256',
      }),
      { expiresIn: ttlSeconds },
    );
  }

  listPage(input: { prefix: string; cursor?: string | null; limit: number }) {
    return this.maintenance.listPage(input);
  }

  purgeIdentity(object: StorageObjectIdentity) {
    return this.maintenance.purgeIdentity(object);
  }

  destroy(): void {
    this.maintenance.destroy();
    this.client.destroy();
  }
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string }).name;
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}
