import { FixedClock, ConflictError, assertUuid, newUuid } from '@cdr/shared';
import { InMemoryStorageAdapter } from '@cdr/storage';
import {
  productCatalogDetailSchema,
  productCatalogListSchema,
  productCatalogSchema,
} from '@cdr/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditEntries, productCatalogs, productCatalogShares } from '../../src/database/schema';
import { PostgresAuditAdapter } from '../../src/modules/audit/infrastructure/persistence/postgres-audit.adapter';
import { Role, type AuthenticatedActor } from '../../src/modules/identity/domain/entities/role';
import {
  ChangeProductCatalogDeletionUseCase,
  CreateProductCatalogShareUseCase,
  CreateProductCatalogUseCase,
  DownloadProductCatalogUseCase,
  GetProductCatalogUseCase,
  ListProductCatalogsUseCase,
  ResolveSharedProductCatalogUseCase,
  RevokeProductCatalogShareUseCase,
  UpdateProductCatalogUseCase,
} from '../../src/modules/product-catalogs/application/manage-product-catalogs.use-cases';
import { projectProductCatalog } from '../../src/modules/product-catalogs/application/catalog-projection';
import { CryptoCatalogTokenAdapter } from '../../src/modules/product-catalogs/infrastructure/crypto-catalog-token.adapter';
import { PlatformCatalogStorageAdapter } from '../../src/modules/product-catalogs/infrastructure/platform-catalog-storage.adapter';
import { DrizzleProductCatalogRepository } from '../../src/modules/product-catalogs/infrastructure/persistence/drizzle-product-catalog.repository';
import { type TestDatabase, createTestDatabase } from './database.helper';
const instant = new Date('2026-10-23T12:00:00Z');
const actor: AuthenticatedActor = {
  id: 'admin-1',
  email: 'admin@example.test',
  roles: [Role.Administrator],
};
const metadata = {
  title: 'SKF 2026',
  description: 'Catálogo rodamientos',
  validFrom: '2026-01-01',
  validUntil: null,
};
const pdf = {
  filename: 'Catalogo.pdf',
  mimeType: 'application/pdf',
  content: new TextEncoder().encode('%PDF-1.7\noriginal'),
};
describe('private PDF catalog persistence and workflow', () => {
  let database: TestDatabase,
    repository: DrizzleProductCatalogRepository,
    clock: FixedClock,
    binary: InMemoryStorageAdapter;
  function services() {
    const storage = new PlatformCatalogStorageAdapter(binary),
      tokens = new CryptoCatalogTokenAdapter();
    return {
      create: new CreateProductCatalogUseCase(repository, storage, clock),
      update: new UpdateProductCatalogUseCase(repository, storage, clock),
      share: new CreateProductCatalogShareUseCase(repository, tokens, clock),
      resolve: new ResolveSharedProductCatalogUseCase(repository, tokens, storage, clock),
      deletion: new ChangeProductCatalogDeletionUseCase(repository, clock),
      revoke: new RevokeProductCatalogShareUseCase(repository, clock),
      download: new DownloadProductCatalogUseCase(repository, storage),
      list: new ListProductCatalogsUseCase(repository, clock),
      get: new GetProductCatalogUseCase(repository, new PostgresAuditAdapter(database.db)),
    };
  }
  beforeAll(async () => {
    database = await createTestDatabase();
    repository = new DrizzleProductCatalogRepository(database.db);
  });
  beforeEach(async () => {
    await database.truncateAll();
    clock = new FixedClock(instant);
    binary = new InMemoryStorageAdapter();
  });
  afterAll(async () => {
    await database?.close();
  });
  it('generates sequential public codes, returns complete pagination and metrics beyond the first 100 rows', async () => {
    const s = services(),
      created = await s.create.execute(metadata, pdf, actor);
    expect(created.catalog.code).toBe('CAT-0001');
    const { code: _code, ...base } = created.catalog;
    await database.db.insert(productCatalogs).values(
      Array.from({ length: 100 }, (_, index) => ({
        ...base,
        id: newUuid(),
        title: `Otro ${index}`,
        objectKey: `fixtures/${newUuid()}.pdf`,
        validFrom: index === 0 ? '2027-01-01' : metadata.validFrom,
        validUntil: index === 1 ? '2026-02-01' : null,
      })),
    );
    await s.share.execute(
      created.catalog.id,
      { term: '7d', note: 'Cliente', expectedUpdatedAt: created.catalog.updatedAt.toISOString() },
      actor,
    );
    const first = productCatalogListSchema.parse(
      await s.list.execute({ page: 1, pageSize: 100, includeDeleted: false }, actor),
    );
    const second = await s.list.execute({ page: 2, pageSize: 100, includeDeleted: false }, actor);
    expect(first.total).toBe(101);
    expect(first.items).toHaveLength(100);
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(101);
    expect(first.metrics).toEqual({
      catalogs: 101,
      current: 99,
      expiring: 0,
      expired: 1,
      scheduled: 1,
      activeLinks: 1,
      deleted: 0,
    });
    const filtered = await s.list.execute(
      { page: 1, pageSize: 100, q: 'SKF', includeDeleted: false },
      actor,
    );
    expect(filtered.total).toBe(1);
    expect(filtered.metrics.catalogs).toBe(1);
    expect(JSON.stringify(first)).not.toContain('tokenDigest');
    expect(JSON.stringify(first)).not.toContain('objectKey');
  });
  it('replaces PDF bytes without breaking existing links and rejects stale catalog updates', async () => {
    const s = services(),
      created = await s.create.execute(metadata, pdf, actor);
    const link = await s.share.execute(
      created.catalog.id,
      { term: 'never', note: '', expectedUpdatedAt: created.catalog.updatedAt.toISOString() },
      actor,
    );
    const content = new TextEncoder().encode('%PDF-1.7\nreplacement');
    const updated = await s.update.execute(
      created.catalog.id,
      {
        ...metadata,
        title: 'Actualizado',
        expectedUpdatedAt: link.record.catalog.updatedAt.toISOString(),
      },
      { ...pdf, filename: 'Nuevo.pdf', content },
      actor,
    );
    expect(updated.catalog.updatedAt.getTime()).toBeGreaterThan(
      link.record.catalog.updatedAt.getTime(),
    );
    expect((await s.resolve.execute(link.token, true)).content).toEqual(content);
    expect(await binary.get(created.catalog.objectKey)).toEqual(pdf.content);
    await expect(
      s.update.execute(
        created.catalog.id,
        { ...metadata, expectedUpdatedAt: link.record.catalog.updatedAt.toISOString() },
        undefined,
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(productCatalogSchema.parse(projectProductCatalog(updated, instant)).title).toBe(
      'Actualizado',
    );
  });
  it('counts concurrent resolves without changing share versions and gates exact expiration and revocation on every download', async () => {
    const s = services(),
      created = await s.create.execute(metadata, pdf, actor);
    const link = await s.share.execute(
      created.catalog.id,
      { term: '1d', note: '', expectedUpdatedAt: created.catalog.updatedAt.toISOString() },
      actor,
    );
    await Promise.all(Array.from({ length: 12 }, () => s.resolve.execute(link.token, false)));
    await s.resolve.execute(link.token, true);
    const stored = (await repository.find(created.catalog.id))!.shares[0]!;
    expect(stored.views).toBe(12);
    expect(stored.updatedAt).toEqual(link.share.updatedAt);
    const revoked = await s.revoke.execute(
      created.catalog.id,
      stored.id,
      stored.updatedAt.toISOString(),
      actor,
    );
    await expect(s.resolve.execute(link.token, true)).rejects.toThrow('SharedCatalog not found');
    await expect(
      s.revoke.execute(created.catalog.id, stored.id, stored.updatedAt.toISOString(), actor),
    ).rejects.toBeInstanceOf(ConflictError);
    const expiring = await s.share.execute(
      created.catalog.id,
      { term: '1d', note: '', expectedUpdatedAt: revoked.catalog.updatedAt.toISOString() },
      actor,
    );
    clock.advance(86400000);
    await expect(s.resolve.execute(expiring.token, false)).rejects.toThrow(
      'SharedCatalog not found',
    );
    await expect(s.resolve.execute(expiring.token, true)).rejects.toThrow(
      'SharedCatalog not found',
    );
  });
  it('restores a soft-deleted catalog without reviving any prior link, while keeping its private PDF recoverable', async () => {
    const s = services(),
      created = await s.create.execute(metadata, pdf, actor);
    const link = await s.share.execute(
      created.catalog.id,
      { term: 'never', note: '', expectedUpdatedAt: created.catalog.updatedAt.toISOString() },
      actor,
    );
    const deleted = await s.deletion.execute(
      created.catalog.id,
      link.record.catalog.updatedAt.toISOString(),
      false,
      actor,
    );
    await expect(s.download.execute(created.catalog.id)).rejects.toThrow(
      'ProductCatalog not found',
    );
    await expect(
      s.list.execute(
        { page: 1, pageSize: 100, includeDeleted: true },
        { ...actor, roles: [Role.Purchasing] },
      ),
    ).rejects.toThrow('Only catalog editors can view deleted catalogs');
    expect(
      (await s.list.execute({ page: 1, pageSize: 100, includeDeleted: false }, actor)).total,
    ).toBe(0);
    expect(
      (await s.list.execute({ page: 1, pageSize: 100, includeDeleted: true }, actor)).metrics
        .deleted,
    ).toBe(1);
    const restored = await s.deletion.execute(
      created.catalog.id,
      deleted.catalog.updatedAt.toISOString(),
      true,
      actor,
    );
    expect((await s.download.execute(created.catalog.id)).content).toEqual(pdf.content);
    expect(restored.shares[0]?.revokedAt).not.toBeNull();
    await expect(s.resolve.execute(link.token, true)).rejects.toThrow('SharedCatalog not found');
  });
  it('atomically rolls back catalog and share writes if immutable audit insertion fails', async () => {
    const s = services(),
      created = await s.create.execute(metadata, pdf, actor);
    const link = await s.share.execute(
      created.catalog.id,
      { term: 'never', note: '', expectedUpdatedAt: created.catalog.updatedAt.toISOString() },
      actor,
    );
    const [auditRow] = await database.db.select().from(auditEntries).limit(1);
    const existingAudit = { ...auditRow!, id: assertUuid(auditRow!.id) };
    await expect(
      repository.mutate(created.catalog.id, link.record.catalog.updatedAt, (current) => ({
        catalog: { ...current.catalog, title: 'Must rollback' },
        shares: current.shares.map((share) => ({ ...share, revokedAt: instant, revokedBy: actor })),
        audit: existingAudit!,
      })),
    ).rejects.toThrow('Dependency unavailable');
    const after = await repository.find(created.catalog.id);
    expect(after?.catalog.title).toBe(metadata.title);
    expect(after?.shares[0]?.revokedAt).toBeNull();
    const id = newUuid();
    await expect(
      repository.insert({ ...created.catalog, id, objectKey: `private/${id}.pdf` }, existingAudit!),
    ).rejects.toThrow('Dependency unavailable');
    expect(await repository.find(id)).toBeNull();
  });
  it('serializes conflicting writers so exactly one catalog-version mutation succeeds', async () => {
    const s = services(),
      created = await s.create.execute(metadata, pdf, actor),
      expectedUpdatedAt = created.catalog.updatedAt.toISOString();
    const results = await Promise.allSettled([
      s.update.execute(
        created.catalog.id,
        { ...metadata, title: 'Edición concurrente', expectedUpdatedAt },
        undefined,
        actor,
      ),
      s.share.execute(created.catalog.id, { term: 'never', note: '', expectedUpdatedAt }, actor),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      results.filter(
        (result) => result.status === 'rejected' && result.reason instanceof ConflictError,
      ),
    ).toHaveLength(1);
    const detail = await s.get.execute(created.catalog.id, actor);
    expect(detail.audit).toHaveLength(2);
    const serialized = JSON.stringify(detail.audit);
    expect(serialized).not.toContain('tokenDigest');
    expect(serialized).not.toContain('objectKey');
    const dto = productCatalogDetailSchema.parse({
      catalog: projectProductCatalog(detail, instant),
      shares: [],
      audit: detail.audit.map((item) => ({ ...item, occurredAt: item.occurredAt.toISOString() })),
    });
    expect(dto.audit[0]?.actorId).toBe(actor.id);
  });
  it('matches literal percent and underscore query characters and never interpolates SQL', async () => {
    const s = services();
    await s.create.execute({ ...metadata, title: 'Oferta 100%_PDF' }, pdf, actor);
    await s.create.execute({ ...metadata, title: 'Otro documento' }, pdf, actor);
    const list = await s.list.execute(
      { page: 1, pageSize: 100, q: '%_', includeDeleted: false },
      actor,
    );
    expect(list.items.map((item) => item.title)).toEqual(['Oferta 100%_PDF']);
    expect(
      (
        await s.list.execute(
          { page: 1, pageSize: 100, q: "' OR 1=1 --", includeDeleted: false },
          actor,
        )
      ).total,
    ).toBe(0);
    const [stored] = await database.db
      .select()
      .from(productCatalogs)
      .where(eq(productCatalogs.title, 'Oferta 100%_PDF'));
    expect(stored?.code).toMatch(/^CAT-\d+$/u);
    expect(await database.db.select().from(productCatalogShares)).toEqual([]);
  });
});
