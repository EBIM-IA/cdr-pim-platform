import { Module } from '@nestjs/common';

import { EQUIVALENCE_GROUP_REPOSITORY } from './domain/ports/equivalence-group-repository.port';
import { EXTERNAL_HOMOLOG_REPOSITORY } from './domain/ports/external-homolog-repository.port';
import { GROUP_OEM_CODE_REPOSITORY } from './domain/ports/group-oem-code-repository.port';
import { DrizzleEquivalenceGroupRepository } from './infrastructure/persistence/drizzle-equivalence-group.repository';
import { DrizzleExternalHomologRepository } from './infrastructure/persistence/drizzle-external-homolog.repository';
import { DrizzleGroupOemCodeRepository } from './infrastructure/persistence/drizzle-group-oem-code.repository';
import {
  CreateExternalHomologUseCase,
  DeactivateExternalHomologUseCase,
  ListExternalHomologsUseCase,
  SearchEligibleHomologsUseCase,
  UpdateExternalHomologUseCase,
} from './application/manage-external-homologs.use-cases';
import {
  CreateGroupOemCodeUseCase,
  DeactivateGroupOemCodeUseCase,
  ListGroupOemCodesUseCase,
  SearchEligibleOemCodesUseCase,
  UpdateGroupOemCodeUseCase,
} from './application/manage-group-oem-codes.use-cases';
import { ExternalHomologsController } from './presentation/external-homologs.controller';
import { OemCodesController } from './presentation/oem-codes.controller';

/**
 * Bounded context for the "código unificador".
 *
 * The aggregate, its port and its PostgreSQL adapter exist and are covered by integration
 * tests. Use cases and HTTP endpoints are not built yet: how equivalences are *created*
 * (imported from a manufacturer cross-reference? curated by hand? inferred by AI?) is a
 * functional decision still pending with Casa del Rulimán.
 */
@Module({
  controllers: [ExternalHomologsController, OemCodesController],
  providers: [
    { provide: EQUIVALENCE_GROUP_REPOSITORY, useClass: DrizzleEquivalenceGroupRepository },
    { provide: EXTERNAL_HOMOLOG_REPOSITORY, useClass: DrizzleExternalHomologRepository },
    { provide: GROUP_OEM_CODE_REPOSITORY, useClass: DrizzleGroupOemCodeRepository },
    ListExternalHomologsUseCase,
    CreateExternalHomologUseCase,
    DeactivateExternalHomologUseCase,
    UpdateExternalHomologUseCase,
    SearchEligibleHomologsUseCase,
    ListGroupOemCodesUseCase,
    CreateGroupOemCodeUseCase,
    UpdateGroupOemCodeUseCase,
    DeactivateGroupOemCodeUseCase,
    SearchEligibleOemCodesUseCase,
  ],
  exports: [EQUIVALENCE_GROUP_REPOSITORY, EXTERNAL_HOMOLOG_REPOSITORY, GROUP_OEM_CODE_REPOSITORY],
})
export class EquivalencesModule {}
