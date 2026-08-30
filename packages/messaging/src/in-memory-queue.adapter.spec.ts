import { JobType } from '@cdr/contracts';
import { describe, expect, it } from 'vitest';

import { buildJobEnvelope } from './envelope-factory';
import { InMemoryQueueAdapter } from './in-memory-queue.adapter';

const options = { maxMessages: 10, waitTimeSeconds: 0, visibilityTimeoutSeconds: 30 };

function envelope(message: string) {
  return buildJobEnvelope({
    type: JobType.SKELETON_PING,
    payload: { message },
    source: 'test',
    idempotencyKey: `ping:${message}`,
  });
}

describe('InMemoryQueueAdapter', () => {
  it('delivers a published message', async () => {
    const queue = new InMemoryQueueAdapter();
    await queue.publish(envelope('one'));

    const received = await queue.receive(options);
    expect(received).toHaveLength(1);
    expect(received[0]?.envelope.payload).toEqual({ message: 'one' });
  });

  it('hides a received message for the visibility timeout', async () => {
    let now = 1_000_000;
    const queue = new InMemoryQueueAdapter(() => now);
    await queue.publish(envelope('one'));

    await queue.receive(options);
    expect(await queue.receive(options)).toHaveLength(0);

    now += 31_000;
    const redelivered = await queue.receive(options);
    expect(redelivered[0]?.approximateReceiveCount).toBe(2);
  });

  it('removes a message only once acknowledged', async () => {
    const queue = new InMemoryQueueAdapter();
    await queue.publish(envelope('one'));

    const [message] = await queue.receive(options);
    expect(queue.pending).toHaveLength(1);

    await queue.acknowledge(message!);
    expect(queue.pending).toHaveLength(0);
    expect(queue.completed).toHaveLength(1);
  });

  it('makes a released message immediately visible again', async () => {
    const now = 1_000_000;
    const queue = new InMemoryQueueAdapter(() => now);
    await queue.publish(envelope('one'));

    const [message] = await queue.receive(options);
    await queue.release(message!, 0);

    expect(await queue.receive(options)).toHaveLength(1);
  });
});

describe('InMemoryQueueAdapter long polling', () => {
  it('waits instead of returning immediately when the queue is empty', async () => {
    const waits: number[] = [];
    const queue = new InMemoryQueueAdapter(Date.now, async (ms) => {
      waits.push(ms);
    });

    const received = await queue.receive({ ...options, waitTimeSeconds: 20 });

    expect(received).toEqual([]);
    // Emulates SQS long polling; without it the consumer loop spins at 100% CPU.
    expect(waits).toEqual([20_000]);
  });

  it('does not wait when a message is already available', async () => {
    const waits: number[] = [];
    const queue = new InMemoryQueueAdapter(Date.now, async (ms) => {
      waits.push(ms);
    });
    await queue.publish(envelope('one'));

    expect(await queue.receive({ ...options, waitTimeSeconds: 20 })).toHaveLength(1);
    expect(waits).toEqual([]);
  });
});
