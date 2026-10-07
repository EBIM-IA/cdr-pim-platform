import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateExternalHomologInput,
  HomologListQuery,
  UpdateExternalHomologInput,
} from '@cdr/contracts';
import {
  type Clock,
  ConflictError,
  NotFoundError,
  assertUuid,
  getCorrelationId,
  newUuid,
} from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import { AuditAction } from '../../audit/domain/entities/audit-entry';
import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import { ExternalHomolog } from '../domain/entities/external-homolog';
import {
  EXTERNAL_HOMOLOG_REPOSITORY,
  type EligibleHomologMatch,
  type ExternalHomologRepositoryPort,
} from '../domain/ports/external-homolog-repository.port';

@Injectable()
export class ListExternalHomologsUseCase {
  constructor(
    @Inject(EXTERNAL_HOMOLOG_REPOSITORY)
    private readonly repository: ExternalHomologRepositoryPort,
  ) {}

  execute(query: HomologListQuery): Promise<ExternalHomolog[]> {
    return this.repository.list(query.unifiedCode, query.includeInactive);
  }
}

@Injectable()
export class CreateExternalHomologUseCase {
  constructor(
    @Inject(EXTERNAL_HOMOLOG_REPOSITORY)
    private readonly repository: ExternalHomologRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    input: CreateExternalHomologInput,
    actor: AuthenticatedActor,
  ): Promise<ExternalHomolog> {
    const group = await this.repository.findGroupByCode(input.unifiedCode);
    if (!group) throw new NotFoundError('EquivalenceGroup', input.unifiedCode);
    const occurredAt = this.clock.now();
    const homolog = ExternalHomolog.create(
      {
        groupId: group.id,
        unifiedCode: group.code,
        externalCode: input.externalCode,
        externalBrand: input.externalBrand,
        active: input.active,
        approvalStatus: input.approvalStatus,
      },
      occurredAt,
    );
    await this.repository.insertWithAudit(homolog, {
      action: AuditAction.Created,
      actorId: actor.id,
      correlationId: getCorrelationId() ?? newUuid(),
      occurredAt,
    });
    return homolog;
  }
}

@Injectable()
export class UpdateExternalHomologUseCase {
  constructor(
    @Inject(EXTERNAL_HOMOLOG_REPOSITORY)
    private readonly repository: ExternalHomologRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    id: string,
    input: UpdateExternalHomologInput,
    actor: AuthenticatedActor,
  ): Promise<ExternalHomolog> {
    const homolog = await this.repository.findById(assertUuid(id, 'homologId'));
    if (!homolog) throw new NotFoundError('ExternalHomolog', id);
    const { expectedUpdatedAt, ...fields } = input;
    const occurredAt = this.clock.now();
    homolog.update(fields, occurredAt);
    const result = await this.repository.updateWithAudit(homolog, new Date(expectedUpdatedAt), {
      action: AuditAction.Updated,
      actorId: actor.id,
      correlationId: getCorrelationId() ?? newUuid(),
      occurredAt,
    });
    return updatedOrThrow(result, id);
  }
}

@Injectable()
export class DeactivateExternalHomologUseCase {
  constructor(
    @Inject(EXTERNAL_HOMOLOG_REPOSITORY)
    private readonly repository: ExternalHomologRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    id: string,
    expectedUpdatedAt: string,
    actor: AuthenticatedActor,
  ): Promise<ExternalHomolog> {
    const homolog = await this.repository.findById(assertUuid(id, 'homologId'));
    if (!homolog) throw new NotFoundError('ExternalHomolog', id);
    const occurredAt = this.clock.now();
    homolog.deactivate(occurredAt);
    const result = await this.repository.updateWithAudit(homolog, new Date(expectedUpdatedAt), {
      action: AuditAction.Deleted,
      actorId: actor.id,
      correlationId: getCorrelationId() ?? newUuid(),
      occurredAt,
    });
    return updatedOrThrow(result, id);
  }
}

@Injectable()
export class SearchEligibleHomologsUseCase {
  constructor(
    @Inject(EXTERNAL_HOMOLOG_REPOSITORY)
    private readonly repository: ExternalHomologRepositoryPort,
  ) {}

  execute(externalCode: string): Promise<EligibleHomologMatch[]> {
    return this.repository.searchEligible(externalCode);
  }
}

function updatedOrThrow(
  result: Awaited<ReturnType<ExternalHomologRepositoryPort['updateWithAudit']>>,
  id: string,
): ExternalHomolog {
  if (result.kind === 'not_found') throw new NotFoundError('ExternalHomolog', id);
  if (result.kind === 'version_conflict') {
    throw new ConflictError('The external homolog was modified by another request', {
      homologId: id,
      actualUpdatedAt: result.actualUpdatedAt.toISOString(),
    });
  }
  return result.value;
}
