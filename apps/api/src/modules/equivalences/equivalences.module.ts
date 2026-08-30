import { Module } from '@nestjs/common';

import { EQUIVALENCE_GROUP_REPOSITORY } from './domain/ports/equivalence-group-repository.port';
import { DrizzleEquivalenceGroupRepository } from './infrastructure/persistence/drizzle-equivalence-group.repository';

/**
 * Bounded context for the "código unificador".
 *
 * The aggregate, its port and its PostgreSQL adapter exist and are covered by integration
 * tests. Use cases and HTTP endpoints are not built yet: how equivalences are *created*
 * (imported from a manufacturer cross-reference? curated by hand? inferred by AI?) is a
 * functional decision still pending with Casa del Rulimán.
 */
@Module({
  providers: [
    { provide: EQUIVALENCE_GROUP_REPOSITORY, useClass: DrizzleEquivalenceGroupRepository },
  ],
  exports: [EQUIVALENCE_GROUP_REPOSITORY],
})
export class EquivalencesModule {}
