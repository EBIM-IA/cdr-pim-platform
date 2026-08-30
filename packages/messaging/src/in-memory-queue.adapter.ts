import type { JobEnvelope } from '@cdr/contracts';
import { newUuid } from '@cdr/shared';

import type {
  PublishResult,
  QueueConsumerPort,
  QueuePort,
  ReceiveOptions,
  ReceivedMessage,
} from './queue.port';

interface StoredMessage {
  readonly envelope: JobEnvelope;
  readonly receiptHandle: string;
  receiveCount: number;
  /** Epoch ms before which the message is invisible to consumers. */
  visibleAt: number;
}

/**
 * In-process queue used by unit tests and by `QUEUE_DRIVER=memory` local runs.
 *
 * It reproduces the two SQS behaviours that actually shape handler code — visibility
 * timeouts and at-least-once delivery with a receive counter — so a handler that is correct
 * here is correct on SQS. It deliberately does NOT reproduce durability: the API refuses to
 * start with this driver in QAS/PRD, because a restart would silently drop work.
 */
export class InMemoryQueueAdapter implements QueuePort, QueueConsumerPort {
  private readonly messages: StoredMessage[] = [];
  private readonly acknowledged: JobEnvelope[] = [];

  constructor(
    private readonly now: () => number = Date.now,
    /** Injectable so tests can assert the wait without actually waiting. */
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {}

  async publish(envelope: JobEnvelope): Promise<PublishResult> {
    const receiptHandle = newUuid();
    this.messages.push({ envelope, receiptHandle, receiveCount: 0, visibleAt: 0 });
    return { messageId: receiptHandle };
  }

  async publishBatch(envelopes: readonly JobEnvelope[]): Promise<PublishResult[]> {
    return Promise.all(envelopes.map((envelope) => this.publish(envelope)));
  }

  async receive(options: ReceiveOptions): Promise<ReceivedMessage[]> {
    let visible = this.messages.filter((message) => message.visibleAt <= this.now());

    // Emulate SQS long polling. Without this, a consumer whose queue is empty would spin
    // in a tight loop at 100% CPU — which is exactly what happened the first time the
    // worker container was started with QUEUE_DRIVER=memory.
    if (visible.length === 0 && options.waitTimeSeconds > 0) {
      await this.sleep(options.waitTimeSeconds * 1000);
      visible = this.messages.filter((message) => message.visibleAt <= this.now());
    }

    const now = this.now();
    const taken = visible.slice(0, options.maxMessages);

    return taken.map((message) => {
      message.receiveCount += 1;
      message.visibleAt = now + options.visibilityTimeoutSeconds * 1000;
      return {
        envelope: message.envelope,
        receiptHandle: message.receiptHandle,
        approximateReceiveCount: message.receiveCount,
      };
    });
  }

  async acknowledge(message: ReceivedMessage): Promise<void> {
    const index = this.messages.findIndex((m) => m.receiptHandle === message.receiptHandle);
    if (index >= 0) {
      const [removed] = this.messages.splice(index, 1);
      if (removed) this.acknowledged.push(removed.envelope);
    }
  }

  async release(message: ReceivedMessage, delaySeconds: number): Promise<void> {
    const stored = this.messages.find((m) => m.receiptHandle === message.receiptHandle);
    if (stored) stored.visibleAt = this.now() + delaySeconds * 1000;
  }

  // ---- test helpers -------------------------------------------------------
  get pending(): readonly JobEnvelope[] {
    return this.messages.map((message) => message.envelope);
  }
  get completed(): readonly JobEnvelope[] {
    return [...this.acknowledged];
  }
  clear(): void {
    this.messages.length = 0;
    this.acknowledged.length = 0;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });
}
