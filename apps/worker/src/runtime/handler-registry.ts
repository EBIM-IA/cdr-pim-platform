import type { JobType } from '@cdr/contracts';

import type { JobHandler } from './job-handler';

/**
 * Maps a job type to its handler.
 *
 * A message whose type has no handler is a deployment error (the producer shipped before
 * the consumer), so `resolve` returns undefined and the consumer leaves the message for
 * the DLQ rather than silently deleting work it does not understand.
 */
export class HandlerRegistry {
  private readonly handlers = new Map<JobType, JobHandler<unknown>>();

  register<T>(handler: JobHandler<T>): this {
    if (this.handlers.has(handler.type)) {
      throw new Error(`A handler for job type ${handler.type} is already registered`);
    }
    this.handlers.set(handler.type, handler as JobHandler<unknown>);
    return this;
  }

  resolve(type: JobType): JobHandler<unknown> | undefined {
    return this.handlers.get(type);
  }

  get registeredTypes(): JobType[] {
    return [...this.handlers.keys()];
  }
}
