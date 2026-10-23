import { Module } from '@nestjs/common';
import type { ApiEnv } from '@cdr/config';
import { API_ENV } from '../../shared/tokens';
import { ProductAssetsModule } from '../product-assets/product-assets.module';
import { ProductCatalogsModule } from '../product-catalogs/product-catalogs.module';
import { ReconcileFilesUseCase } from './application/reconcile-files.use-case';
import {
  FILE_INVENTORY,
  FILE_MAINTENANCE_REPOSITORY,
  FILE_MAINTENANCE_OPTIONS,
  type FileMaintenanceOptions,
} from './domain/ports/file-maintenance.port';
import { StorageInventoryAdapter } from './infrastructure/storage-inventory.adapter';
import { DrizzleFileMaintenanceRepository } from './infrastructure/persistence/drizzle-file-maintenance.repository';
import { FileMaintenanceLifecycle } from './infrastructure/file-maintenance-lifecycle';
@Module({
  imports: [ProductAssetsModule, ProductCatalogsModule],
  providers: [
    {
      provide: FILE_MAINTENANCE_OPTIONS,
      inject: [API_ENV],
      useFactory: (env: ApiEnv): FileMaintenanceOptions => ({
        enabled: env.FILE_CLEANUP_ENABLED,
        intervalMs: env.FILE_CLEANUP_INTERVAL_MS,
        pageSize: env.FILE_CLEANUP_PAGE_SIZE,
        maxPagesPerRun: env.FILE_CLEANUP_MAX_PAGES,
        retentionDays: 30,
        maxObjectsPerRun: 100,
        maxRunMs: 60000,
      }),
    },
    { provide: FILE_INVENTORY, useClass: StorageInventoryAdapter },
    { provide: FILE_MAINTENANCE_REPOSITORY, useClass: DrizzleFileMaintenanceRepository },
    ReconcileFilesUseCase,
    FileMaintenanceLifecycle,
  ],
  exports: [ReconcileFilesUseCase],
})
export class FileMaintenanceModule {}
