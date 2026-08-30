import { Global, Module } from '@nestjs/common';
import type { ApiEnv } from '@cdr/config';
import { InMemoryQueueAdapter, QUEUE_PORT, SqsQueueAdapter } from '@cdr/messaging';
import type { Logger } from '@cdr/shared';
import { InMemoryStorageAdapter, OBJECT_STORAGE, S3StorageAdapter } from '@cdr/storage';

import { API_ENV, LOGGER } from './tokens';

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
      provide: OBJECT_STORAGE,
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
  ],
  exports: [QUEUE_PORT, OBJECT_STORAGE],
})
export class PlatformModule {}
