import { fileMaintenanceErrorCode } from '../domain/entities/file-maintenance-error';
import {
  Inject,
  Injectable,
  Optional,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Logger, isDomainError } from '@cdr/shared';
import { LOGGER } from '../../../shared/tokens';
import { ReconcileFilesUseCase } from '../application/reconcile-files.use-case';
import {
  DEFAULT_FILE_MAINTENANCE_OPTIONS,
  FILE_MAINTENANCE_OPTIONS,
  type FileMaintenanceOptions,
} from '../domain/ports/file-maintenance.port';
@Injectable()
export class FileMaintenanceLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly options: FileMaintenanceOptions;
  constructor(
    private readonly reconcile: ReconcileFilesUseCase,
    @Inject(LOGGER) private readonly logger: Logger,
    @Optional() @Inject(FILE_MAINTENANCE_OPTIONS) options?: FileMaintenanceOptions,
  ) {
    this.options = options ?? DEFAULT_FILE_MAINTENANCE_OPTIONS;
  }
  onApplicationBootstrap(): void {
    if (this.options.enabled) this.schedule(0);
  }
  onApplicationShutdown(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
  private schedule(delay: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.run();
    }, delay);
    this.timer.unref();
  }
  private async run(): Promise<void> {
    try {
      const result = await this.reconcile.execute();
      if (result.failed)
        this.logger.warn('File maintenance completed with retryable purge failures', { ...result });
      else this.logger.info('File maintenance completed', { ...result });
    } catch (error) {
      this.logger.warn('File maintenance unavailable; files retained and retry scheduled', {
        code: fileMaintenanceErrorCode(error),
        dependency:
          isDomainError(error) && typeof error.details['dependency'] === 'string'
            ? error.details['dependency']
            : 'file-maintenance',
      });
    } finally {
      this.schedule(this.options.intervalMs);
    }
  }
}
