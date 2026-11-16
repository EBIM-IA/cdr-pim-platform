import { ApplicationColumnSettingsUseCases } from './application/application-column-settings.use-cases';
import { APPLICATION_COLUMN_SETTINGS } from './domain/ports/application-column-settings.port';
import { DrizzleApplicationColumnSettings } from './infrastructure/persistence/drizzle-application-column-settings';
import { Module } from '@nestjs/common';

import {
  CreateGroupApplicationUseCase,
  DeactivateGroupApplicationUseCase,
  ListGroupApplicationsUseCase,
  UpdateGroupApplicationUseCase,
} from './application/manage-applications.use-cases';
import { GROUP_APPLICATION_REPOSITORY } from './domain/ports/group-application-repository.port';
import { APPLICATION_SEARCH_READ_MODEL } from './domain/ports/application-search-read-model.port';
import { DrizzleApplicationSearchReadModel } from './infrastructure/persistence/drizzle-application-search-read-model';
import { DrizzleGroupApplicationRepository } from './infrastructure/persistence/drizzle-group-application.repository';
import { ApplicationsController } from './presentation/applications.controller';

@Module({
  controllers: [ApplicationsController],
  providers: [
    ApplicationColumnSettingsUseCases,
    { provide: APPLICATION_COLUMN_SETTINGS, useClass: DrizzleApplicationColumnSettings },
    { provide: GROUP_APPLICATION_REPOSITORY, useClass: DrizzleGroupApplicationRepository },
    { provide: APPLICATION_SEARCH_READ_MODEL, useClass: DrizzleApplicationSearchReadModel },
    ListGroupApplicationsUseCase,
    CreateGroupApplicationUseCase,
    UpdateGroupApplicationUseCase,
    DeactivateGroupApplicationUseCase,
  ],
  exports: [
    GROUP_APPLICATION_REPOSITORY,
    APPLICATION_SEARCH_READ_MODEL,
    APPLICATION_COLUMN_SETTINGS,
  ],
})
export class ApplicationsModule {}
