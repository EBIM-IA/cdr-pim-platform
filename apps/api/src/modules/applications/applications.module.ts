import { Module } from '@nestjs/common';

import {
  CreateGroupApplicationUseCase,
  DeactivateGroupApplicationUseCase,
  ListGroupApplicationsUseCase,
  UpdateGroupApplicationUseCase,
} from './application/manage-applications.use-cases';
import { GROUP_APPLICATION_REPOSITORY } from './domain/ports/group-application-repository.port';
import { DrizzleGroupApplicationRepository } from './infrastructure/persistence/drizzle-group-application.repository';
import { ApplicationsController } from './presentation/applications.controller';

@Module({
  controllers: [ApplicationsController],
  providers: [
    { provide: GROUP_APPLICATION_REPOSITORY, useClass: DrizzleGroupApplicationRepository },
    ListGroupApplicationsUseCase,
    CreateGroupApplicationUseCase,
    UpdateGroupApplicationUseCase,
    DeactivateGroupApplicationUseCase,
  ],
  exports: [GROUP_APPLICATION_REPOSITORY],
})
export class ApplicationsModule {}
