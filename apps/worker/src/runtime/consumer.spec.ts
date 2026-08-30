import { JobType } from '@cdr/contracts';
import { InMemoryQueueAdapter, buildJobEnvelope } from '@cdr/messaging';
import { silentLogger } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import { SkeletonPingHandler } from '../handlers/skeleton-ping.handler';
import { JobConsumer } from './consumer';
import { HandlerRegistry } from './handler-registry';
import { type JobHandler, PermanentJobError } from './job-handler';

const options = {
  maxMessages: 10,
  waitTimeSeconds: 0,
  visibilityTimeoutSeconds: 30,
  maxHandlerAttempts: 3,
  retryBaseDelayMs: 100,
};

function ping(message = 'hola') {
  return buildJobEnvelope({
    type: JobType.SKELETON_PING,
    payload: { message },
    source: 'test',
    idempotencyKey: `ping:${message}`,
  });
}

async function receiveOne(queue: InMemoryQueueAdapter) {
  const [message] = await queue.receive(options);
  return message!;
}

describe('JobConsumer failure policy', () => {
  it('acknowledges a message once its handler succeeds', async () => {
    const queue = new InMemoryQueueAdapter();
    const consumer = new JobConsumer(
      queue,
      new HandlerRegistry().register(new SkeletonPingHandler()),
      silentLogger,
      options,
    );

    await queue.publish(ping());
    await consumer.processOne(await receiveOne(queue));

    expect(queue.pending).toHaveLength(0);
    expect(consumer.metrics.completed).toBe(1);
  });

  it('releases the message for retry on a transient failure', async () => {
    const queue = new InMemoryQueueAdapter();
    const flaky: JobHandler<{ message: string }> = {
      type: JobType.SKELETON_PING,
      parse: (payload) => payload as { message: string },
      handle: vi.fn().mockRejectedValue(new Error('database unreachable')),
    };
    const consumer = new JobConsumer(
      queue,
      new HandlerRegistry().register(flaky),
      silentLogger,
      options,
    );

    await queue.publish(ping());
    await consumer.processOne(await receiveOne(queue));

    // Still on the queue, so SQS will redeliver it.
    expect(queue.pending).toHaveLength(1);
    expect(consumer.metrics.retried).toBe(1);
    expect(consumer.metrics.deadLetterCandidates).toBe(0);
  });

  it('acknowledges a permanent failure instead of burning the retry budget', async () => {
    const queue = new InMemoryQueueAdapter();
    const poison: JobHandler<unknown> = {
      type: JobType.SKELETON_PING,
      parse: () => {
        throw new PermanentJobError('payload does not match the contract');
      },
      handle: vi.fn(),
    };
    const consumer = new JobConsumer(
      queue,
      new HandlerRegistry().register(poison),
      silentLogger,
      options,
    );

    await queue.publish(ping());
    await consumer.processOne(await receiveOne(queue));

    expect(queue.pending).toHaveLength(0);
    expect(consumer.metrics.retried).toBe(0);
    expect(poison.handle).not.toHaveBeenCalled();
  });

  it('stops retrying at maxHandlerAttempts and leaves the message to the redrive policy', async () => {
    let now = 1_000_000;
    const queue = new InMemoryQueueAdapter(() => now);
    const alwaysFails: JobHandler<unknown> = {
      type: JobType.SKELETON_PING,
      parse: (payload) => payload,
      handle: vi.fn().mockRejectedValue(new Error('still broken')),
    };
    const consumer = new JobConsumer(
      queue,
      new HandlerRegistry().register(alwaysFails),
      silentLogger,
      options,
    );

    await queue.publish(ping());
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await consumer.processOne(await receiveOne(queue));
      now += 60_000; // let the visibility timeout lapse
    }

    expect(consumer.metrics.retried).toBe(2);
    expect(consumer.metrics.deadLetterCandidates).toBe(1);
    // Never deleted by the worker: only the queue's redrive policy may move it to the DLQ.
    expect(queue.pending).toHaveLength(1);
  });

  it('leaves a message with no registered handler untouched', async () => {
    const queue = new InMemoryQueueAdapter();
    const consumer = new JobConsumer(queue, new HandlerRegistry(), silentLogger, options);

    await queue.publish(ping());
    await consumer.processOne(await receiveOne(queue));

    expect(consumer.metrics.unhandled).toBe(1);
    expect(queue.pending).toHaveLength(1);
  });
});

describe('HandlerRegistry', () => {
  it('refuses two handlers for the same job type', () => {
    const registry = new HandlerRegistry().register(new SkeletonPingHandler());
    expect(() => registry.register(new SkeletonPingHandler())).toThrow(/already registered/);
  });
});
