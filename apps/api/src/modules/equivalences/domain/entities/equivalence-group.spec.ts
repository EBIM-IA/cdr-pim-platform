import { ValidationError, newUuid } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { EquivalenceGroup, MemberRole } from './equivalence-group';

const now = new Date('2026-08-30T12:00:00.000Z');
const skf = newUuid();
const fag = newUuid();
const nsk = newUuid();

function group() {
  return EquivalenceGroup.create({ code: 'eq-6205', name: 'Equivalencias 6205', now });
}

describe('EquivalenceGroup', () => {
  it('normalises its code', () => {
    expect(group().code).toBe('EQ-6205');
  });

  it('holds N products — the 1:N direction', () => {
    const equivalences = group();
    equivalences.addMember(skf, MemberRole.Primary, now);
    equivalences.addMember(fag, MemberRole.Member, now);
    equivalences.addMember(nsk, MemberRole.Member, now);

    expect(equivalences.members).toHaveLength(3);
    expect(equivalences.alternativesTo(skf)).toEqual([fag, nsk]);
  });

  it('is idempotent when the same product is added twice', () => {
    const equivalences = group();
    equivalences.addMember(skf, MemberRole.Member, now);
    equivalences.addMember(skf, MemberRole.Member, now);
    expect(equivalences.members).toHaveLength(1);
  });

  it('promotes a member rather than duplicating it', () => {
    const equivalences = group();
    equivalences.addMember(skf, MemberRole.Member, now);
    equivalences.addMember(skf, MemberRole.Primary, now);

    expect(equivalences.members).toHaveLength(1);
    expect(equivalences.members[0]?.role).toBe(MemberRole.Primary);
  });

  it('allows at most one primary product', () => {
    const equivalences = group();
    equivalences.addMember(skf, MemberRole.Primary, now);
    expect(() => equivalences.addMember(fag, MemberRole.Primary, now)).toThrow(ValidationError);
  });

  it('rejects a blank code', () => {
    expect(() => EquivalenceGroup.create({ code: '  ', name: 'x', now })).toThrow(ValidationError);
  });
});
