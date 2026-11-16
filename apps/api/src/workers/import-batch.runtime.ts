import { DrizzleApplicationColumnSettings } from '../modules/applications/infrastructure/persistence/drizzle-application-column-settings';
import 'reflect-metadata';
import { SystemClock } from '@cdr/shared';
import { createDatabase, type DatabaseOptions } from '../database/drizzle.client';
import { ImportExecutionUseCases } from '../modules/imports/application/import-execution.use-cases';
import { ConfirmImportBatchUseCase } from '../modules/imports/application/manage-import-batches.use-cases';
import { DrizzleImportExecutionAdapter } from '../modules/imports/infrastructure/persistence/drizzle-import-execution.adapter';
import { DrizzleImportBatchRepository } from '../modules/imports/infrastructure/persistence/drizzle-import-batch.repository';
import { DrizzleGroupApplicationRepository } from '../modules/applications/infrastructure/persistence/drizzle-group-application.repository';
import { DrizzleExternalHomologRepository } from '../modules/equivalences/infrastructure/persistence/drizzle-external-homolog.repository';
import { DrizzleGroupOemCodeRepository } from '../modules/equivalences/infrastructure/persistence/drizzle-group-oem-code.repository';
import { DrizzleCategoryAttributeImportAdapter } from '../modules/catalog-schema/infrastructure/persistence/drizzle-category-attribute-import.adapter';
import { CatalogExternalHomologReferencePolicy } from '../modules/equivalences/application/catalog-external-homolog-reference.policy';
import { DrizzleProductRepository } from '../modules/catalog/infrastructure/persistence/drizzle-product.repository';
/** Shared worker composition root: no HTTP server, application bootstrap or environment reads. */
export function createImportBatchRuntime(options: DatabaseOptions & { executionLeaseMs?: number }) {
  const connection = createDatabase(options),
    clock = SystemClock;
  const batches = new DrizzleImportBatchRepository(connection.db, options.executionLeaseMs);
  const confirmations = new ConfirmImportBatchUseCase(
    batches,
    clock,
    new DrizzleGroupApplicationRepository(connection.db),
    new DrizzleExternalHomologRepository(connection.db),
    new DrizzleGroupOemCodeRepository(connection.db),
    new DrizzleCategoryAttributeImportAdapter(connection.db),
    new CatalogExternalHomologReferencePolicy(new DrizzleProductRepository(connection.db)),
    new DrizzleApplicationColumnSettings(connection.db),
  );
  const executions = new ImportExecutionUseCases(
    new DrizzleImportExecutionAdapter(connection.db, options.executionLeaseMs),
    batches,
    confirmations,
    clock,
  );
  return {
    processBatch: (batchId: string) => executions.processBatch(batchId),
    close: () => connection.sql.end({ timeout: 5 }),
  };
}
export type ImportBatchRuntime = ReturnType<typeof createImportBatchRuntime>;
