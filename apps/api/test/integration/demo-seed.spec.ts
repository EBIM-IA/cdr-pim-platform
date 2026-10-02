import { newUuid } from '@cdr/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedDemoCatalog } from '../../src/database/demo-seed';
import {
  equivalenceGroupMembers,
  equivalenceGroups,
  productIdentifiers,
  products,
} from '../../src/database/schema';
import { type TestDatabase, createTestDatabase } from './database.helper';

describe('demo seed', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  beforeEach(() => database.truncateAll());
  afterAll(() => database.close());

  it('creates the seven source-backed products and is idempotent', async () => {
    await expect(seedDemoCatalog(database.db)).resolves.toEqual({
      productsInserted: 7,
      identifiersInserted: 14,
      groupsInserted: 7,
      membershipsInserted: 7,
    });
    await expect(seedDemoCatalog(database.db)).resolves.toEqual({
      productsInserted: 0,
      identifiersInserted: 0,
      groupsInserted: 0,
      membershipsInserted: 0,
    });

    const [productCount] = await database.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM products
    `;
    const [identifierCount] = await database.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM product_identifiers
    `;
    const [groupCount] = await database.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM equivalence_groups
    `;
    const [memberCount] = await database.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM equivalence_group_members
    `;

    expect({
      products: productCount?.count,
      identifiers: identifierCount?.count,
      groups: groupCount?.count,
      members: memberCount?.count,
    }).toEqual({ products: 7, identifiers: 14, groups: 7, members: 7 });
  });

  it('preserves existing product and group fields while completing missing relations', async () => {
    const existingProductId = newUuid();
    const existingGroupId = newUuid();
    await database.db.insert(products).values({
      id: existingProductId,
      sku: 'D1672',
      name: 'Nombre curado por un usuario',
      status: 'draft',
    });
    await database.db.insert(equivalenceGroups).values({
      id: existingGroupId,
      code: 'D1672',
      name: 'Nombre de grupo curado',
      kind: 'supersession',
    });

    const result = await seedDemoCatalog(database.db);
    const [preservedProduct] = await database.db
      .select()
      .from(products)
      .where(eq(products.id, existingProductId));
    const [preservedGroup] = await database.db
      .select()
      .from(equivalenceGroups)
      .where(eq(equivalenceGroups.id, existingGroupId));
    const identifiers = await database.db
      .select()
      .from(productIdentifiers)
      .where(eq(productIdentifiers.productId, existingProductId));
    const memberships = await database.db
      .select()
      .from(equivalenceGroupMembers)
      .where(eq(equivalenceGroupMembers.productId, existingProductId));

    expect(result.productsInserted).toBe(6);
    expect(result.groupsInserted).toBe(6);
    expect(preservedProduct).toMatchObject({
      name: 'Nombre curado por un usuario',
      status: 'draft',
    });
    expect(preservedGroup).toMatchObject({
      name: 'Nombre de grupo curado',
      kind: 'supersession',
    });
    expect(identifiers).toHaveLength(2);
    expect(memberships).toEqual([
      expect.objectContaining({ groupId: existingGroupId, role: 'member' }),
    ]);
  });
});
