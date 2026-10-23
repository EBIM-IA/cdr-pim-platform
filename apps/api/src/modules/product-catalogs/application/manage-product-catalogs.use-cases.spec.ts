import { FixedClock, ConflictError, NotFoundError } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';
import type { AuditEntry } from '../../audit/domain/entities/audit-entry';
import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import type { CatalogWithShares } from '../domain/entities/product-catalog';
import type {
  CatalogBinaryStoragePort,
  ProductCatalogRepositoryPort,
} from '../domain/ports/product-catalog.port';
import { CryptoCatalogTokenAdapter } from '../infrastructure/crypto-catalog-token.adapter';
import {
  ChangeProductCatalogDeletionUseCase,
  CreateProductCatalogShareUseCase,
  CreateProductCatalogUseCase,
  ListProductCatalogsUseCase,
  ResolveSharedProductCatalogUseCase,
  RevokeProductCatalogShareUseCase,
  UpdateProductCatalogUseCase,
} from './manage-product-catalogs.use-cases';
const now = new Date('2026-10-23T12:00:00Z'),
  clock = new FixedClock(now);
const actor: AuthenticatedActor = {
  id: 'buyer-1',
  email: 'buyer@example.test',
  roles: [Role.Purchasing],
};
const metadata = {
  title: 'Rodamientos',
  description: 'Catálogo cliente',
  validFrom: '2026-01-01',
  validUntil: null,
};
const file = {
  filename: 'Catalogo.pdf',
  mimeType: 'application/pdf',
  content: new TextEncoder().encode('%PDF-1.7\nprivate'),
};
function setup() {
  let record: CatalogWithShares | null = null;
  const audit: AuditEntry[] = [],
    objects = new Map<string, Uint8Array>();
  const storage: CatalogBinaryStoragePort = {
    put: vi.fn(async (key, bytes) => {
      objects.set(key, bytes);
    }),
    get: vi.fn(async (key) => objects.get(key)!),
  };
  const repository: ProductCatalogRepositoryPort = {
    list: vi.fn(async () => ({
      items: record ? [record] : [],
      total: record ? 1 : 0,
      metrics: {
        catalogs: record ? 1 : 0,
        current: 1,
        expired: 0,
        expiring: 0,
        scheduled: 0,
        activeLinks: 0,
        deleted: 0,
      },
    })),
    find: vi.fn(async (id) => (record?.catalog.id === id ? record : null)),
    insert: vi.fn(async (catalog, entry) => {
      record = { catalog: { ...catalog, code: 'CAT-0001' }, shares: [] };
      audit.push(entry);
      return record;
    }),
    mutate: vi.fn(async (id, expected, change) => {
      if (!record || record.catalog.id !== id) throw new NotFoundError('Catalog', id);
      const actual =
        expected instanceof Date
          ? record.catalog.updatedAt
          : record.shares.find((share) => share.id === expected.shareId)?.updatedAt;
      if (
        actual?.getTime() !== (expected instanceof Date ? expected : expected.updatedAt).getTime()
      )
        throw new ConflictError('Version conflict');
      const changed = change(record);
      audit.push(changed.audit);
      record = { catalog: changed.catalog, shares: [...changed.shares] };
      return record;
    }),
    accessShared: vi.fn(async (digest, instant, visit, authorize) => {
      const share = record?.shares.find((share) => share.tokenDigest === digest);
      if (!record || !share) return null;
      authorize(record, share);
      if (visit)
        record = {
          ...record,
          shares: record.shares.map((item) =>
            item.id === share.id ? { ...item, views: item.views + 1, lastViewedAt: instant } : item,
          ),
        };
      return { catalog: record.catalog, share };
    }),
  };
  const tokens = new CryptoCatalogTokenAdapter();
  return {
    repository,
    storage,
    audit,
    objects,
    create: new CreateProductCatalogUseCase(repository, storage, clock),
    update: new UpdateProductCatalogUseCase(repository, storage, clock),
    share: new CreateProductCatalogShareUseCase(repository, tokens, clock),
    resolve: new ResolveSharedProductCatalogUseCase(repository, tokens, storage, clock),
    revoke: new RevokeProductCatalogShareUseCase(repository, clock),
    deletion: new ChangeProductCatalogDeletionUseCase(repository, clock),
  };
}
describe('catalog workflow', () => {
  it('uploads privately before metadata, returns a real catalog code and never audits storage keys', async () => {
    const s = setup(),
      result = await s.create.execute(metadata, file, actor);
    expect(result.catalog.code).toBe('CAT-0001');
    expect(s.objects.get(result.catalog.objectKey)).toEqual(file.content);
    expect(JSON.stringify(s.audit)).not.toContain(result.catalog.objectKey);
    expect(s.audit[0]?.changes.actor?.after).toEqual({ id: actor.id, email: actor.email });
    const failing = setup();
    vi.mocked(failing.storage.put).mockRejectedValue(new Error('unavailable'));
    await expect(failing.create.execute(metadata, file, actor)).rejects.toThrow();
    expect(failing.repository.insert).not.toHaveBeenCalled();
  });
  it('does not replace or delete the previous PDF when upload or version checking fails', async () => {
    const s = setup(),
      created = await s.create.execute(metadata, file, actor);
    const updated = await s.update.execute(
      created.catalog.id,
      { ...metadata, title: 'Nuevo', expectedUpdatedAt: created.catalog.updatedAt.toISOString() },
      { ...file, filename: 'Nuevo.pdf' },
      actor,
    );
    expect(updated.catalog.updatedAt.getTime()).toBeGreaterThan(
      created.catalog.updatedAt.getTime(),
    );
    expect(updated.catalog.objectKey).not.toBe(created.catalog.objectKey);
    expect(s.objects.has(created.catalog.objectKey)).toBe(true);
    await expect(
      s.update.execute(
        created.catalog.id,
        { ...metadata, expectedUpdatedAt: created.catalog.updatedAt.toISOString() },
        undefined,
        actor,
      ),
    ).rejects.toThrow(ConflictError);
    expect((await s.repository.find(created.catalog.id))?.catalog.title).toBe('Nuevo');
  });
  it('stores only token digests, counts resolve once per call and keeps share version stable on downloads/views', async () => {
    const s = setup(),
      created = await s.create.execute(metadata, file, actor);
    const generated = await s.share.execute(
      created.catalog.id,
      { term: '7d', note: 'Cliente', expectedUpdatedAt: created.catalog.updatedAt.toISOString() },
      actor,
    );
    expect(JSON.stringify(generated.record)).not.toContain(generated.token);
    expect(JSON.stringify(s.audit)).not.toContain(generated.token);
    expect(JSON.stringify(s.audit)).not.toContain(generated.share.tokenDigest);
    await s.resolve.verify(generated.token);
    const verified = (await s.repository.find(created.catalog.id))!.shares[0]!;
    expect(verified.views).toBe(0);
    expect(verified.lastViewedAt).toBeNull();
    expect(s.storage.get).not.toHaveBeenCalled();
    await s.resolve.execute(generated.token, false);
    await s.resolve.execute(generated.token, true);
    const share = (await s.repository.find(created.catalog.id))!.shares[0]!;
    expect(share.views).toBe(1);
    expect(share.updatedAt).toEqual(generated.share.updatedAt);
    await s.revoke.execute(
      created.catalog.id,
      share.id,
      generated.share.updatedAt.toISOString(),
      actor,
    );
    await expect(s.resolve.execute(generated.token, false)).rejects.toThrow(
      'SharedCatalog not found',
    );
    await expect(s.resolve.execute(generated.token, true)).rejects.toThrow(
      'SharedCatalog not found',
    );
  });
  it('soft deletion preserves bytes but permanently revokes links through restoration', async () => {
    const s = setup(),
      created = await s.create.execute(metadata, file, actor);
    const generated = await s.share.execute(
      created.catalog.id,
      { term: 'never', note: '', expectedUpdatedAt: created.catalog.updatedAt.toISOString() },
      actor,
    );
    const deleted = await s.deletion.execute(
      created.catalog.id,
      generated.record.catalog.updatedAt.toISOString(),
      false,
      actor,
    );
    expect(deleted.shares[0]?.revokedAt).not.toBeNull();
    expect(s.objects.has(created.catalog.objectKey)).toBe(true);
    await s.deletion.execute(
      created.catalog.id,
      deleted.catalog.updatedAt.toISOString(),
      true,
      actor,
    );
    await expect(s.resolve.execute(generated.token, true)).rejects.toThrow(
      'SharedCatalog not found',
    );
  });
  it('requires current validity when generating and resolving, including after validity edits', async () => {
    const s = setup(),
      created = await s.create.execute({ ...metadata, validFrom: '2027-01-01' }, file, actor);
    await expect(
      s.share.execute(
        created.catalog.id,
        { term: 'never', note: '', expectedUpdatedAt: created.catalog.updatedAt.toISOString() },
        actor,
      ),
    ).rejects.toThrow('Only current');
    const current = await s.update.execute(
      created.catalog.id,
      { ...metadata, expectedUpdatedAt: created.catalog.updatedAt.toISOString() },
      undefined,
      actor,
    );
    const generated = await s.share.execute(
      created.catalog.id,
      { term: 'never', note: '', expectedUpdatedAt: current.catalog.updatedAt.toISOString() },
      actor,
    );
    await s.update.execute(
      created.catalog.id,
      {
        ...metadata,
        validUntil: '2026-01-02',
        expectedUpdatedAt: generated.record.catalog.updatedAt.toISOString(),
      },
      undefined,
      actor,
    );
    await expect(s.resolve.execute(generated.token, false)).rejects.toThrow(
      'SharedCatalog not found',
    );
    await expect(s.resolve.execute(generated.token, true)).rejects.toThrow(
      'SharedCatalog not found',
    );
  });
  it('uses a generic public error without including the token and restricts deleted inventory to editors', async () => {
    const s = setup();
    for (const token of ['secret-invalid', 'A'.repeat(43)]) {
      try {
        await s.resolve.execute(token, false);
        throw new Error('Expected rejection');
      } catch (error) {
        expect(JSON.stringify(error)).not.toContain(token);
        expect(error).toBeInstanceOf(NotFoundError);
      }
    }
    const list = new ListProductCatalogsUseCase(s.repository, clock);
    await expect(
      list.execute(
        { page: 1, pageSize: 100, includeDeleted: true },
        { ...actor, roles: [Role.Sales] },
      ),
    ).rejects.toThrow('Only catalog editors');
    expect(s.repository.list).not.toHaveBeenCalled();
  });
});
