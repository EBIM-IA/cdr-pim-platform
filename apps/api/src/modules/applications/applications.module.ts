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
    { provide: GROUP_APPLICATION_REPOSITORY, useClass: DrizzleGroupApplicationRepository },
    { provide: APPLICATION_SEARCH_READ_MODEL, useClass: DrizzleApplicationSearchReadModel },
    ListGroupApplicationsUseCase,
    CreateGroupApplicationUseCase,
    UpdateGroupApplicationUseCase,
    DeactivateGroupApplicationUseCase,
  ],
  exports: [GROUP_APPLICATION_REPOSITORY, APPLICATION_SEARCH_READ_MODEL],
})
export class ApplicationsModule {}
