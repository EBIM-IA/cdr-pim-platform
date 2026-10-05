import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateExternalHomologInput,
  HomologListQuery,
  UpdateExternalHomologInput,
} from '@cdr/contracts';
import { type Clock, NotFoundError, assertUuid, getCorrelationId, newUuid } from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import { AuditAction, createAuditEntry } from '../../audit/domain/entities/audit-entry';
import { AUDIT_PORT, type AuditPort } from '../../audit/domain/ports/audit.port';
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
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async execute(
    input: CreateExternalHomologInput,
    actor: AuthenticatedActor,
  ): Promise<ExternalHomolog> {
    const group = await this.repository.findGroupByCode(input.unifiedCode);
    if (!group) throw new NotFoundError('EquivalenceGroup', input.unifiedCode);
    const homolog = ExternalHomolog.create(
      {
        groupId: group.id,
        unifiedCode: group.code,
        externalCode: input.externalCode,
        externalBrand: input.externalBrand,
        active: input.active,
        approvalStatus: input.approvalStatus,
      },
      this.clock.now(),
    );
    await this.repository.save(homolog);
    const snapshot = homolog.toSnapshot();
    await this.audit.record(
      createAuditEntry({
        resourceType: 'external_homolog',
        resourceId: snapshot.id,
        action: AuditAction.Created,
        actorId: actor.id,
        source: 'api',
        correlationId: getCorrelationId() ?? newUuid(),
        occurredAt: this.clock.now(),
        changes: toChanges(undefined, snapshot),
      }),
    );
    return homolog;
  }
}

@Injectable()
export class UpdateExternalHomologUseCase {
  constructor(
    @Inject(EXTERNAL_HOMOLOG_REPOSITORY)
    private readonly repository: ExternalHomologRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async execute(
    id: string,
    input: UpdateExternalHomologInput,
    actor: AuthenticatedActor,
  ): Promise<ExternalHomolog> {
    const homolog = await this.repository.findById(assertUuid(id, 'homologId'));
    if (!homolog) throw new NotFoundError('ExternalHomolog', id);
    const before = homolog.toSnapshot();
    homolog.update(input, this.clock.now());
    await this.repository.save(homolog);
    const after = homolog.toSnapshot();
    await this.audit.record(
      createAuditEntry({
        resourceType: 'external_homolog',
        resourceId: after.id,
        action: AuditAction.Updated,
        actorId: actor.id,
        source: 'api',
        correlationId: getCorrelationId() ?? newUuid(),
        occurredAt: this.clock.now(),
        changes: toChanges(before, after),
      }),
    );
    return homolog;
  }
}

function toChanges(
  before: ReturnType<ExternalHomolog['toSnapshot']> | undefined,
  after: ReturnType<ExternalHomolog['toSnapshot']>,
): Readonly<Record<string, { before?: unknown; after?: unknown }>> {
  const fields = [
    'groupId',
    'unifiedCode',
    'externalCode',
    'externalBrand',
    'active',
    'approvalStatus',
  ] as const;
  return Object.fromEntries(
    fields
      .filter((field) => before === undefined || before[field] !== after[field])
      .map((field) => [field, { before: before?.[field], after: after[field] }]),
  );
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
