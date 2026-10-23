import { DependencyUnavailableError, type Logger } from '@cdr/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ReconcileFilesUseCase,
  FileCleanupSummary,
} from '../application/reconcile-files.use-case';
import { DEFAULT_FILE_MAINTENANCE_OPTIONS } from '../domain/ports/file-maintenance.port';
import { FileMaintenanceLifecycle } from './file-maintenance-lifecycle';
const summary: FileCleanupSummary = {
  status: 'completed',
  pages: 0,
  observed: 0,
  protected: 0,
  deleted: 0,
  absent: 0,
  changed: 0,
  failed: 0,
  reclaimedBytes: 0,
  failureCodes: {},
};
afterEach(() => vi.useRealTimers());
describe('file maintenance lifecycle', () => {
  it('does not start when disabled and never overlaps runs in one process', async () => {
    vi.useFakeTimers();
    let finish!: (value: FileCleanupSummary) => void;
    const execute = vi.fn(
      () =>
        new Promise<FileCleanupSummary>((done) => {
          finish = done;
        }),
    );
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as Logger;
    const disabled = new FileMaintenanceLifecycle(
      { execute } as unknown as ReconcileFilesUseCase,
      logger,
    );
    disabled.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(execute).not.toHaveBeenCalled();
    const lifecycle = new FileMaintenanceLifecycle(
      { execute } as unknown as ReconcileFilesUseCase,
      logger,
      { ...DEFAULT_FILE_MAINTENANCE_OPTIONS, enabled: true },
    );
    lifecycle.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(7200000);
    expect(execute).toHaveBeenCalledTimes(1);
    lifecycle.onApplicationShutdown();
    finish(summary);
    await vi.advanceTimersByTimeAsync(7200000);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('keeps API startup successful on missing S3 permission and logs only a coarse diagnostic', async () => {
    vi.useFakeTimers();
    const error = new DependencyUnavailableError('s3:maintenance-inventory', {
      name: 'AccessDenied',
      message: 'secret-url-token',
    });
    const execute = vi.fn().mockRejectedValue(error),
      warn = vi.fn();
    const lifecycle = new FileMaintenanceLifecycle(
      { execute } as unknown as ReconcileFilesUseCase,
      { info: vi.fn(), warn } as unknown as Logger,
      { ...DEFAULT_FILE_MAINTENANCE_OPTIONS, enabled: true },
    );
    expect(() => lifecycle.onApplicationBootstrap()).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ code: 'ACCESS_DENIED', dependency: 's3:maintenance-inventory' }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-url-token');
    lifecycle.onApplicationShutdown();
  });
});
