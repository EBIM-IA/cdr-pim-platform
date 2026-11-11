import { newUuid } from '@cdr/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDemoCatalog } from '../../src/database/demo-seed';
import { DrizzleCatalogParameters } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-catalog-parameters';
import { DrizzleDynamicCatalogRepository } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-dynamic-catalog.repository';
import { createTestDatabase, type TestDatabase } from './database.helper';
const metadata = () => ({
  actorId: 'admin-test',
  correlationId: newUuid(),
  occurredAt: new Date(),
});
describe('catalog parameter persistence and search', () => {
  let database: TestDatabase;
  let parameters: DrizzleCatalogParameters;
  beforeAll(async () => {
    database = await createTestDatabase();
    parameters = new DrizzleCatalogParameters(database.db);
  });
  beforeEach(async () => {
    await database.truncateAll();
  });
  afterAll(async () => {
    if (database) await database.close();
  });
  it('persists brand details and logos and rejects stale or duplicate writes', async () => {
    const id = newUuid();
    const input = {
      id,
      kind: 'brand' as const,
      value: 'SKF',
      description: 'Fabricante de rodamientos',
      target: null,
      logoDataUrl: 'data:image/png;base64,aGVsbG8=',
      active: true,
      expectedVersion: 0,
      audit: metadata(),
    };
    const saved = await parameters.save(input);
    expect(saved.version).toBe(1);
    expect((await parameters.list('brand'))[0]).toMatchObject({
      value: 'SKF',
      description: input.description,
      logoDataUrl: input.logoDataUrl,
    });
    await parameters.save({ ...input, expectedVersion: 1, active: false, audit: metadata() });
    await expect(
      parameters.save({ ...input, expectedVersion: 1, audit: metadata() }),
    ).rejects.toThrow(/Otra persona/);
    await expect(
      parameters.save({ ...input, id: newUuid(), value: 'skf', audit: metadata() }),
    ).rejects.toThrow(/Ya existe/);
  });
  it('uses active configured synonyms in catalog searches and stops using deactivated terms', async () => {
    await seedDemoCatalog(database.db);
    const saved = await parameters.save({
      id: newUuid(),
      kind: 'synonym',
      value: 'cojinetedeprueba',
      target: 'rodamiento',
      description: '',
      logoDataUrl: null,
      active: true,
      expectedVersion: 0,
      audit: metadata(),
    });
    const catalog = new DrizzleDynamicCatalogRepository(database.db);
    const query = {
      roles: ['ADMINISTRADOR'],
      page: 1,
      pageSize: 10,
      filters: [],
      q: 'cojinetedeprueba',
    };
    expect((await catalog.listWorkbook(query)).total).toBeGreaterThan(0);
    await parameters.save({
      ...saved,
      expectedVersion: saved.version,
      active: false,
      audit: metadata(),
    });
    expect((await catalog.listWorkbook(query)).total).toBe(0);
  });
});
