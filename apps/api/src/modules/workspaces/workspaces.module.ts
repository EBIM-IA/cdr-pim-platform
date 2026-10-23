import { Module } from '@nestjs/common';
import { ProductCatalogsModule } from '../product-catalogs/product-catalogs.module';

import { GetWorkspaceUseCase } from './application/get-workspace.use-case';
import { WORKSPACE_READ_MODEL } from './domain/ports/workspace-read-model.port';
import { PostgresWorkspaceReadModel } from './infrastructure/postgres-workspace-read-model';
import { WorkspacesController } from './presentation/workspaces.controller';

@Module({
  imports: [ProductCatalogsModule],
  controllers: [WorkspacesController],
  providers: [
    { provide: WORKSPACE_READ_MODEL, useClass: PostgresWorkspaceReadModel },
    GetWorkspaceUseCase,
  ],
})
export class WorkspacesModule {}
