import { loadWorkerEnv } from '@cdr/config';
import { InMemoryQueueAdapter, type QueueConsumerPort, SqsQueueAdapter } from '@cdr/messaging';
import { createLogger, sanitizeLogText } from '@cdr/shared';

import { startHealthServer } from './health-server';
import { AiEmbeddingHandler } from './handlers/ai-embedding.handler';
import { SkeletonPingHandler } from './handlers/skeleton-ping.handler';
import { JobConsumer } from './runtime/consumer';
import { HandlerRegistry } from './runtime/handler-registry';

async function bootstrap(): Promise<void> {
  const env = loadWorkerEnv();
  const logger = createLogger({
    service: env.SERVICE_NAME,
    environment: env.APP_ENV,
    level: env.LOG_LEVEL,
    pretty: env.APP_ENV === 'local',
  });

  const queue: QueueConsumerPort =
    env.QUEUE_DRIVER === 'sqs'
      ? new SqsQueueAdapter({
          queueUrl: env.SQS_JOBS_QUEUE_URL as string,
          region: env.AWS_REGION,
          ...(env.AWS_ENDPOINT_URL ? { endpoint: env.AWS_ENDPOINT_URL } : {}),
          logger,
        })
      : // Only reachable locally: the configuration schema forbids this driver in qas/prd.
        new InMemoryQueueAdapter();

  const registry = new HandlerRegistry()
    .register(new SkeletonPingHandler())
    .register(new AiEmbeddingHandler());

  const consumer = new JobConsumer(queue, registry, logger, {
    maxMessages: env.QUEUE_MAX_MESSAGES,
    waitTimeSeconds: env.QUEUE_WAIT_TIME_SECONDS,
    visibilityTimeoutSeconds: env.QUEUE_VISIBILITY_TIMEOUT_SECONDS,
    maxHandlerAttempts: env.QUEUE_MAX_HANDLER_ATTEMPTS,
    retryBaseDelayMs: env.QUEUE_RETRY_BASE_DELAY_MS,
  });

  const healthServer = startHealthServer(
    env.WORKER_PORT,
    {
      service: env.SERVICE_NAME,
      version: env.APP_VERSION,
      isRunning: () => consumer.isRunning,
      metrics: () => ({ ...consumer.metrics }),
    },
    logger,
    env.APP_ENV === 'qas' || env.APP_ENV === 'prd' ? '0.0.0.0' : '127.0.0.1',
  );

  logger.info('Worker started', {
    environment: env.APP_ENV,
    version: env.APP_VERSION,
    queueDriver: env.QUEUE_DRIVER,
    jobTypes: registry.registeredTypes,
  });

  await consumer.start();

  /**
   * Graceful shutdown.
   *
   * ECS sends SIGTERM and then waits (30s by default) before SIGKILL. Draining within
   * `SHUTDOWN_TIMEOUT_MS` — set below that window — means an in-flight job finishes and is
   * acknowledged instead of being redelivered to another task.
   */
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutdown signal received; draining', { signal });

    await consumer.stop(env.SHUTDOWN_TIMEOUT_MS);
    await new Promise<void>((resolve) => healthServer.close(() => resolve()));
    if (queue instanceof SqsQueueAdapter) queue.destroy();

    logger.info('Worker stopped cleanly');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((error: unknown) => {
  const summary =
    error instanceof Error
      ? `${error.name}: ${sanitizeLogText(error.message)}`
      : 'Unknown bootstrap error';
  console.error('Fatal error during worker bootstrap:', summary);
  process.exit(1);
});
