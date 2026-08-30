import { Inject, Injectable } from '@nestjs/common';
import type { Uuid } from '@cdr/shared';
import { eq, inArray } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import {
  type EquivalenceKind,
  EquivalenceGroup,
  type EquivalenceMember,
  type MemberRole,
} from '../../domain/entities/equivalence-group';
import type { EquivalenceGroupRepositoryPort } from '../../domain/ports/equivalence-group-repository.port';
import {
  type EquivalenceGroupMemberRow,
  type EquivalenceGroupRow,
  equivalenceGroupMembers,
  equivalenceGroups,
} from './equivalences.tables';

@Injectable()
export class DrizzleEquivalenceGroupRepository implements EquivalenceGroupRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(id: Uuid): Promise<EquivalenceGroup | null> {
    const rows = await this.db
      .select()
      .from(equivalenceGroups)
      .where(eq(equivalenceGroups.id, id))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row, await this.loadMembers([row.id])) : null;
  }

  async findByCode(code: string): Promise<EquivalenceGroup | null> {
    const rows = await this.db
      .select()
      .from(equivalenceGroups)
      .where(eq(equivalenceGroups.code, code))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row, await this.loadMembers([row.id])) : null;
  }

  async findByProductId(productId: Uuid): Promise<EquivalenceGroup[]> {
    const memberships = await this.db
      .select({ groupId: equivalenceGroupMembers.groupId })
      .from(equivalenceGroupMembers)
      .where(eq(equivalenceGroupMembers.productId, productId));

    const groupIds = memberships.map((membership) => membership.groupId);
    if (groupIds.length === 0) return [];

    const rows = await this.db
      .select()
      .from(equivalenceGroups)
      .where(inArray(equivalenceGroups.id, groupIds));
    const members = await this.loadMembers(groupIds);

    return rows.map((row) => this.toDomain(row, members));
  }

  async save(group: EquivalenceGroup): Promise<void> {
    const snapshot = group.toSnapshot();

    await this.db.transaction(async (tx) => {
      await tx
        .insert(equivalenceGroups)
        .values({
          id: snapshot.id,
          code: snapshot.code,
          name: snapshot.name,
          kind: snapshot.kind,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
        })
        .onConflictDoUpdate({
          target: equivalenceGroups.id,
          set: { name: snapshot.name, kind: snapshot.kind, updatedAt: snapshot.updatedAt },
        });

      await tx
        .delete(equivalenceGroupMembers)
        .where(eq(equivalenceGroupMembers.groupId, snapshot.id));
      if (snapshot.members.length > 0) {
        await tx.insert(equivalenceGroupMembers).values(
          snapshot.members.map((member) => ({
            groupId: snapshot.id,
            productId: member.productId,
            role: member.role,
          })),
        );
      }
    });
  }

  private loadMembers(groupIds: string[]): Promise<EquivalenceGroupMemberRow[]> {
    return this.db
      .select()
      .from(equivalenceGroupMembers)
      .where(inArray(equivalenceGroupMembers.groupId, groupIds));
  }

  private toDomain(
    row: EquivalenceGroupRow,
    memberRows: EquivalenceGroupMemberRow[],
  ): EquivalenceGroup {
    const members: EquivalenceMember[] = memberRows
      .filter((member) => member.groupId === row.id)
      .map((member) => ({ productId: member.productId as Uuid, role: member.role as MemberRole }));

    return EquivalenceGroup.rehydrate({
      id: row.id as Uuid,
      code: row.code,
      name: row.name,
      kind: row.kind as EquivalenceKind,
      members,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
