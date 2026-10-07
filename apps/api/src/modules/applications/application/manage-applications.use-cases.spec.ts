import { ConflictError, FixedClock, assertUuid } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { GroupApplication } from '../domain/entities/group-application';
import type {
  ApplicationAuditWriteContext,
  ApplicationCriteria,
  GroupApplicationRepositoryPort,
} from '../domain/ports/group-application-repository.port';
import {
  CreateGroupApplicationUseCase,
  DeactivateGroupApplicationUseCase,
  UpdateGroupApplicationUseCase,
} from './manage-applications.use-cases';

const groupId = assertUuid('11111111-1111-4111-8111-111111111111');
const applicationId = assertUuid('22222222-2222-4222-8222-222222222222');
const originalAt = new Date('2026-10-07T14:00:00.000Z');
const changedAt = new Date('2026-10-07T15:00:00.000Z');
const actor: AuthenticatedActor = {
  id: 'buyer-1',
  email: 'buyer@example.test',
  roles: [Role.Purchasing],
};

class MemoryApplicationRepository implements GroupApplicationRepositoryPort {
  item: GroupApplication | null = null;
  readonly audits: ApplicationAuditWriteContext[] = [];

  async findGroupByCode(code: string) {
    return { id: groupId, code: code.trim().toUpperCase() };
  }

  async findById(id: ReturnType<typeof assertUuid>) {
    return this.item?.toSnapshot().id === id
      ? GroupApplication.rehydrate(this.item.toSnapshot())
      : null;
  }

  async list(_criteria: ApplicationCriteria) {
    return this.item ? [GroupApplication.rehydrate(this.item.toSnapshot())] : [];
  }

  async insertWithAudit(application: GroupApplication, audit: ApplicationAuditWriteContext) {
    this.item = GroupApplication.rehydrate(application.toSnapshot());
    this.audits.push(audit);
  }

  async updateWithAudit(
    application: GroupApplication,
    expectedUpdatedAt: Date,
    audit: ApplicationAuditWriteContext,
  ) {
    if (!this.item) return { kind: 'not_found' as const };
    const current = this.item.toSnapshot();
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      return { kind: 'version_conflict' as const, actualUpdatedAt: current.updatedAt };
    }
    this.item = GroupApplication.rehydrate(application.toSnapshot());
    this.audits.push(audit);
    return { kind: 'updated' as const, value: this.item };
  }

  async saveImported(_application: GroupApplication) {}
}

function persistedApplication() {
  return GroupApplication.create(
    {
      id: applicationId,
      groupId,
      unifiedCode: 'D1672',
      vehicleType: 'AUTOMOTRIZ',
      make: 'TOYOTA',
      model: 'HILUX',
    },
    originalAt,
  );
}

describe('manual group application mutations', () => {
  it('delegates create and its audit to the same repository unit of work', async () => {
    const repository = new MemoryApplicationRepository();
    const create = new CreateGroupApplicationUseCase(repository, new FixedClock(changedAt));

    await create.execute(
      {
        unifiedCode: 'd1672',
        vehicleType: 'AUTOMOTRIZ',
        make: 'Toyota',
        model: 'Hilux',
      },
      actor,
    );

    expect(repository.item?.toSnapshot().unifiedCode).toBe('D1672');
    expect(repository.audits).toEqual([
      expect.objectContaining({ action: 'created', actorId: actor.id, occurredAt: changedAt }),
    ]);
  });

  it('rejects a stale update without persisting or auditing it', async () => {
    const repository = new MemoryApplicationRepository();
    repository.item = persistedApplication();
    const update = new UpdateGroupApplicationUseCase(repository, new FixedClock(changedAt));

    await expect(
      update.execute(
        applicationId,
        { expectedUpdatedAt: '2026-10-07T13:00:00.000Z', model: 'FORTUNER' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repository.item.toSnapshot().model).toBe('HILUX');
    expect(repository.audits).toEqual([]);
  });

  it('soft-deactivates with the supplied version and records a deleted audit action', async () => {
    const repository = new MemoryApplicationRepository();
    repository.item = persistedApplication();
    const deactivate = new DeactivateGroupApplicationUseCase(repository, new FixedClock(changedAt));

    const result = await deactivate.execute(applicationId, originalAt.toISOString(), actor);

    expect(result.toSnapshot().active).toBe(false);
    expect(repository.audits).toEqual([
      expect.objectContaining({ action: 'deleted', actorId: actor.id }),
    ]);
  });
});
