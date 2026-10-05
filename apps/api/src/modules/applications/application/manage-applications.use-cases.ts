import { Inject, Injectable } from '@nestjs/common';
import type {
  ApplicationListQuery,
  CreateGroupApplicationInput,
  UpdateGroupApplicationInput,
} from '@cdr/contracts';
import { type Clock, NotFoundError, assertUuid, getCorrelationId, newUuid } from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import { AuditAction, createAuditEntry } from '../../audit/domain/entities/audit-entry';
import { AUDIT_PORT, type AuditPort } from '../../audit/domain/ports/audit.port';
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
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async execute(
    input: CreateGroupApplicationInput,
    actor: AuthenticatedActor,
  ): Promise<GroupApplication> {
    const group = await this.repository.findGroupByCode(input.unifiedCode);
    if (!group) throw new NotFoundError('EquivalenceGroup', input.unifiedCode);
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
      this.clock.now(),
    );
    await this.repository.save(application);
    const snapshot = application.toSnapshot();
    await this.audit.record(
      createAuditEntry({
        resourceType: 'group_application',
        resourceId: snapshot.id,
        action: AuditAction.Created,
        actorId: actor.id,
        source: 'api',
        correlationId: getCorrelationId() ?? newUuid(),
        occurredAt: this.clock.now(),
        changes: toChanges(undefined, snapshot),
      }),
    );
    return application;
  }
}

@Injectable()
export class UpdateGroupApplicationUseCase {
  constructor(
    @Inject(GROUP_APPLICATION_REPOSITORY)
    private readonly repository: GroupApplicationRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async execute(
    id: string,
    input: UpdateGroupApplicationInput,
    actor: AuthenticatedActor,
  ): Promise<GroupApplication> {
    const applicationId = assertUuid(id, 'applicationId');
    const application = await this.repository.findById(applicationId);
    if (!application) throw new NotFoundError('GroupApplication', id);
    const before = application.toSnapshot();
    application.update(
      {
        vehicleType: input.vehicleType,
        make: input.make,
        model: input.model,
        yearFrom: input.yearFrom,
        yearTo: input.yearTo,
        engine: input.engine,
        notes: input.notes,
        active: input.active,
      },
      this.clock.now(),
    );
    await this.repository.save(application);
    const after = application.toSnapshot();
    await this.audit.record(
      createAuditEntry({
        resourceType: 'group_application',
        resourceId: after.id,
        action: AuditAction.Updated,
        actorId: actor.id,
        source: 'api',
        correlationId: getCorrelationId() ?? newUuid(),
        occurredAt: this.clock.now(),
        changes: toChanges(before, after),
      }),
    );
    return application;
  }
}

@Injectable()
export class DeactivateGroupApplicationUseCase {
  constructor(
    @Inject(GROUP_APPLICATION_REPOSITORY)
    private readonly repository: GroupApplicationRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async execute(id: string, actor: AuthenticatedActor): Promise<GroupApplication> {
    const application = await this.repository.findById(assertUuid(id, 'applicationId'));
    if (!application) throw new NotFoundError('GroupApplication', id);
    const before = application.toSnapshot();
    application.deactivate(this.clock.now());
    await this.repository.save(application);
    const after = application.toSnapshot();
    await this.audit.record(
      createAuditEntry({
        resourceType: 'group_application',
        resourceId: after.id,
        action: AuditAction.Deleted,
        actorId: actor.id,
        source: 'api',
        correlationId: getCorrelationId() ?? newUuid(),
        occurredAt: this.clock.now(),
        changes: { active: { before: before.active, after: after.active } },
      }),
    );
    return application;
  }
}

function toChanges(
  before: ReturnType<GroupApplication['toSnapshot']> | undefined,
  after: ReturnType<GroupApplication['toSnapshot']>,
): Readonly<Record<string, { before?: unknown; after?: unknown }>> {
  const fields = [
    'groupId',
    'unifiedCode',
    'vehicleType',
    'make',
    'model',
    'yearFrom',
    'yearTo',
    'engine',
    'notes',
    'active',
  ] as const;
  return Object.fromEntries(
    fields
      .filter((field) => before === undefined || before[field] !== after[field])
      .map((field) => [field, { before: before?.[field], after: after[field] }]),
  );
}
