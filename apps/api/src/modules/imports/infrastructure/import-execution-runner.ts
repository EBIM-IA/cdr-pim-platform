import { Injectable, Logger, type OnModuleInit, type OnApplicationShutdown } from '@nestjs/common';
import { DispatchImportExecutionsUseCase } from '../application/dispatch-import-executions.use-case';
/** Dispatch the durable outbox to SQS; never process import rows in the API. */
@Injectable()
export class ImportExecutionDispatcher implements OnModuleInit, OnApplicationShutdown {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private delayMs = 1000;
  private running: Promise<void> | undefined;
  private readonly logger = new Logger(ImportExecutionDispatcher.name);
  constructor(private readonly executions: DispatchImportExecutionsUseCase) {}
  onModuleInit() {
    this.schedule();
  }
  private schedule() {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.tick();
    }, this.delayMs);
    this.timer.unref();
  }
  private async tick() {
    try {
      await this.executions.execute();
      this.delayMs = 1000;
    } catch {
      this.delayMs = Math.min(this.delayMs * 2, 30000);
      this.logger.warn(
        'No se pudo despachar la importación a SQS; el registro durable se reintentará.',
      );
    } finally {
      this.schedule();
    }
  }
  async onApplicationShutdown() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }
}
