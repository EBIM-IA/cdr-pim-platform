import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { JobType } from '@cdr/contracts';
import { InMemoryQueueAdapter, buildJobEnvelope } from '@cdr/messaging';
import type { Logger } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { JobConsumer } from '../runtime/consumer';
import { HandlerRegistry } from '../runtime/handler-registry';
import { PermanentJobError } from '../runtime/job-handler';
import { AxBatchReceivedMockHandler } from './ax-batch-received-mock.handler';

const options = {
  maxMessages: 10,
  waitTimeSeconds: 0,
  visibilityTimeoutSeconds: 30,
  maxHandlerAttempts: 3,
  retryBaseDelayMs: 100,
};

const payload = {
  idLote: 'AX-20260928-000001',
  sistemaOrigen: 'SISMETIC_AX',
  registrosRecibidos: 2,
  fechaEnvio: '2026-09-28T15:30:00Z',
  fechaRecepcion: '2026-09-28T15:30:01.000Z',
  requestHash: `sha256:${'b'.repeat(64)}`,
};

function axJob(body: Record<string, unknown> = payload) {
  return buildJobEnvelope({
    type: JobType.AX_BATCH_RECEIVED,
    payload: body,
    source: 'api:ax-integration',
    idempotencyKey: 'ax-batch-received:AX-20260928-000001',
    correlationId: '33333333-3333-4333-8333-333333333333',
  });
}

function recordingLogger(lines: string[], bindings: Record<string, unknown> = {}): Logger {
  const write = (level: string) => (message: string, meta?: Record<string, unknown>) =>
    lines.push(JSON.stringify({ level, message, ...bindings, ...meta }));
  return {
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    child: (more) => recordingLogger(lines, { ...bindings, ...more }),
  };
}

async function consume(body?: Record<string, unknown>) {
  const queue = new InMemoryQueueAdapter();
  const lines: string[] = [];
  const consumer = new JobConsumer(
    queue,
    new HandlerRegistry().register(new AxBatchReceivedMockHandler()),
    recordingLogger(lines),
    options,
  );
  await queue.publish(axJob(body));
  const [message] = await queue.receive(options);
  await consumer.processOne(message!);
  return { queue, lines, consumer };
}

describe('AxBatchReceivedMockHandler', () => {
  it('processes a valid AX_BATCH_RECEIVED and acknowledges it', async () => {
    const { queue, consumer, lines } = await consume();

    expect(queue.pending).toHaveLength(0);
    expect(queue.completed).toHaveLength(1);
    expect(consumer.metrics.completed).toBe(1);

    const processed = lines
      .map((line) => JSON.parse(line))
      .find((r) => r.message === 'AX batch mock processed');
    expect(processed).toMatchObject({
      level: 'info',
      idLote: 'AX-20260928-000001',
      sistemaOrigen: 'SISMETIC_AX',
      registrosRecibidos: 2,
      requestHash: payload.requestHash,
      correlationId: '33333333-3333-4333-8333-333333333333',
      integrationMode: 'mock',
      persisted: false,
    });
  });

  it('treats a malformed payload as a permanent failure: acknowledged, never retried', async () => {
    const { queue, consumer, lines } = await consume({ ...payload, registrosRecibidos: 'dos' });

    expect(queue.pending).toHaveLength(0);
    expect(consumer.metrics.completed).toBe(0);
    expect(consumer.metrics.retried).toBe(0);
    expect(lines.join('\n')).toContain('job failed permanently');
    expect(lines.join('\n')).not.toContain('AX batch mock processed');
  });

  it('rejects a payload that smuggles products onto the queue', () => {
    expect(() =>
      new AxBatchReceivedMockHandler().parse({
        ...payload,
        productos: [{ codigoArticulo: '000123' }],
      }),
    ).toThrow(PermanentJobError);
  });

  it('never logs the offending values of a rejected payload', async () => {
    const { lines } = await consume({ ...payload, requestHash: 'leaky-value-123' });
    expect(lines.join('\n')).not.toContain('leaky-value-123');
  });

  it('is idempotent: a redelivery only logs again', async () => {
    const handler = new AxBatchReceivedMockHandler();
    const lines: string[] = [];
    const context = { logger: recordingLogger(lines), attempt: 1 };
    const parsed = handler.parse(payload);
    await handler.handle(parsed, axJob(), context);
    await handler.handle(parsed, axJob(), { ...context, attempt: 2 });
    expect(lines.filter((line) => line.includes('AX batch mock processed'))).toHaveLength(2);
  });

  it('has no database, AI, AWS or network dependency', async () => {
    const source = await readFile(
      path.join(__dirname, 'ax-batch-received-mock.handler.ts'),
      'utf8',
    );
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(
      ['../runtime/job-handler', '../runtime/job-handler', '@cdr/contracts'].sort(),
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/DATABASE_URL|fetch\(|openai|drizzle|postgres|@aws-sdk/i);
    expect(AxBatchReceivedMockHandler.length).toBe(0); // no injected collaborators
  });
});
