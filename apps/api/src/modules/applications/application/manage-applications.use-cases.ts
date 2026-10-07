import { Inject, Injectable } from '@nestjs/common';
import type {
  ApplicationListQuery,
  CreateGroupApplicationInput,
  UpdateGroupApplicationInput,
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
import { GroupApplication } from '../domain/entities/group-application';
import {
  GROUP_APPLICATION_REPOSITORY,
  type GroupApplicationRepositoryPort,
} from '../domain/ports/group-application-repository.port';

@Injectable()
export class ListGroupApplicationsUseCase {
  constructor(
    @Inject(GROUP_APPLICATION_REPOSITORY)
    private readonly repository: GroupApplicationRepositoryPort,
  ) {}

  execute(query: ApplicationListQuery): Promise<GroupApplication[]> {
    return this.repository.list({
      unifiedCode: query.unifiedCode,
      productId: query.productId ? assertUuid(query.productId, 'productId') : undefined,
      includeInactive: query.includeInactive,
    });
  }
}

@Injectable()
export class CreateGroupApplicationUseCase {
  constructor(
    @Inject(GROUP_APPLICATION_REPOSITORY)
    private readonly repository: GroupApplicationRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    input: CreateGroupApplicationInput,
    actor: AuthenticatedActor,
  ): Promise<GroupApplication> {
    const group = await this.repository.findGroupByCode(input.unifiedCode);
    if (!group) throw new NotFoundError('EquivalenceGroup', input.unifiedCode);
    const occurredAt = this.clock.now();
    const application = GroupApplication.create(
      {
        groupId: group.id,
        unifiedCode: group.code,
        vehicleType: input.vehicleType,
        make: input.make,
        model: input.model,
        yearFrom: input.yearFrom,
        yearTo: input.yearTo,
        engine: input.engine,
        notes: input.notes,
      },
      occurredAt,
    );
    await this.repository.insertWithAudit(application, {
      action: AuditAction.Created,
      actorId: actor.id,
      correlationId: getCorrelationId() ?? newUuid(),
      occurredAt,
    });
    return application;
  }
}

@Injectable()
export class UpdateGroupApplicationUseCase {
  constructor(
    @Inject(GROUP_APPLICATION_REPOSITORY)
    private readonly repository: GroupApplicationRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    id: string,
    input: UpdateGroupApplicationInput,
    actor: AuthenticatedActor,
  ): Promise<GroupApplication> {
    const applicationId = assertUuid(id, 'applicationId');
    const application = await this.repository.findById(applicationId);
    if (!application) throw new NotFoundError('GroupApplication', id);
    const { expectedUpdatedAt, ...fields } = input;
    const occurredAt = this.clock.now();
    application.update(
      {
        vehicleType: fields.vehicleType,
        make: fields.make,
        model: fields.model,
        yearFrom: fields.yearFrom,
        yearTo: fields.yearTo,
        engine: fields.engine,
        notes: fields.notes,
        active: fields.active,
      },
      occurredAt,
    );
    const result = await this.repository.updateWithAudit(application, new Date(expectedUpdatedAt), {
      action: AuditAction.Updated,
      actorId: actor.id,
      correlationId: getCorrelationId() ?? newUuid(),
      occurredAt,
    });
    return updatedOrThrow(result, id);
  }
}

@Injectable()
export class DeactivateGroupApplicationUseCase {
  constructor(
    @Inject(GROUP_APPLICATION_REPOSITORY)
    private readonly repository: GroupApplicationRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    id: string,
    expectedUpdatedAt: string,
    actor: AuthenticatedActor,
  ): Promise<GroupApplication> {
    const application = await this.repository.findById(assertUuid(id, 'applicationId'));
    if (!application) throw new NotFoundError('GroupApplication', id);
    const occurredAt = this.clock.now();
    application.deactivate(occurredAt);
    const result = await this.repository.updateWithAudit(application, new Date(expectedUpdatedAt), {
      action: AuditAction.Deleted,
      actorId: actor.id,
      correlationId: getCorrelationId() ?? newUuid(),
      occurredAt,
    });
    return updatedOrThrow(result, id);
  }
}

function updatedOrThrow(
  result: Awaited<ReturnType<GroupApplicationRepositoryPort['updateWithAudit']>>,
  id: string,
): GroupApplication {
  if (result.kind === 'not_found') throw new NotFoundError('GroupApplication', id);
  if (result.kind === 'version_conflict') {
    throw new ConflictError('The application was modified by another request', {
      applicationId: id,
      actualUpdatedAt: result.actualUpdatedAt.toISOString(),
    });
  }
  return result.value;
}
