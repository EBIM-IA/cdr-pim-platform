import { ConflictError, DependencyUnavailableError, newUuid } from '@cdr/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  auditChangeItems,
  auditEntries,
  equivalenceGroupMembers,
  equivalenceGroups,
  groupApplications,
  products,
} from '../../src/database/schema';
import { createAuditEntry } from '../../src/modules/audit/domain/entities/audit-entry';
import { GroupApplication } from '../../src/modules/applications/domain/entities/group-application';
import { DrizzleGroupApplicationRepository } from '../../src/modules/applications/infrastructure/persistence/drizzle-group-application.repository';
import { DEFAULT_PRODUCT_NAME_CONFIG } from '../../src/modules/catalog-schema/domain/services/product-naming';
import { DrizzleProductNameSettings } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-product-name-settings';
import { productNameSettings } from '../../src/modules/catalog-schema/infrastructure/persistence/product-name-settings.tables';
import { createTestDatabase, type TestDatabase } from './database.helper';

const now = new Date('2026-10-28T12:00:00.000Z');
const audit = () =>
  createAuditEntry({
    resourceType: 'product_name_settings',
    resourceId: 'product-name',
    action: 'updated',
    actorId: 'admin-1',
    source: 'api',
    correlationId: newUuid(),
    occurredAt: now,
    changes: {
      nombre_amigable: {
        before: DEFAULT_PRODUCT_NAME_CONFIG,
        after: { ...DEFAULT_PRODUCT_NAME_CONFIG, enabled: false },
      },
    },
  });

describe('product naming persistence', () => {
  let database: TestDatabase;
  let settings: DrizzleProductNameSettings;

  beforeAll(async () => {
    database = await createTestDatabase();
    settings = new DrizzleProductNameSettings(database.db);
  });
  beforeEach(async () => {
    await database.truncateAll();
    await database.db.delete(productNameSettings);
  });
  afterAll(async () => {
    await database.db.delete(productNameSettings);
    await database.close();
  });

  it('returns isolated defaults at version zero without creating a row', async () => {
    const initial = await settings.get();
    expect(initial).toEqual({ config: DEFAULT_PRODUCT_NAME_CONFIG, version: 0 });
    initial.config.automotive.splice(0, 1);
    expect(await settings.get()).toEqual({ config: DEFAULT_PRODUCT_NAME_CONFIG, version: 0 });
    expect(await database.db.select().from(productNameSettings)).toEqual([]);
  });

  it('persists formulas and normalized immutable audit items atomically, rejecting stale saves', async () => {
    const entry = audit();
    const config = { ...structuredClone(DEFAULT_PRODUCT_NAME_CONFIG), enabled: false };
    await expect(settings.save({ config, version: 0 }, entry)).resolves.toEqual({
      config,
      version: 1,
    });
    expect(await settings.get()).toEqual({ config, version: 1 });
    expect(
      await database.db.select().from(auditEntries).where(eq(auditEntries.id, entry.id)),
    ).toMatchObject([{ resourceType: 'product_name_settings', actorId: 'admin-1' }]);
    expect(
      await database.db
        .select()
        .from(auditChangeItems)
        .where(eq(auditChangeItems.auditEntryId, entry.id)),
    ).toMatchObject([
      {
        fieldName: 'nombre_amigable',
        beforeValue: DEFAULT_PRODUCT_NAME_CONFIG,
        afterValue: config,
      },
    ]);
    await expect(
      settings.save({ config: DEFAULT_PRODUCT_NAME_CONFIG, version: 0 }, audit()),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await database.db.select().from(auditEntries)).toHaveLength(1);
    await expect(
      settings.save({ config: DEFAULT_PRODUCT_NAME_CONFIG, version: 1 }, audit()),
    ).resolves.toMatchObject({ version: 2 });
  });

  it('allows exactly one concurrent initial writer and leaves no audit for the loser', async () => {
    const input = { config: structuredClone(DEFAULT_PRODUCT_NAME_CONFIG), version: 0 };
    const results = await Promise.allSettled([
      settings.save(input, audit()),
      settings.save(input, audit()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ status: 'rejected', reason: expect.any(ConflictError) });
    expect(await database.db.select().from(auditEntries)).toHaveLength(1);
    expect((await settings.get()).version).toBe(1);
  });

  it('rolls back the settings update when the audit insert fails', async () => {
    const entry = audit();
    const initial = { config: structuredClone(DEFAULT_PRODUCT_NAME_CONFIG), version: 0 };
    await settings.save(initial, entry);
    await expect(
      settings.save({ config: { ...initial.config, enabled: false }, version: 1 }, entry),
    ).rejects.toBeInstanceOf(DependencyUnavailableError);
    expect(await settings.get()).toEqual({ config: initial.config, version: 1 });
    expect(await database.db.select().from(auditEntries)).toHaveLength(1);
  });

  it('batch-loads active applications through shared group membership without cross-product contamination', async () => {
    const product1 = newUuid(),
      product2 = newUuid(),
      unrelated = newUuid(),
      empty = newUuid();
    const group = newUuid(),
      otherGroup = newUuid();
    await database.db.insert(products).values(
      [product1, product2, unrelated, empty].map((id, index) => ({
        id,
        sku: `P-${index}`,
        name: `Producto ${index}`,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await database.db.insert(equivalenceGroups).values([
      { id: group, code: '6205', name: 'Grupo', createdAt: now, updatedAt: now },
      { id: otherGroup, code: 'OTHER', name: 'Otro grupo', createdAt: now, updatedAt: now },
    ]);
    await database.db.insert(equivalenceGroupMembers).values([
      { productId: product1, groupId: group },
      { productId: product2, groupId: group },
      { productId: unrelated, groupId: otherGroup },
    ]);
    const application = (groupId: typeof group, model: string, active = true) => {
      const {
        groupId: savedGroup,
        unifiedCode: _code,
        ...snapshot
      } = GroupApplication.create(
        {
          groupId,
          unifiedCode: groupId === group ? '6205' : 'OTHER',
          vehicleType: 'AUTOMOTRIZ',
          make: 'TOYOTA',
          model,
        },
        now,
      ).toSnapshot();
      return { ...snapshot, groupId: savedGroup, active };
    };
    await database.db
      .insert(groupApplications)
      .values([
        application(group, 'COROLLA'),
        application(group, 'INACTIVO', false),
        application(otherGroup, 'AJENO'),
      ]);
    const repository = new DrizzleGroupApplicationRepository(database.db);
    const result = await repository.listForProducts([product1, product2, product1, empty]);
    expect([...result.keys()].sort()).toEqual([product1, product2].sort());
    for (const id of [product1, product2])
      expect(result.get(id)?.map((app) => app.toSnapshot().model)).toEqual(['COROLLA']);
    expect(await repository.listForProducts([])).toEqual(new Map());
    expect(result.get(empty)).toBeUndefined();
  });
});
