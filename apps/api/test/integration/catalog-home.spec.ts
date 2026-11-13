import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAuditEntry } from '../../src/modules/audit/domain/entities/audit-entry';
import { newUuid } from '@cdr/shared';
import { DrizzleCatalogHomeSettings } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-catalog-home-settings';
import { DrizzleDynamicCatalogRepository } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-dynamic-catalog.repository';
import { seedDemoCatalog } from '../../src/database/demo-seed';
import { createTestDatabase, type TestDatabase } from './database.helper';
const audit = () =>
  createAuditEntry({
    resourceType: 'catalog_home_settings',
    resourceId: 'catalog-home',
    action: 'updated',
    actorId: 'test-admin',
    source: 'test',
    correlationId: newUuid(),
    occurredAt: new Date(),
    changes: { inicio: { after: 'updated' } },
  });
const config = {
  brands: [{ key: 'BOSCH', visible: true, image: '/home/marcas/bosch.png', text: '' }],
  categories: [],
};
describe('Home persistence and grouped catalog pagination', () => {
  let database: TestDatabase;
  let settings: DrizzleCatalogHomeSettings;
  beforeAll(async () => {
    database = await createTestDatabase();
    settings = new DrizzleCatalogHomeSettings(database.db);
  });
  beforeEach(async () => database.truncateAll());
  afterAll(async () => {
    if (database) await database.close();
  });
  it('persists ordered presentation data and permits only one concurrent writer', async () => {
    expect(await settings.get()).toEqual({ config: { brands: [], categories: [] }, version: 0 });
    const results = await Promise.allSettled([
      settings.save({ config, version: 0 }, audit()),
      settings.save({ config, version: 0 }, audit()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await settings.get()).toEqual({ config, version: 1 });
    const [count] =
      await database.sql`SELECT count(*)::int AS total FROM audit_entries WHERE resource_type = 'catalog_home_settings'`;
    expect(count?.total).toBe(1);
  });
  it('rolls back settings when its audit cannot be written', async () => {
    const event = audit();
    await settings.save({ config, version: 0 }, event);
    await expect(
      settings.save({ config: { ...config, brands: [] }, version: 1 }, event),
    ).rejects.toThrow();
    expect(await settings.get()).toEqual({ config, version: 1 });
  });
  it('keeps groups contiguous across pages even when secondary sorting by brand', async () => {
    await seedDemoCatalog(database.db);
    const catalog = new DrizzleDynamicCatalogRepository(database.db);
    const options = {
      roles: ['VENTAS'],
      page: 1,
      pageSize: 5,
      filters: [],
      groupByUnifiedCode: true,
      sort: { key: 'base:brand', direction: 'desc' as const },
    };
    const first = await catalog.listWorkbook(options);
    const second = await catalog.listWorkbook({ ...options, page: 2 });
    const all = await catalog.listWorkbook({ ...options, pageSize: 100 });
    expect([...first.items, ...second.items].map((row) => row.id)).toEqual(
      all.items.slice(0, 10).map((row) => row.id),
    );
    expect(all.items.some((row) => Boolean(row.unifiedCode))).toBe(true);
    const closed = new Set<string>();
    let current: string | null | undefined;
    for (const row of all.items) {
      if (row.unifiedCode !== current) {
        if (current) closed.add(current);
        expect(closed.has(row.unifiedCode ?? '')).toBe(false);
        current = row.unifiedCode;
      }
    }
    // The new default must not bypass an administrator hiding the identity field later.
    await database.sql`UPDATE template_attribute_role_access access SET can_view = FALSE FROM attribute_definitions definition WHERE access.attribute_definition_id = definition.id AND definition.key = 'codigo_unificador' AND access.role = 'VENTAS'`;
    const hidden = await catalog.listWorkbook(options);
    expect(hidden.items.length).toBeGreaterThan(0);
    expect(hidden.items.every((row) => row.unifiedCode === null)).toBe(true);
  });
});
