import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateGroupOemCodeInput,
  OemCodeListQuery,
  UpdateGroupOemCodeInput,
} from '@cdr/contracts';
import {
  type Clock,
  ConflictError,
  NotFoundError,
  ValidationError,
  assertUuid,
  getCorrelationId,
  newUuid,
} from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import { AuditAction } from '../../audit/domain/entities/audit-entry';
import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import { GroupOemCode } from '../domain/entities/group-oem-code';
import {
  GROUP_OEM_CODE_REPOSITORY,
  type EligibleOemMatch,
  type GroupOemCodeRepositoryPort,
} from '../domain/ports/group-oem-code-repository.port';

@Injectable()
export class ListGroupOemCodesUseCase {
  constructor(
    @Inject(GROUP_OEM_CODE_REPOSITORY)
    private readonly repository: GroupOemCodeRepositoryPort,
  ) {}

  execute(query: OemCodeListQuery): Promise<GroupOemCode[]> {
    return this.repository.list(query);
  }
}

@Injectable()
export class CreateGroupOemCodeUseCase {
  constructor(
    @Inject(GROUP_OEM_CODE_REPOSITORY)
    private readonly repository: GroupOemCodeRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateGroupOemCodeInput, actor: AuthenticatedActor): Promise<GroupOemCode> {
    const group = await this.repository.findGroupByCode(input.unifiedCode);
    if (!group) throw new NotFoundError('EquivalenceGroup', input.unifiedCode);
    if (!group.automotive) {
      throw new ValidationError('OEM codes are only allowed for automotive equivalence groups', {
        unifiedCode: group.code,
      });
    }
    if (await this.repository.findByNaturalKey(group.id, input.oemCode)) {
      throw new ConflictError('OEM code already exists for this unifying code', {
        unifiedCode: group.code,
        oemCode: input.oemCode,
      });
    }
    const occurredAt = this.clock.now();
    const oem = GroupOemCode.create(
      {
        groupId: group.id,
        unifiedCode: group.code,
        oemCode: input.oemCode,
        brands: input.brands,
        active: input.active,
        approvalStatus: input.approvalStatus,
      },
      occurredAt,
    );
    await this.repository.insertWithAudit(oem, {
      action: AuditAction.Created,
      actorId: actor.id,
      correlationId: getCorrelationId() ?? newUuid(),
      occurredAt,
    });
    return oem;
  }
}

@Injectable()
export class UpdateGroupOemCodeUseCase {
  constructor(
    @Inject(GROUP_OEM_CODE_REPOSITORY)
    private readonly repository: GroupOemCodeRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    id: string,
    input: UpdateGroupOemCodeInput,
    actor: AuthenticatedActor,
  ): Promise<GroupOemCode> {
    const oem = await this.repository.findById(assertUuid(id, 'oemId'));
    if (!oem) throw new NotFoundError('GroupOemCode', id);
    const before = oem.toSnapshot();
    if (input.oemCode) {
      const duplicate = await this.repository.findByNaturalKey(before.groupId, input.oemCode);
      if (duplicate && duplicate.toSnapshot().id !== before.id) {
        throw new ConflictError('OEM code already exists for this unifying code', {
          unifiedCode: before.unifiedCode,
          oemCode: input.oemCode,
        });
      }
    }
    const { expectedUpdatedAt, ...fields } = input;
    const occurredAt = this.clock.now();
    oem.update(fields, occurredAt);
    const saved = await this.repository.updateWithAudit(oem, new Date(expectedUpdatedAt), {
      action: AuditAction.Updated,
      actorId: actor.id,
      correlationId: getCorrelationId() ?? newUuid(),
      occurredAt,
    });
    return updatedOrThrow(saved, id);
  }
}

@Injectable()
export class DeactivateGroupOemCodeUseCase {
  constructor(
    @Inject(GROUP_OEM_CODE_REPOSITORY)
    private readonly repository: GroupOemCodeRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    id: string,
    expectedUpdatedAt: string,
    actor: AuthenticatedActor,
  ): Promise<GroupOemCode> {
    const oem = await this.repository.findById(assertUuid(id, 'oemId'));
    if (!oem) throw new NotFoundError('GroupOemCode', id);
    const occurredAt = this.clock.now();
    oem.deactivate(occurredAt);
    const saved = await this.repository.updateWithAudit(oem, new Date(expectedUpdatedAt), {
      action: AuditAction.Deleted,
      actorId: actor.id,
      correlationId: getCorrelationId() ?? newUuid(),
      occurredAt,
    });
    return updatedOrThrow(saved, id);
  }
}

@Injectable()
export class SearchEligibleOemCodesUseCase {
  constructor(
    @Inject(GROUP_OEM_CODE_REPOSITORY)
    private readonly repository: GroupOemCodeRepositoryPort,
  ) {}

  execute(query: string): Promise<EligibleOemMatch[]> {
    return this.repository.searchEligible(query);
  }
}

function updatedOrThrow(
  result: Awaited<ReturnType<GroupOemCodeRepositoryPort['updateWithAudit']>>,
  id: string,
): GroupOemCode {
  if (result.kind === 'not_found') throw new NotFoundError('GroupOemCode', id);
  if (result.kind === 'version_conflict') {
    throw new ConflictError('The OEM code was modified by another request', {
      oemId: id,
      actualUpdatedAt: result.actualUpdatedAt.toISOString(),
    });
  }
  return result.value;
}
