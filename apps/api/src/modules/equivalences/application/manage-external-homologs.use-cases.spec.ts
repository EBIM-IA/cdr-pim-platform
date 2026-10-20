import { ConflictError, FixedClock, assertUuid } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { ExternalHomolog, HomologApprovalStatus } from '../domain/entities/external-homolog';
import type {
  ExternalHomologRepositoryPort,
  HomologAuditWriteContext,
} from '../domain/ports/external-homolog-repository.port';
import {
  CreateExternalHomologUseCase,
  DeactivateExternalHomologUseCase,
  UpdateExternalHomologUseCase,
} from './manage-external-homologs.use-cases';

const groupId = assertUuid('11111111-1111-4111-8111-111111111111');
const homologId = assertUuid('22222222-2222-4222-8222-222222222222');
const originalAt = new Date('2026-10-07T14:00:00.000Z');
const changedAt = new Date('2026-10-07T15:00:00.000Z');
const actor: AuthenticatedActor = {
  id: 'buyer-1',
  email: 'buyer@example.test',
  roles: [Role.Purchasing],
};

class MemoryHomologRepository implements ExternalHomologRepositoryPort {
  item: ExternalHomolog | null = null;
  readonly audits: HomologAuditWriteContext[] = [];

  async findGroupByCode(code: string) {
    return { id: groupId, code: code.trim().toUpperCase() };
  }

  async findById(id: ReturnType<typeof assertUuid>) {
    return this.item?.toSnapshot().id === id
      ? ExternalHomolog.rehydrate(this.item.toSnapshot())
      : null;
  }

  async list() {
    return this.item ? [ExternalHomolog.rehydrate(this.item.toSnapshot())] : [];
  }

  async searchEligible() {
    return [];
  }

  async insertWithAudit(homolog: ExternalHomolog, audit: HomologAuditWriteContext) {
    this.item = ExternalHomolog.rehydrate(homolog.toSnapshot());
    this.audits.push(audit);
  }

  async updateWithAudit(
    homolog: ExternalHomolog,
    expectedUpdatedAt: Date,
    audit: HomologAuditWriteContext,
  ) {
    if (!this.item) return { kind: 'not_found' as const };
    const current = this.item.toSnapshot();
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      return { kind: 'version_conflict' as const, actualUpdatedAt: current.updatedAt };
    }
    this.item = ExternalHomolog.rehydrate(homolog.toSnapshot());
    this.audits.push(audit);
    return { kind: 'updated' as const, value: this.item };
  }

  async saveImported(_homolog: ExternalHomolog) {}
}

function persistedHomolog() {
  return ExternalHomolog.create(
    {
      id: homologId,
      groupId,
      unifiedCode: 'D1672',
      externalCode: 'D-EXT',
      externalBrand: 'BOSCH',
      approvalStatus: HomologApprovalStatus.Approved,
    },
    originalAt,
  );
}

describe('manual external homolog mutations', () => {
  it('delegates create and its audit to the same repository unit of work', async () => {
    const repository = new MemoryHomologRepository();
    const create = new CreateExternalHomologUseCase(repository, new FixedClock(changedAt));

    await create.execute(
      {
        unifiedCode: 'd1672',
        externalCode: 'D-EXT',
        externalBrand: 'Bosch',
        active: true,
        approvalStatus: 'approved',
      },
      actor,
    );

    expect(repository.item?.toSnapshot().unifiedCode).toBe('D1672');
    expect(repository.audits).toEqual([
      expect.objectContaining({ action: 'created', actorId: actor.id, occurredAt: changedAt }),
    ]);
  });

  it('rejects a stale update without persisting or auditing it', async () => {
    const repository = new MemoryHomologRepository();
    repository.item = persistedHomolog();
    const update = new UpdateExternalHomologUseCase(repository, new FixedClock(changedAt));

    await expect(
      update.execute(
        homologId,
        { expectedUpdatedAt: '2026-10-07T13:00:00.000Z', externalBrand: 'SKF' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repository.item.toSnapshot().externalBrand).toBe('BOSCH');
    expect(repository.audits).toEqual([]);
  });

  it('soft-deactivates so eligible search can no longer expose the relation', async () => {
    const repository = new MemoryHomologRepository();
    repository.item = persistedHomolog();
    const deactivate = new DeactivateExternalHomologUseCase(repository, new FixedClock(changedAt));

    const result = await deactivate.execute(homologId, originalAt.toISOString(), actor);

    expect(result.eligibleForSearch).toBe(false);
    expect(repository.audits).toEqual([
      expect.objectContaining({ action: 'deleted', actorId: actor.id }),
    ]);
  });
});
