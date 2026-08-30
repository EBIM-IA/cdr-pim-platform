import { type Uuid, ValidationError, newUuid } from '@cdr/shared';

/**
 * The "código unificador" as a first-class aggregate.
 *
 * This is the single most important modelling decision in the catalog. Storing an
 * equivalence code as a plain string column on `products` would make the common cases
 * unrepresentable:
 *
 *   * one group holds N products (an SKF, an FAG and an NSK bearing that interchange);
 *   * one product belongs to N groups (it interchanges with family A *and* supersedes
 *     a discontinued part in family B).
 *
 * Modelling it as an aggregate with an explicit member collection makes both natural,
 * and gives the group somewhere to carry its own attributes (kind, name, provenance).
 */
export const EquivalenceKind = {
  /** Parts that substitute one another, in either direction. */
  Interchange: 'interchange',
  /** A part officially replaced by a newer one — directional. */
  Supersession: 'supersession',
} as const;

export type EquivalenceKind = (typeof EquivalenceKind)[keyof typeof EquivalenceKind];

export const MemberRole = {
  /** The preferred/reference product of the group. At most one. */
  Primary: 'primary',
  Member: 'member',
} as const;

export type MemberRole = (typeof MemberRole)[keyof typeof MemberRole];

export interface EquivalenceMember {
  readonly productId: Uuid;
  readonly role: MemberRole;
}

export interface EquivalenceGroupSnapshot {
  readonly id: Uuid;
  readonly code: string;
  readonly name: string;
  readonly kind: EquivalenceKind;
  readonly members: readonly EquivalenceMember[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class EquivalenceGroup {
  private readonly memberList: EquivalenceMember[];

  private constructor(
    readonly id: Uuid,
    readonly code: string,
    private nameValue: string,
    readonly kind: EquivalenceKind,
    members: readonly EquivalenceMember[],
    readonly createdAt: Date,
    private updatedAtValue: Date,
  ) {
    this.memberList = [...members];
  }

  get name(): string {
    return this.nameValue;
  }
  get updatedAt(): Date {
    return this.updatedAtValue;
  }
  get members(): readonly EquivalenceMember[] {
    return [...this.memberList];
  }

  static create(input: {
    code: string;
    name: string;
    kind?: EquivalenceKind;
    now: Date;
    id?: Uuid;
  }): EquivalenceGroup {
    const code = input.code.trim().toUpperCase();
    if (code.length === 0) {
      throw new ValidationError('Equivalence group code must not be blank', { field: 'code' });
    }
    const name = input.name.trim();
    if (name.length === 0) {
      throw new ValidationError('Equivalence group name must not be blank', { field: 'name' });
    }

    return new EquivalenceGroup(
      input.id ?? newUuid(),
      code,
      name,
      input.kind ?? EquivalenceKind.Interchange,
      [],
      input.now,
      input.now,
    );
  }

  static rehydrate(snapshot: EquivalenceGroupSnapshot): EquivalenceGroup {
    return new EquivalenceGroup(
      snapshot.id,
      snapshot.code,
      snapshot.name,
      snapshot.kind,
      snapshot.members,
      snapshot.createdAt,
      snapshot.updatedAt,
    );
  }

  /** Adding a product twice is a no-op, not an error: the operation is idempotent. */
  addMember(productId: Uuid, role: MemberRole, now: Date): void {
    const existing = this.memberList.find((member) => member.productId === productId);
    if (existing) {
      if (existing.role === role) return;
      this.removeMember(productId, now);
    }
    if (role === MemberRole.Primary) {
      const currentPrimary = this.memberList.find((member) => member.role === MemberRole.Primary);
      if (currentPrimary && currentPrimary.productId !== productId) {
        throw new ValidationError('The group already has a primary product', {
          groupId: this.id,
          currentPrimary: currentPrimary.productId,
        });
      }
    }
    this.memberList.push({ productId, role });
    this.updatedAtValue = now;
  }

  removeMember(productId: Uuid, now: Date): void {
    const index = this.memberList.findIndex((member) => member.productId === productId);
    if (index < 0) return;
    this.memberList.splice(index, 1);
    this.updatedAtValue = now;
  }

  /** Products a salesperson can be offered instead of `productId`. */
  alternativesTo(productId: Uuid): Uuid[] {
    return this.memberList
      .filter((member) => member.productId !== productId)
      .map((member) => member.productId);
  }

  rename(name: string, now: Date): void {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Equivalence group name must not be blank', { field: 'name' });
    }
    this.nameValue = trimmed;
    this.updatedAtValue = now;
  }

  toSnapshot(): EquivalenceGroupSnapshot {
    return {
      id: this.id,
      code: this.code,
      name: this.nameValue,
      kind: this.kind,
      members: this.members,
      createdAt: this.createdAt,
      updatedAt: this.updatedAtValue,
    };
  }
}
