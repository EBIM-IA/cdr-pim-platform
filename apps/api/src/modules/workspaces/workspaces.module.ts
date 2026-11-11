import { Module } from '@nestjs/common';
import { REPORT_SETTINGS } from './domain/ports/report-settings.port';
import { ReportSettingsUseCase } from './application/report-settings.use-case';
import { PostgresReportSettingsAdapter } from './infrastructure/postgres-report-settings.adapter';
import { ReportSettingsController } from './presentation/report-settings.controller';
import { ProductCatalogsModule } from '../product-catalogs/product-catalogs.module';

import { GetWorkspaceUseCase } from './application/get-workspace.use-case';
import { WORKSPACE_READ_MODEL } from './domain/ports/workspace-read-model.port';
import { PostgresWorkspaceReadModel } from './infrastructure/postgres-workspace-read-model';
import { WorkspacesController } from './presentation/workspaces.controller';

@Module({
  imports: [ProductCatalogsModule],
  controllers: [WorkspacesController, ReportSettingsController],
  providers: [
    { provide: WORKSPACE_READ_MODEL, useClass: PostgresWorkspaceReadModel },
    GetWorkspaceUseCase,
    ReportSettingsUseCase,
    { provide: REPORT_SETTINGS, useClass: PostgresReportSettingsAdapter },
  ],
})
export class WorkspacesModule {}
