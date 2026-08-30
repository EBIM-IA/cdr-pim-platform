import { AsyncLocalStorage } from 'node:async_hooks';

import { newUuid } from './identifier';

/**
 * Request/job context propagated implicitly through the call stack.
 *
 * `correlationId` follows a unit of business work end to end — HTTP request -> use case
 * -> SQS message -> worker -> log line. `requestId` identifies a single hop.
 * See `docs/architecture/OBSERVABILITY.md`.
 */
export interface ExecutionContext {
  readonly correlationId: string;
  readonly requestId: string;
  readonly actorId?: string;
}

const storage = new AsyncLocalStorage<ExecutionContext>();

export function runWithContext<T>(context: ExecutionContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getContext(): ExecutionContext | undefined {
  return storage.getStore();
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

export function newExecutionContext(correlationId?: string, actorId?: string): ExecutionContext {
  return {
    correlationId: correlationId ?? newUuid(),
    requestId: newUuid(),
    ...(actorId ? { actorId } : {}),
  };
}

/** Canonical header name used by the API, the web client and the worker. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';
