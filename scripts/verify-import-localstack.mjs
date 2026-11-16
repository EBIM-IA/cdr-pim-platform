// Explicit local-only acceptance check: PostgreSQL + LocalStack SQS + compiled worker.
// TEST_DATABASE_URL must target an isolated test database; no production endpoints allowed.
// Add --retry to check actual broker redelivery after a busy confirmation lease.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = process.cwd();
const api = createRequire(pathToFileURL(resolve(root, 'apps/api/package.json')));
const worker = createRequire(pathToFileURL(resolve(root, 'apps/worker/package.json')));
const retry = process.argv.includes('--retry');
assert(
  process.argv.slice(2).every((argument) => argument === '--retry'),
  'Usage: node scripts/verify-import-localstack.mjs [--retry]',
);
const visibilitySeconds = retry ? 4 : 120;
const databaseUrl = process.env.TEST_DATABASE_URL;
const endpoint = process.env.LOCALSTACK_ENDPOINT;
if (!databaseUrl || !endpoint)
  throw new Error('TEST_DATABASE_URL and LOCALSTACK_ENDPOINT are required.');
const databaseAddress = new URL(databaseUrl),
  brokerAddress = new URL(endpoint);
const local = new Set(['127.0.0.1', 'localhost', '[::1]']);
if (
  !local.has(databaseAddress.hostname) ||
  !/(^|[_-])test([_-]|$)/i.test(databaseAddress.pathname) ||
  !local.has(brokerAddress.hostname)
)
  throw new Error('This check permits local test databases and LocalStack only.');
const { SQSClient, CreateQueueCommand, DeleteQueueCommand, ReceiveMessageCommand } =
  api('@aws-sdk/client-sqs');
const { jobEnvelopeSchema } = api('@cdr/contracts');
const { createDatabase } = api('./dist/database/drizzle.client.js');
const { ImportBatch } = api('./dist/modules/imports/domain/entities/import-batch.js');
const { DrizzleImportBatchRepository } = api(
  './dist/modules/imports/infrastructure/persistence/drizzle-import-batch.repository.js',
);
const { DrizzleImportExecutionAdapter } = api(
  './dist/modules/imports/infrastructure/persistence/drizzle-import-execution.adapter.js',
);
const { ImportExecutionUseCases } = api(
  './dist/modules/imports/application/import-execution.use-cases.js',
);
const { DispatchImportExecutionsUseCase } = api(
  './dist/modules/imports/application/dispatch-import-executions.use-case.js',
);
const { ImportBatchHandler } = worker('./dist/handlers/import-batch.handler.js');
const { JobConsumer } = worker('./dist/runtime/consumer.js');
const { HandlerRegistry } = worker('./dist/runtime/handler-registry.js');
const { SqsQueueAdapter } = api('@cdr/messaging');
const { SystemClock, newUuid, createLogger } = api('@cdr/shared');
const client = new SQSClient({
  endpoint,
  region: 'us-east-1',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});
const connection = createDatabase({ url: databaseUrl, poolMax: 3, ssl: false });
const groupId = newUuid();
const groupCode = `SQS-${groupId.slice(0, 8)}`.toUpperCase();
const logger = createLogger({
  service: 'import-localstack-check',
  environment: 'test',
  level: 'error',
});
let queue, handler, batchId, queueUrl;
let publishCount = 0,
  acknowledgeCount = 0;
const releasedDelays = [];
try {
  await connection.sql`INSERT INTO equivalence_groups(id,code,name,kind) VALUES (${groupId},${groupCode},'LocalStack acceptance','interchange')`;
  const batch = ImportBatch.preview(
    {
      target: 'homologs',
      format: 'json',
      idempotencyKey: newUuid(),
      payloadHash: 'local-acceptance',
      categoryCode: null,
      createdBy: 'local-check',
      rows: [1, 2].map((index) => ({
        rowNumber: index,
        valid: true,
        data: {
          unifiedCode: groupCode,
          externalCode: `EXT-${index}`,
          externalBrand: 'SQS-CHECK',
          approvalStatus: 'approved',
        },
        errors: [],
        warnings: [],
      })),
    },
    new Date(),
  );
  batchId = batch.toSnapshot().id;
  const batches = new DrizzleImportBatchRepository(connection.db);
  await batches.savePreview(batch);
  const executions = new DrizzleImportExecutionAdapter(connection.db);
  await new ImportExecutionUseCases(executions, batches, undefined, SystemClock).enqueue(batchId, {
    id: 'local-check',
    email: 'local-check@example.test',
    roles: ['ADMINISTRADOR'],
  });
  const created = await client.send(
    new CreateQueueCommand({ QueueName: `cdr-import-check-${newUuid()}` }),
  );
  queueUrl = created.QueueUrl;
  if (!queueUrl) throw new Error('LocalStack did not return a queue URL.');
  queue = new SqsQueueAdapter({ queueUrl, region: 'us-east-1', endpoint, logger });
  // Observe the real adapter calls without substituting their broker implementation.
  const publish = queue.publish.bind(queue),
    acknowledge = queue.acknowledge.bind(queue),
    release = queue.release.bind(queue);
  queue.publish = async (envelope) => {
    publishCount += 1;
    return publish(envelope);
  };
  queue.acknowledge = async (message) => {
    acknowledgeCount += 1;
    return acknowledge(message);
  };
  queue.release = async (message, delaySeconds) => {
    releasedDelays.push(delaySeconds);
    return release(message, delaySeconds);
  };
  await new DispatchImportExecutionsUseCase(executions, queue, SystemClock).execute();
  handler = new ImportBatchHandler({
    DATABASE_URL: databaseUrl,
    DATABASE_POOL_MAX: 2,
    DATABASE_SSL: false,
    DATABASE_SSL_CA_FILE: undefined,
    // ImportBatchHandler passes 75% of this value to both real database leases.
    QUEUE_VISIBILITY_TIMEOUT_SECONDS: visibilitySeconds,
  });
  const consumer = new JobConsumer(queue, new HandlerRegistry().register(handler), logger, {
    maxMessages: 1,
    waitTimeSeconds: 4,
    visibilityTimeoutSeconds: visibilitySeconds,
    maxHandlerAttempts: 3,
    retryBaseDelayMs: 200,
  });
  async function receive() {
    for (let attempt = 0; attempt < 5; attempt++) {
      if (retry) {
        // QueuePort intentionally hides the broker ID. Read the real SQS MessageId here
        // so a new publication of the same envelope cannot pass as broker redelivery.
        const response = await client.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 4,
            VisibilityTimeout: visibilitySeconds,
            MessageSystemAttributeNames: ['ApproximateReceiveCount'],
          }),
        );
        const message = response.Messages?.[0];
        if (!message) continue;
        assert(message.MessageId, 'The broker must supply a MessageId.');
        assert(message.ReceiptHandle, 'The broker must supply a receipt handle.');
        return {
          messageId: message.MessageId,
          envelope: jobEnvelopeSchema.parse(JSON.parse(message.Body ?? 'null')),
          receiptHandle: message.ReceiptHandle,
          approximateReceiveCount: Number(message.Attributes?.ApproximateReceiveCount ?? '0'),
        };
      }
      const messages = await queue.receive({
        maxMessages: 1,
        waitTimeSeconds: 4,
        visibilityTimeoutSeconds: visibilitySeconds,
      });
      if (messages[0]) return messages[0];
    }
    throw new Error('No message arrived from the durable outbox.');
  }
  const original = await receive();
  let redelivered;
  if (retry) {
    assert.equal(original.approximateReceiveCount, 1, 'The first delivery must be attempt 1.');
    // Leave a real, freshly claimed confirmation in progress, as a synchronous caller
    // would. The worker must defer this conflict, then reclaim it after its 3s lease.
    const confirmation = await batches.claimConfirmation(batchId, {
      actorId: 'local-check',
      correlationId: newUuid(),
      occurredAt: new Date(),
    });
    assert.equal(confirmation.kind, 'claimed', 'The busy confirmation fixture must be claimed.');
  }
  await consumer.processOne(original);
  if (retry) {
    const pending = await executions.get(batchId);
    const [beforeRetry] =
      await connection.sql`SELECT COUNT(*)::int AS count FROM external_homologs WHERE equivalence_group_id=${groupId}`;
    assert.equal(pending?.status, 'processing', 'A busy import must remain recoverable.');
    assert.equal(beforeRetry?.count, 0, 'A busy confirmation must not apply rows.');
    assert.equal(consumer.metrics.retried, 1, 'The busy delivery must request a retry.');
    assert.equal(consumer.metrics.completed, 0, 'The busy delivery must not report success.');
    assert.equal(acknowledgeCount, 0, 'The busy delivery must not be acknowledged.');
    assert(releasedDelays.includes(visibilitySeconds), 'Retry must wait beyond both 3s leases.');
    assert.equal(publishCount, 1, 'Retry must not publish a replacement message.');
    // Long polling waits for the broker visibility deadline; no artificial redelivery
    // or clock manipulation can make this pass.
    redelivered = await receive();
    assert.equal(redelivered.messageId, original.messageId, 'SQS must redeliver the SAME message.');
    assert.equal(redelivered.envelope.jobId, original.envelope.jobId);
    assert.equal(redelivered.approximateReceiveCount, 2, 'Redelivery must be attempt 2.');
    await consumer.processOne(redelivered);
    assert.equal(publishCount, 1, 'Recovery must complete without republishing.');
    assert.equal(acknowledgeCount, 1, 'Only the successful redelivery may be acknowledged.');
  } else {
    // Standard SQS permits duplicate deliveries. Reproduce one through the real broker.
    await queue.publish(original.envelope);
    await consumer.processOne(await receive());
  }
  const persisted = await executions.get(batchId);
  const [relations] =
    await connection.sql`SELECT COUNT(*)::int AS count FROM external_homologs WHERE equivalence_group_id=${groupId}`;
  if (
    persisted?.status !== 'completed' ||
    persisted.processedRows !== 2 ||
    relations?.count !== 2 ||
    consumer.metrics.completed !== (retry ? 1 : 2)
  )
    throw new Error(
      `Acceptance state did not match the import contract: ${JSON.stringify({ status: persisted?.status, error: persisted?.error, processedRows: persisted?.processedRows, relations: relations?.count, consumer: consumer.metrics })}`,
    );
  console.log(
    JSON.stringify({
      transport: 'LocalStack SQS',
      worker: 'IMPORT_BATCH',
      status: persisted.status,
      processedRows: persisted.processedRows,
      relations: relations.count,
      ...(retry
        ? {
            retryDelivery: 'same broker message, recovered after busy lease',
            messageId: original.messageId,
            receiveCount: redelivered.approximateReceiveCount,
            publishedMessages: publishCount,
            acknowledgedMessages: acknowledgeCount,
            consumerRetried: consumer.metrics.retried,
          }
        : { duplicateDelivery: 'idempotent' }),
      consumerCompleted: consumer.metrics.completed,
    }),
  );
} finally {
  await handler?.close();
  queue?.destroy();
  if (queueUrl) await client.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
  client.destroy();
  if (batchId) await connection.sql`DELETE FROM import_batches WHERE id=${batchId}`;
  await connection.sql`DELETE FROM equivalence_groups WHERE id=${groupId}`;
  await connection.sql.end({ timeout: 5 });
}
