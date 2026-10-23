import { ProductAsset } from '../../src/modules/product-assets/domain/entities/product-asset';
import { DrizzleProductAssetRepository } from '../../src/modules/product-assets/infrastructure/persistence/drizzle-product-asset.repository';
import { FixedClock, NotFoundError, assertUuid, newUuid } from '@cdr/shared';
import { InMemoryStorageAdapter } from '@cdr/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  auditEntries,
  fileCleanupCandidates,
  products,
  productAssets,
} from '../../src/database/schema';
import { AuditAction, createAuditEntry } from '../../src/modules/audit/domain/entities/audit-entry';
import { ReconcileFilesUseCase } from '../../src/modules/file-maintenance/application/reconcile-files.use-case';
import { DEFAULT_FILE_MAINTENANCE_OPTIONS } from '../../src/modules/file-maintenance/domain/ports/file-maintenance.port';
import { DrizzleFileMaintenanceRepository } from '../../src/modules/file-maintenance/infrastructure/persistence/drizzle-file-maintenance.repository';
import { Role, type AuthenticatedActor } from '../../src/modules/identity/domain/entities/role';
import {
  ChangeProductCatalogDeletionUseCase,
  CreateProductCatalogUseCase,
  UpdateProductCatalogUseCase,
} from '../../src/modules/product-catalogs/application/manage-product-catalogs.use-cases';
import type { ProductCatalog } from '../../src/modules/product-catalogs/domain/entities/product-catalog';
import { DrizzleProductCatalogObjectReferences } from '../../src/modules/product-catalogs/infrastructure/persistence/drizzle-product-catalog-object-references';
import { DrizzleProductCatalogRepository } from '../../src/modules/product-catalogs/infrastructure/persistence/drizzle-product-catalog.repository';
import { PlatformCatalogStorageAdapter } from '../../src/modules/product-catalogs/infrastructure/platform-catalog-storage.adapter';
import { DrizzleProductAssetObjectReferences } from '../../src/modules/product-assets/infrastructure/persistence/drizzle-product-asset-object-references';
import { createTestDatabase, type TestDatabase } from './database.helper';
const instant = new Date('2026-10-23T12:00:00Z');
const actor: AuthenticatedActor = {
  id: 'buyer-1',
  email: 'buyer@example.test',
  roles: [Role.Purchasing],
};
const metadata = {
  title: 'Catálogo cliente',
  description: '',
  validFrom: '2026-01-01',
  validUntil: null,
};
const pdf = {
  filename: 'Catalogo.pdf',
  mimeType: 'application/pdf',
  content: new TextEncoder().encode('%PDF-1.7\nprivate'),
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('durable private-file retention and concurrent references', () => {
  let database: TestDatabase,
    registry: DrizzleFileMaintenanceRepository,
    catalogs: DrizzleProductCatalogRepository,
    storage: InMemoryStorageAdapter,
    clock: FixedClock;
  function services() {
    const binary = new PlatformCatalogStorageAdapter(storage);
    return {
      create: new CreateProductCatalogUseCase(catalogs, binary, clock),
      update: new UpdateProductCatalogUseCase(catalogs, binary, clock),
      deletion: new ChangeProductCatalogDeletionUseCase(catalogs, clock),
      cleanup: new ReconcileFilesUseCase(
        registry,
        storage,
        new DrizzleProductAssetObjectReferences(database.db),
        new DrizzleProductCatalogObjectReferences(database.db),
        clock,
        { ...DEFAULT_FILE_MAINTENANCE_OPTIONS, enabled: true },
      ),
    };
  }
  beforeAll(async () => {
    database = await createTestDatabase();
    registry = new DrizzleFileMaintenanceRepository(database.db);
    catalogs = new DrizzleProductCatalogRepository(database.db);
  });
  beforeEach(async () => {
    await database.truncateAll();
    storage = new InMemoryStorageAdapter('maintenance-test');
    clock = new FixedClock(instant);
  });
  afterAll(async () => {
    await database?.close();
  });
  it('persists first observation, waits 30 days and records physical purge once', async () => {
    const key = `product-catalogs/${newUuid()}/${newUuid()}.pdf`;
    await storage.put({ key, content: pdf.content, mimeType: 'application/pdf' });
    const s = services();
    await s.cleanup.execute();
    const [candidate] = await database.db.select().from(fileCleanupCandidates);
    expect(candidate?.firstUnreferencedAt).toEqual(instant);
    expect(await storage.exists(key)).toBe(true);
    clock.advance(30 * 86400000 - 1);
    await s.cleanup.execute();
    expect(await storage.exists(key)).toBe(true);
    clock.advance(1);
    const result = await s.cleanup.execute();
    expect(result.deleted).toBe(1);
    expect(await storage.exists(key)).toBe(false);
    await s.cleanup.execute();
    const audits = await database.db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.resourceType, 'file_cleanup'));
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toContain(key);
  });
  it('preserves current and soft-deleted restorable catalog PDFs indefinitely', async () => {
    const s = services(),
      created = await s.create.execute(metadata, pdf, actor);
    const deleted = await s.deletion.execute(
      created.catalog.id,
      created.catalog.updatedAt.toISOString(),
      false,
      actor,
    );
    await s.cleanup.execute();
    clock.advance(90 * 86400000);
    await s.cleanup.execute();
    expect(await storage.exists(created.catalog.objectKey)).toBe(true);
    await s.deletion.execute(
      created.catalog.id,
      deleted.catalog.updatedAt.toISOString(),
      true,
      actor,
    );
    expect(await storage.get(created.catalog.objectKey)).toEqual(pdf.content);
    const [candidate] = await database.db.select().from(fileCleanupCandidates);
    expect(candidate?.status).toBe('protected');
    expect(candidate?.firstUnreferencedAt).toBeNull();
  });
  it('reclaims only the replaced catalog PDF after its observation window, never its current PDF', async () => {
    const s = services(),
      created = await s.create.execute(metadata, pdf, actor);
    const updated = await s.update.execute(
      created.catalog.id,
      { ...metadata, expectedUpdatedAt: created.catalog.updatedAt.toISOString() },
      { ...pdf, filename: 'Nuevo.pdf' },
      actor,
    );
    await s.cleanup.execute();
    expect(await storage.exists(created.catalog.objectKey)).toBe(true);
    clock.advance(30 * 86400000);
    await s.cleanup.execute();
    expect(await storage.exists(created.catalog.objectKey)).toBe(false);
    expect(await storage.exists(updated.catalog.objectKey)).toBe(true);
  });
  it('preserves active product assets and purges only retired assets after their retention window', async () => {
    const productId = newUuid(),
      activeId = newUuid(),
      retiredId = newUuid();
    await database.db
      .insert(products)
      .values({ id: productId, sku: 'CLEANUP-TEST', name: 'Producto', status: 'draft' });
    const keys = [activeId, retiredId].map((id) => `products/${productId}/documents/${id}.pdf`);
    for (const key of keys)
      await storage.put({ key, content: pdf.content, mimeType: 'application/pdf' });
    await database.db.insert(productAssets).values(
      [activeId, retiredId].map((id, index) => ({
        id,
        productId,
        kind: 'document',
        typeCode: index ? 'CERT' : 'FT',
        originalFilename: 'asset.pdf',
        objectKey: keys[index]!,
        bucket: 'maintenance-test',
        mimeType: 'application/pdf',
        sizeBytes: pdf.content.length,
        checksumSha256: 'test',
        source: 'manual',
        uploadedBy: actor.id,
        uploadedAt: instant,
        deletedAt: index ? instant : null,
        deletedBy: index ? actor.id : null,
      })),
    );
    const s = services();
    await s.cleanup.execute();
    clock.advance(30 * 86400000);
    await s.cleanup.execute();
    expect(await storage.exists(keys[0]!)).toBe(true);
    expect(await storage.exists(keys[1]!)).toBe(false);
    expect(await database.db.select().from(productAssets)).toHaveLength(2);
  });
  it('rejects a product-asset reference if its staged object disappeared before commit', async () => {
    const productId = newUuid(),
      assetId = newUuid(),
      key = `products/${productId}/documents/${assetId}.pdf`;
    await database.db
      .insert(products)
      .values({ id: productId, sku: 'LATE-ASSET', name: 'Producto', status: 'draft' });
    const repository = new DrizzleProductAssetRepository(database.db);
    const asset = ProductAsset.create({
      id: assetId,
      productId,
      sku: 'LATE-ASSET',
      type: 'FT',
      filename: 'asset.pdf',
      objectKey: key,
      bucket: 'maintenance-test',
      mimeType: 'application/pdf',
      size: pdf.content.length,
      checksum: 'test',
      position: null,
      source: 'manual',
      uploadedBy: actor.id,
      uploadedAt: instant,
    });
    await expect(
      repository.saveReplacing(
        asset,
        actor.id,
        instant,
        () => audit(assetId),
        async () => {
          if (!(await storage.exists(key))) throw new NotFoundError('StoredAsset', assetId);
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await repository.findById(assertUuid(assetId))).toBeNull();
  });
  it('rotates failed candidates so a permanently failing oldest object cannot starve later work', async () => {
    for (let index = 0; index < 2; index++)
      await storage.put({
        key: `product-catalogs/${newUuid()}/${newUuid()}.pdf`,
        content: pdf.content,
        mimeType: 'application/pdf',
      });
    const objects = (await storage.listPage({ prefix: 'product-catalogs/', limit: 100 })).items;
    await registry.observeBatch(
      objects.map((object) => ({
        object,
        unreferencedAt: new Date(instant.getTime() - 31 * 86400000),
      })),
      instant,
    );
    const [first] = await registry.due(instant, 1);
    await registry.fail(first!.id, instant);
    const [next] = await registry.due(instant, 1);
    expect(next!.id).not.toBe(first!.id);
  });
  it('serializes duplicate runs with an expiring durable lease and persists namespace cursors', async () => {
    const entered = deferred(),
      release = deferred();
    const first = registry.withRunLock(instant, 60000, async () => {
      entered.resolve();
      await release.promise;
      return 'first';
    });
    await entered.promise;
    expect(await registry.withRunLock(instant, 60000, async () => 'second')).toBeNull();
    release.resolve();
    expect(await first).toBe('first');
    await registry.saveCursor('products/', 'page-two', instant);
    expect(await new DrizzleFileMaintenanceRepository(database.db).cursor('products/')).toBe(
      'page-two',
    );
  });
  it('does not commit a late catalog reference after cleanup has physically deleted its staged file', async () => {
    const id = newUuid(),
      key = `product-catalogs/${id}/${newUuid()}.pdf`;
    await storage.put({ key, content: pdf.content, mimeType: 'application/pdf' });
    const object = (await storage.listPage({ prefix: 'product-catalogs/', limit: 100 })).items[0]!;
    await registry.observeBatch(
      [{ object, unreferencedAt: new Date(instant.getTime() - 31 * 86400000) }],
      instant,
    );
    const [candidate] = await registry.due(instant, 100),
      entered = deferred(),
      release = deferred();
    const purging = registry.withCandidate(candidate!.id, async (current, scope) => {
      entered.resolve();
      await release.promise;
      await storage.purgeIdentity(current.object);
      await registry.complete(current.id, instant, audit(current.id), scope);
    });
    await entered.promise;
    const writing = catalogs
      .insert(stagedCatalog(id, key), audit(id), async () => {
        if (!(await storage.exists(key))) throw new NotFoundError('StoredCatalog', id);
      })
      .then(
        (value) => ({ value, error: null }),
        (error) => ({ value: null, error }),
      );
    await vi.waitFor(async () => {
      const [waiting] = await database.sql<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM pg_locks WHERE locktype='advisory' AND NOT granted`;
      expect(waiting!.count).toBeGreaterThan(0);
    });
    release.resolve();
    await purging;
    expect((await writing).error).toBeInstanceOf(NotFoundError);
    expect(await catalogs.find(id)).toBeNull();
  });
  it('sees a writer that commits under the object lock before cleanup checks references', async () => {
    const id = newUuid(),
      key = `product-catalogs/${id}/${newUuid()}.pdf`;
    await storage.put({ key, content: pdf.content, mimeType: 'application/pdf' });
    const object = (await storage.listPage({ prefix: 'product-catalogs/', limit: 100 })).items[0]!;
    await registry.observeBatch(
      [{ object, unreferencedAt: new Date(instant.getTime() - 31 * 86400000) }],
      instant,
    );
    const entered = deferred(),
      release = deferred();
    const writing = catalogs.insert(stagedCatalog(id, key), audit(id), async () => {
      entered.resolve();
      await release.promise;
      if (!(await storage.exists(key))) throw new NotFoundError('StoredCatalog', id);
    });
    await entered.promise;
    const cleanup = services().cleanup.execute();
    await vi.waitFor(async () => {
      const [waiting] = await database.sql<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM pg_locks WHERE locktype='advisory' AND NOT granted`;
      expect(waiting!.count).toBeGreaterThan(0);
    });
    release.resolve();
    await writing;
    await cleanup;
    expect(await storage.exists(key)).toBe(true);
    expect(await catalogs.find(id)).not.toBeNull();
  });
});
function stagedCatalog(id: string, key: string): ProductCatalog {
  return {
    id,
    code: '',
    ...metadata,
    fileName: pdf.filename,
    fileSize: pdf.content.byteLength,
    objectKey: key,
    createdBy: actor,
    updatedBy: actor,
    createdAt: instant,
    updatedAt: instant,
    deletedAt: null,
    deletedBy: null,
  };
}
function audit(id: string) {
  return createAuditEntry({
    resourceType: 'file_cleanup_test',
    resourceId: id,
    action: AuditAction.Created,
    actorId: actor.id,
    source: 'test',
    correlationId: newUuid(),
    occurredAt: instant,
    changes: { test: { after: true } },
  });
}
