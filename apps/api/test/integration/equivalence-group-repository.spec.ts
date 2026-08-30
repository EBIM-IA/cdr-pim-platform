import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Product } from '../../src/modules/catalog/domain/entities/product';
import { DrizzleProductRepository } from '../../src/modules/catalog/infrastructure/persistence/drizzle-product.repository';
import {
  EquivalenceGroup,
  MemberRole,
} from '../../src/modules/equivalences/domain/entities/equivalence-group';
import { DrizzleEquivalenceGroupRepository } from '../../src/modules/equivalences/infrastructure/persistence/drizzle-equivalence-group.repository';
import {
  type TestDatabase,
  createTestDatabase,
  expectConstraintViolation,
} from './database.helper';

const now = new Date('2026-08-30T12:00:00.000Z');

/**
 * The equivalence ("código unificador") relationships, exercised against real SQL.
 *
 * These assertions are the practical proof of the modelling decision in ADR-005: a group
 * really does hold N products, and a product really does belong to N groups. Neither is
 * expressible if the code is a string column on `products`.
 */
describe('DrizzleEquivalenceGroupRepository', () => {
  let database: TestDatabase;
  let groups: DrizzleEquivalenceGroupRepository;
  let products: DrizzleProductRepository;

  beforeAll(async () => {
    database = await createTestDatabase();
    groups = new DrizzleEquivalenceGroupRepository(database.db);
    products = new DrizzleProductRepository(database.db);
  });

  beforeEach(() => database.truncateAll());
  afterAll(() => database.close());

  async function seedProduct(sku: string): Promise<Product> {
    const product = Product.create({ sku, name: `Rodamiento ${sku}`, now });
    await products.save(product);
    return product;
  }

  it('stores a group with N member products (1:N)', async () => {
    const [skf, fag, nsk] = await Promise.all([
      seedProduct('SKF-6205-2RS'),
      seedProduct('FAG-6205-2RSR'),
      seedProduct('NSK-6205-DDU'),
    ]);

    const group = EquivalenceGroup.create({ code: 'EQ-6205', name: 'Equivalencias 6205', now });
    group.addMember(skf!.id, MemberRole.Primary, now);
    group.addMember(fag!.id, MemberRole.Member, now);
    group.addMember(nsk!.id, MemberRole.Member, now);
    await groups.save(group);

    const loaded = await groups.findByCode('EQ-6205');
    expect(loaded?.members).toHaveLength(3);
    expect(loaded?.alternativesTo(skf!.id)).toHaveLength(2);
    expect(loaded?.members.find((member) => member.role === MemberRole.Primary)?.productId).toBe(
      skf!.id,
    );
  });

  it('lets one product belong to several groups (N:N)', async () => {
    const shared = await seedProduct('SKF-6205-2RS');
    const other = await seedProduct('FAG-6205-2RSR');
    const superseded = await seedProduct('SKF-6205-OLD');

    const interchange = EquivalenceGroup.create({ code: 'EQ-6205', name: 'Intercambiables', now });
    interchange.addMember(shared.id, MemberRole.Primary, now);
    interchange.addMember(other.id, MemberRole.Member, now);
    await groups.save(interchange);

    const supersession = EquivalenceGroup.create({
      code: 'SUP-6205',
      name: 'Reemplazos',
      kind: 'supersession',
      now,
    });
    supersession.addMember(superseded.id, MemberRole.Member, now);
    supersession.addMember(shared.id, MemberRole.Primary, now);
    await groups.save(supersession);

    const membership = await groups.findByProductId(shared.id);
    expect(membership.map((group) => group.code).sort()).toEqual(['EQ-6205', 'SUP-6205']);
    expect(membership.find((group) => group.code === 'SUP-6205')?.kind).toBe('supersession');
  });

  it('rejects a duplicate group code', async () => {
    await groups.save(EquivalenceGroup.create({ code: 'EQ-6205', name: 'Uno', now }));
    await expectConstraintViolation(
      groups.save(EquivalenceGroup.create({ code: 'EQ-6205', name: 'Dos', now })),
      'equivalence_groups_code_key',
    );
  });

  it('lets the database enforce a single primary product per group', async () => {
    const first = await seedProduct('SKF-6205-2RS');
    const second = await seedProduct('FAG-6205-2RSR');

    // Bypassing the aggregate to prove the partial unique index is really there: an
    // in-process invariant is not a substitute for a database constraint.
    const group = EquivalenceGroup.create({ code: 'EQ-6205', name: 'Equivalencias', now });
    group.addMember(first.id, MemberRole.Primary, now);
    await groups.save(group);

    await expectConstraintViolation(
      database.sql`
        INSERT INTO equivalence_group_members (group_id, product_id, role)
        VALUES (${group.id}, ${second.id}, 'primary')
      `,
      'equivalence_group_members_one_primary',
    );
  });

  it('removes memberships when a product is deleted', async () => {
    const product = await seedProduct('SKF-6205-2RS');
    const group = EquivalenceGroup.create({ code: 'EQ-6205', name: 'Equivalencias', now });
    group.addMember(product.id, MemberRole.Member, now);
    await groups.save(group);

    await database.sql`DELETE FROM products WHERE id = ${product.id}`;

    const reloaded = await groups.findById(group.id);
    expect(reloaded?.members).toHaveLength(0);
  });
});
