import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  SendMessageBatchCommand,
  SendMessageCommand,
} from '@aws-sdk/client-sqs';
import { type JobEnvelope, jobEnvelopeSchema } from '@cdr/contracts';
import { DependencyUnavailableError, type Logger } from '@cdr/shared';

import type {
  PublishResult,
  QueueConsumerPort,
  QueuePort,
  ReceiveOptions,
  ReceivedMessage,
} from './queue.port';

export interface SqsQueueOptions {
  readonly queueUrl: string;
  readonly region: string;
  /** Set only for LocalStack. Must be undefined in QAS/PRD. */
  readonly endpoint?: string;
  readonly logger: Logger;
}

/** SQS caps a batch at 10 entries. */
const MAX_BATCH_ENTRIES = 10;

/**
 * Amazon SQS adapter for both sides of the queue.
 *
 * Credentials are never passed in: the SDK's default provider chain resolves them from the
 * ECS task role in AWS, and from the developer's environment (or LocalStack's dummy
 * credentials) locally. Nothing here ever reads a secret from configuration.
 */
export class SqsQueueAdapter implements QueuePort, QueueConsumerPort {
  private readonly client: SQSClient;

  constructor(private readonly options: SqsQueueOptions) {
    this.client = new SQSClient({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    });
  }

  async publish(envelope: JobEnvelope): Promise<PublishResult> {
    try {
      const response = await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.options.queueUrl,
          MessageBody: JSON.stringify(envelope),
          MessageAttributes: {
            jobType: { DataType: 'String', StringValue: envelope.type },
            correlationId: { DataType: 'String', StringValue: envelope.correlationId },
          },
        }),
      );
      return { messageId: response.MessageId ?? envelope.jobId };
    } catch (error) {
      throw new DependencyUnavailableError('sqs:sendMessage', error);
    }
  }

  async publishBatch(envelopes: readonly JobEnvelope[]): Promise<PublishResult[]> {
    const results: PublishResult[] = [];
    for (let offset = 0; offset < envelopes.length; offset += MAX_BATCH_ENTRIES) {
      const chunk = envelopes.slice(offset, offset + MAX_BATCH_ENTRIES);
      try {
        const response = await this.client.send(
          new SendMessageBatchCommand({
            QueueUrl: this.options.queueUrl,
            Entries: chunk.map((envelope, index) => ({
              Id: String(index),
              MessageBody: JSON.stringify(envelope),
            })),
          }),
        );
        // A batch send can partially fail; SQS reports that in `Failed`, not by throwing.
        if (response.Failed?.length) {
          throw new DependencyUnavailableError('sqs:sendMessageBatch', response.Failed);
        }
        for (const entry of response.Successful ?? []) {
          results.push({ messageId: entry.MessageId as string });
        }
      } catch (error) {
        if (error instanceof DependencyUnavailableError) throw error;
        throw new DependencyUnavailableError('sqs:sendMessageBatch', error);
      }
    }
    return results;
  }

  async receive(options: ReceiveOptions): Promise<ReceivedMessage[]> {
    try {
      const response = await this.client.send(
        new ReceiveMessageCommand({
          QueueUrl: this.options.queueUrl,
          MaxNumberOfMessages: options.maxMessages,
          // Long polling: one held-open request instead of a hot loop of empty receives.
          WaitTimeSeconds: options.waitTimeSeconds,
          VisibilityTimeout: options.visibilityTimeoutSeconds,
          MessageAttributeNames: ['All'],
          MessageSystemAttributeNames: ['ApproximateReceiveCount'],
        }),
      );

      return (response.Messages ?? []).flatMap((message): ReceivedMessage[] => {
        const parsed = this.parse(message.Body);
        if (!parsed) {
          // Unparseable payload: leave it alone so the redrive policy sends it to the DLQ
          // after maxReceiveCount. Deleting it here would destroy the evidence.
          this.options.logger.error('Discarding unparseable SQS message', {
            messageId: message.MessageId,
          });
          return [];
        }
        return [
          {
            envelope: parsed,
            receiptHandle: message.ReceiptHandle as string,
            approximateReceiveCount: Number(message.Attributes?.ApproximateReceiveCount ?? '1'),
          },
        ];
      });
    } catch (error) {
      throw new DependencyUnavailableError('sqs:receiveMessage', error);
    }
  }

  async acknowledge(message: ReceivedMessage): Promise<void> {
    try {
      await this.client.send(
        new DeleteMessageCommand({
          QueueUrl: this.options.queueUrl,
          ReceiptHandle: message.receiptHandle,
        }),
      );
    } catch (error) {
      throw new DependencyUnavailableError('sqs:deleteMessage', error);
    }
  }

  async release(message: ReceivedMessage, delaySeconds: number): Promise<void> {
    try {
      await this.client.send(
        new ChangeMessageVisibilityCommand({
          QueueUrl: this.options.queueUrl,
          ReceiptHandle: message.receiptHandle,
          VisibilityTimeout: Math.max(0, Math.min(43_200, Math.floor(delaySeconds))),
        }),
      );
    } catch (error) {
      // Best effort: if we cannot shorten the visibility timeout the message is still
      // redelivered once it expires, so this must not fail the whole poll cycle.
      this.options.logger.warn('Could not change message visibility', {
        jobId: message.envelope.jobId,
        error,
      });
    }
  }

  destroy(): void {
    this.client.destroy();
  }

  private parse(body: string | undefined): JobEnvelope | null {
    if (!body) return null;
    try {
      const result = jobEnvelopeSchema.safeParse(JSON.parse(body));
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }
}
