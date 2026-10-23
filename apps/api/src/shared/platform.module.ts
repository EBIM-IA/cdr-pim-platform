import { Global, Module } from '@nestjs/common';
import type { ApiEnv } from '@cdr/config';
import { InMemoryQueueAdapter, QUEUE_PORT, SqsQueueAdapter } from '@cdr/messaging';
import type { Logger } from '@cdr/shared';
import {
  ClamavScannerAdapter,
  InMemoryStorageAdapter,
  OBJECT_STORAGE,
  OBJECT_STORAGE_MAINTENANCE,
  type ObjectStoragePort,
  S3StorageAdapter,
  ScanningObjectStorageAdapter,
} from '@cdr/storage';

import { API_ENV, LOGGER } from './tokens';

const RAW_OBJECT_STORAGE = Symbol('RawObjectStorage');

/**
 * Binds the two platform-level outbound ports — queue and object storage — to the adapter
 * selected by configuration.
 *
 * These ports are not owned by any single bounded context (imports, integrations and
 * search all publish jobs), so they are wired once here rather than duplicated per module.
 */
@Global()
@Module({
  providers: [
    {
      provide: QUEUE_PORT,
      inject: [API_ENV, LOGGER],
      useFactory: (env: ApiEnv, logger: Logger) =>
        env.QUEUE_DRIVER === 'sqs'
          ? new SqsQueueAdapter({
              queueUrl: env.SQS_JOBS_QUEUE_URL as string,
              region: env.AWS_REGION,
              ...(env.AWS_ENDPOINT_URL ? { endpoint: env.AWS_ENDPOINT_URL } : {}),
              logger,
            })
          : new InMemoryQueueAdapter(),
    },
    {
      provide: RAW_OBJECT_STORAGE,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) =>
        env.STORAGE_DRIVER === 's3'
          ? new S3StorageAdapter({
              bucket: env.S3_BUCKET_ASSETS as string,
              region: env.AWS_REGION,
              ...(env.AWS_ENDPOINT_URL ? { endpoint: env.AWS_ENDPOINT_URL } : {}),
            })
          : new InMemoryStorageAdapter(),
    },
    {
      provide: OBJECT_STORAGE,
      inject: [RAW_OBJECT_STORAGE, API_ENV],
      useFactory: (storage: ObjectStoragePort, env: ApiEnv) => {
        return env.MALWARE_SCAN_DRIVER === 'clamav'
          ? new ScanningObjectStorageAdapter(
              storage,
              new ClamavScannerAdapter({
                host: env.CLAMAV_HOST as string,
                port: env.CLAMAV_PORT as number,
                timeoutMs: env.CLAMAV_TIMEOUT_MS,
              }),
            )
          : storage;
      },
    },
    {
      provide: OBJECT_STORAGE_MAINTENANCE,
      useExisting: RAW_OBJECT_STORAGE,
    },
  ],
  exports: [QUEUE_PORT, OBJECT_STORAGE, OBJECT_STORAGE_MAINTENANCE],
})
export class PlatformModule {}
