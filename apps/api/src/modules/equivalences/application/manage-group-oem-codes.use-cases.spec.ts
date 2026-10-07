import type { OemCodeListQuery } from '@cdr/contracts';
import { ConflictError, FixedClock, ValidationError, assertUuid } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { GroupOemCode } from '../domain/entities/group-oem-code';
import type {
  EligibleOemMatch,
  GroupOemCodeRepositoryPort,
  OemAuditWriteContext,
} from '../domain/ports/group-oem-code-repository.port';
import {
  CreateGroupOemCodeUseCase,
  DeactivateGroupOemCodeUseCase,
  SearchEligibleOemCodesUseCase,
  UpdateGroupOemCodeUseCase,
} from './manage-group-oem-codes.use-cases';

const clock = new FixedClock(new Date('2026-10-07T15:00:00.000Z'));
const actor: AuthenticatedActor = {
  id: 'editor-1',
  email: 'editor@casadelruliman.com',
  roles: [Role.Editor],
};
const groupId = assertUuid('11111111-1111-4111-8111-111111111111');

class MemoryOemRepository implements GroupOemCodeRepositoryPort {
  readonly items: GroupOemCode[] = [];
  readonly audits: OemAuditWriteContext[] = [];
  automotive = true;

  async findGroupByCode(code: string) {
    return { id: groupId, code: code.trim().toUpperCase(), automotive: this.automotive };
  }

  async findById(id: ReturnType<typeof assertUuid>) {
    const item = this.items.find((candidate) => candidate.toSnapshot().id === id);
    return item ? GroupOemCode.rehydrate(item.toSnapshot()) : null;
  }

  async findByNaturalKey(_groupId: ReturnType<typeof assertUuid>, oemCode: string) {
    const item = this.items.find(
      (candidate) => candidate.toSnapshot().oemCode === oemCode.trim().toUpperCase(),
    );
    return item ? GroupOemCode.rehydrate(item.toSnapshot()) : null;
  }

  async list(_query: OemCodeListQuery) {
    return this.items;
  }

  async searchEligible(query: string): Promise<EligibleOemMatch[]> {
    return this.items
      .filter((item) => {
        const value = item.toSnapshot();
        return (
          item.eligibleForSearch &&
          (value.oemCode === query.toUpperCase() || value.brands.includes(query.toUpperCase()))
        );
      })
      .map((oem) => ({ oem, products: [] }));
  }

  async insertWithAudit(oem: GroupOemCode, audit: OemAuditWriteContext) {
    const index = this.items.findIndex((item) => item.toSnapshot().id === oem.toSnapshot().id);
    if (index >= 0) this.items[index] = GroupOemCode.rehydrate(oem.toSnapshot());
    else this.items.push(GroupOemCode.rehydrate(oem.toSnapshot()));
    this.audits.push(audit);
  }

  async saveImported(oem: GroupOemCode) {
    const index = this.items.findIndex((item) => item.toSnapshot().id === oem.toSnapshot().id);
    if (index >= 0) this.items[index] = GroupOemCode.rehydrate(oem.toSnapshot());
    else this.items.push(GroupOemCode.rehydrate(oem.toSnapshot()));
  }

  async updateWithAudit(oem: GroupOemCode, expectedUpdatedAt: Date, audit: OemAuditWriteContext) {
    const index = this.items.findIndex((item) => item.toSnapshot().id === oem.toSnapshot().id);
    if (index < 0) return { kind: 'not_found' as const };
    const current = this.items[index]!.toSnapshot();
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      return { kind: 'version_conflict' as const, actualUpdatedAt: current.updatedAt };
    }
    this.items[index] = GroupOemCode.rehydrate(oem.toSnapshot());
    this.audits.push(audit);
    return { kind: 'updated' as const, value: this.items[index]! };
  }
}

describe('OEM code use cases', () => {
  it('rejects OEM relations outside automotive groups', async () => {
    const repository = new MemoryOemRepository();
    repository.automotive = false;
    const useCase = new CreateGroupOemCodeUseCase(repository, clock);

    await expect(
      useCase.execute(
        {
          unifiedCode: '6202-2RS',
          oemCode: 'ABC-01',
          brands: ['Toyota'],
          active: true,
          approvalStatus: 'approved',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repository.items).toHaveLength(0);
    expect(repository.audits).toHaveLength(0);
  });

  it('normalizes multiple brands and exposes only active, approved search matches', async () => {
    const repository = new MemoryOemRepository();
    const create = new CreateGroupOemCodeUseCase(repository, clock);
    const search = new SearchEligibleOemCodesUseCase(repository);

    const created = await create.execute(
      {
        unifiedCode: 'd1672',
        oemCode: ' oem  42 ',
        brands: [' Toyota ', 'Lexus'],
        active: true,
        approvalStatus: 'approved',
      },
      actor,
    );

    expect(created.toSnapshot()).toMatchObject({
      unifiedCode: 'D1672',
      oemCode: 'OEM 42',
      brands: ['TOYOTA', 'LEXUS'],
    });
    expect(await search.execute('toyota')).toHaveLength(1);
    expect(repository.audits[0]).toMatchObject({
      action: 'created',
      actorId: actor.id,
    });

    const update = new UpdateGroupOemCodeUseCase(repository, clock);
    await update.execute(
      created.toSnapshot().id,
      { brands: ['Nissan'], expectedUpdatedAt: created.toSnapshot().updatedAt.toISOString() },
      actor,
    );
    expect((await search.execute('nissan'))[0]?.oem.toSnapshot().brands).toEqual(['NISSAN']);

    const deactivate = new DeactivateGroupOemCodeUseCase(repository, clock);
    await deactivate.execute(
      created.toSnapshot().id,
      created.toSnapshot().updatedAt.toISOString(),
      actor,
    );
    expect(await search.execute('nissan')).toEqual([]);
    expect(repository.audits).toHaveLength(3);
    expect(repository.audits[2]?.action).toBe('deleted');
  });

  it('rejects a stale update without overwriting the current value or auditing it', async () => {
    const repository = new MemoryOemRepository();
    const create = new CreateGroupOemCodeUseCase(repository, clock);
    const created = await create.execute(
      {
        unifiedCode: 'D1672',
        oemCode: 'OEM-42',
        brands: ['Toyota'],
        active: true,
        approvalStatus: 'pending',
      },
      actor,
    );

    const update = new UpdateGroupOemCodeUseCase(repository, clock);
    await expect(
      update.execute(
        created.toSnapshot().id,
        { brands: ['Lexus'], expectedUpdatedAt: '2026-10-07T14:59:59.000Z' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(repository.items[0]?.toSnapshot().brands).toEqual(['TOYOTA']);
    expect(repository.audits).toHaveLength(1);
  });
});
