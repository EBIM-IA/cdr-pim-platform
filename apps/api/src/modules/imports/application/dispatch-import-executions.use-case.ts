import { Inject, Injectable } from '@nestjs/common';
import { JobType } from '@cdr/contracts';
import { QUEUE_PORT, buildJobEnvelope, type QueuePort } from '@cdr/messaging';
import type { Clock } from '@cdr/shared';
import { CLOCK } from '../../../shared/tokens';
import { IMPORT_EXECUTION, type ImportExecutionPort } from '../domain/ports/import-execution.port';
/** Reliable SQS producer only. Business work never runs in the API process. */
@Injectable()
export class DispatchImportExecutionsUseCase {
  constructor(
    @Inject(IMPORT_EXECUTION) private readonly executions: ImportExecutionPort,
    @Inject(QUEUE_PORT) private readonly queue: QueuePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute() {
    const pending = await this.executions.undispatched(25);
    for (const batchId of pending) {
      await this.queue.publish(
        buildJobEnvelope({
          type: JobType.IMPORT_BATCH,
          payload: { batchId },
          source: 'api:import-confirmation',
          idempotencyKey: `import-confirmation:${batchId}`,
        }),
      );
      // A crash between publish and this write can duplicate delivery; the worker's CAS
      // and each target's natural key make that safe.
      await this.executions.markDispatched(batchId, this.clock.now());
    }
    return pending.length;
  }
}
