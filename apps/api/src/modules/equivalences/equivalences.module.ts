import { Module } from '@nestjs/common';

import { EQUIVALENCE_GROUP_REPOSITORY } from './domain/ports/equivalence-group-repository.port';
import { EXTERNAL_HOMOLOG_REPOSITORY } from './domain/ports/external-homolog-repository.port';
import { DrizzleEquivalenceGroupRepository } from './infrastructure/persistence/drizzle-equivalence-group.repository';
import { DrizzleExternalHomologRepository } from './infrastructure/persistence/drizzle-external-homolog.repository';
import {
  CreateExternalHomologUseCase,
  ListExternalHomologsUseCase,
  SearchEligibleHomologsUseCase,
  UpdateExternalHomologUseCase,
} from './application/manage-external-homologs.use-cases';
import { ExternalHomologsController } from './presentation/external-homologs.controller';

/**
 * Bounded context for the "código unificador".
 *
 * The aggregate, its port and its PostgreSQL adapter exist and are covered by integration
 * tests. Use cases and HTTP endpoints are not built yet: how equivalences are *created*
 * (imported from a manufacturer cross-reference? curated by hand? inferred by AI?) is a
 * functional decision still pending with Casa del Rulimán.
 */
@Module({
  controllers: [ExternalHomologsController],
  providers: [
    { provide: EQUIVALENCE_GROUP_REPOSITORY, useClass: DrizzleEquivalenceGroupRepository },
    { provide: EXTERNAL_HOMOLOG_REPOSITORY, useClass: DrizzleExternalHomologRepository },
    ListExternalHomologsUseCase,
    CreateExternalHomologUseCase,
    UpdateExternalHomologUseCase,
    SearchEligibleHomologsUseCase,
  ],
  exports: [EQUIVALENCE_GROUP_REPOSITORY, EXTERNAL_HOMOLOG_REPOSITORY],
})
export class EquivalencesModule {}
