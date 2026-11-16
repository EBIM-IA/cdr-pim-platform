import { assertUuid } from '@cdr/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ExternalHomolog } from '../../src/modules/equivalences/domain/entities/external-homolog';
import { DrizzleExternalHomologRepository } from '../../src/modules/equivalences/infrastructure/persistence/drizzle-external-homolog.repository';
import { DrizzleEquivalenceGroupRepository } from '../../src/modules/equivalences/infrastructure/persistence/drizzle-equivalence-group.repository';
import { DrizzleGroupOemCodeRepository } from '../../src/modules/equivalences/infrastructure/persistence/drizzle-group-oem-code.repository';
import { DrizzleProductRepository } from '../../src/modules/catalog/infrastructure/persistence/drizzle-product.repository';
import { DrizzleDynamicCatalogRepository } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-dynamic-catalog.repository';
import { DrizzleApplicationSearchReadModel } from '../../src/modules/applications/infrastructure/persistence/drizzle-application-search-read-model';
import { DrizzleGroupApplicationRepository } from '../../src/modules/applications/infrastructure/persistence/drizzle-group-application.repository';
import { CompositeProductSearchReadModel } from '../../src/modules/search/infrastructure/read-model/composite-product-search-read-model';
import { type TestDatabase, createTestDatabase } from './database.helper';
const groupId = assertUuid('20000000-0000-4000-8000-000000000001');
const now = new Date('2026-11-16T12:00:00Z');
describe('designer homolog reference metadata', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  beforeEach(async () => {
    await database.truncateAll();
    await database.sql`INSERT INTO equivalence_groups (id,code,name,kind) VALUES (${groupId},'META-QA','QA','interchange')`;
  });
  afterAll(() => database?.close());
  it('finds approved active homolog names literally and expands only those references to real SKUs', async () => {
    const productId = assertUuid('10000000-0000-4000-8000-000000000001');
    await database.sql`INSERT INTO products (id,sku,name,status)
      VALUES (${productId},'SKU-COMERCIAL','Artículo en tienda','published')`;
    await database.sql`INSERT INTO equivalence_group_members (group_id,product_id)
      VALUES (${groupId},${productId})`;
    const repository = new DrizzleExternalHomologRepository(database.db);
    const approvedName = 'Referencia TÉCNICA especial 100% SELLO_A';
    const fixtures = [
      {
        externalCode: 'EXT-APROBADO',
        name: approvedName,
        approvalStatus: 'approved',
        active: true,
      },
      {
        externalCode: 'EXT-OTRO',
        name: 'Referencia sin símbolos',
        approvalStatus: 'approved',
        active: true,
      },
      { externalCode: 'EXT-NULO', name: null, approvalStatus: 'approved', active: true },
      {
        externalCode: 'EXT-PENDIENTE',
        name: 'Confidencial pendiente especial',
        approvalStatus: 'pending',
        active: true,
      },
      {
        externalCode: 'EXT-RECHAZADO',
        name: 'Confidencial rechazado especial',
        approvalStatus: 'rejected',
        active: true,
      },
      {
        externalCode: 'EXT-INACTIVO',
        name: 'Confidencial inactivo especial',
        approvalStatus: 'approved',
        active: false,
      },
    ] as const;
    for (const fixture of fixtures) {
      await repository.insertWithAudit(
        ExternalHomolog.create(
          { ...fixture, groupId, unifiedCode: 'META-QA', externalBrand: 'EXTERNA' },
          now,
        ),
        {
          action: 'created',
          actorId: 'admin',
          correlationId: 'homolog-name-search',
          occurredAt: now,
        },
      );
    }
    for (const query of ['  especial  ', 'técnica', '%', '_', 'sello_a', 'ext-aprobado']) {
      const matches = await repository.searchEligible(query);
      expect(matches.map((match) => match.homolog.toSnapshot().externalCode)).toEqual([
        'EXT-APROBADO',
      ]);
      expect(matches[0]?.products).toEqual([
        expect.objectContaining({ id: productId, sku: 'SKU-COMERCIAL' }),
      ]);
    }
    for (const query of ['confidencial', 'sello%a', 'EXT-APRO', '   ']) {
      expect(await repository.searchEligible(query)).toEqual([]);
    }

    const readModel = new CompositeProductSearchReadModel(
      new DrizzleProductRepository(database.db),
      new DrizzleDynamicCatalogRepository(database.db),
      new DrizzleApplicationSearchReadModel(database.db),
      new DrizzleGroupApplicationRepository(database.db),
      new DrizzleEquivalenceGroupRepository(database.db),
      repository,
      new DrizzleGroupOemCodeRepository(database.db),
    );
    expect(
      await readModel.findDeterministic({ query: 'técnica', roles: ['VENTAS'], limit: 20 }),
    ).toEqual([expect.objectContaining({ productId, sku: 'SKU-COMERCIAL' })]);
    const parts = await readModel.documentParts(productId);
    expect(parts).toContain(approvedName);
    expect(parts).not.toContain('Confidencial pendiente especial');
    expect(parts).not.toContain('Confidencial rechazado especial');
    expect(parts).not.toContain('Confidencial inactivo especial');
  });
  it('persists, updates, clears and audits optional fields while retaining manual/import provenance', async () => {
    const repository = new DrizzleExternalHomologRepository(database.db);
    const homolog = ExternalHomolog.create(
      {
        groupId,
        unifiedCode: 'META-QA',
        externalCode: 'EXT-META',
        externalBrand: 'EXTERNA',
        name: 'Referencia técnica',
        referenceType: 'Referencia cruzada',
        referenceSource: 'Catálogo del fabricante',
        note: 'Validado con documento',
      },
      now,
    );
    await repository.insertWithAudit(homolog, {
      action: 'created',
      actorId: 'admin',
      correlationId: 'homolog-metadata',
      occurredAt: now,
    });
    const stored = (await repository.findById(homolog.toSnapshot().id))!;
    const before = stored.toSnapshot();
    expect(before).toMatchObject({
      name: 'Referencia técnica',
      referenceType: 'Referencia cruzada',
      referenceSource: 'Catálogo del fabricante',
      note: 'Validado con documento',
      source: 'manual',
    });
    stored.update({ name: 'Nombre corregido', note: null }, new Date(now.getTime() + 1000));
    const changed = await repository.updateWithAudit(stored, before.updatedAt, {
      action: 'updated',
      actorId: 'admin',
      correlationId: 'homolog-metadata',
      occurredAt: now,
    });
    expect(changed.kind).toBe('updated');
    const current = (await repository.findById(before.id))!;
    expect(current.toSnapshot()).toMatchObject({
      name: 'Nombre corregido',
      note: null,
      referenceSource: 'Catálogo del fabricante',
      source: 'manual',
    });
    current.update({ referenceSource: 'TecDoc', referenceType: 'Marca alterna' }, now);
    await database.sql`INSERT INTO import_batches (id,target,format,idempotency_key,payload_hash,created_by,total_rows,valid_rows,invalid_rows) VALUES ('30000000-0000-4000-8000-000000000001','homologs','json','metadata-import','metadata-hash','admin',0,0,0)`;
    current.markImported(assertUuid('30000000-0000-4000-8000-000000000001'), now);
    await repository.saveImported(current, {
      actorId: 'admin',
      correlationId: 'homolog-metadata',
      occurredAt: now,
    });
    expect((await repository.findById(before.id))?.toSnapshot()).toMatchObject({
      referenceSource: 'TecDoc',
      referenceType: 'Marca alterna',
      name: 'Nombre corregido',
      source: 'import',
    });
    const entries = await database.sql<
      { changes: Record<string, unknown> }[]
    >`SELECT changes FROM audit_entries WHERE resource_id=${before.id}`;
    expect(entries.some((entry) => 'name' in entry.changes)).toBe(true);
    expect(entries.some((entry) => 'referenceSource' in entry.changes)).toBe(true);
  });
});
