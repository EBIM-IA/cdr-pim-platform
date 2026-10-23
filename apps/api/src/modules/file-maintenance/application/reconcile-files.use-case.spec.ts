import { FixedClock } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';
import type { AuditEntry } from '../../audit/domain/entities/audit-entry';
import {
  DEFAULT_FILE_MAINTENANCE_OPTIONS,
  type CleanupCandidate,
  type FileInventoryPort,
  type FileMaintenanceRepositoryPort,
  type FileObjectIdentity,
  type FileObjectReferencesPort,
} from '../domain/ports/file-maintenance.port';
import { managedFileKey, ReconcileFilesUseCase } from './reconcile-files.use-case';
const key =
  'product-catalogs/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf';
const object: FileObjectIdentity = {
  bucket: 'private',
  key,
  identity: 'v:one',
  versionId: 'one',
  etag: 'etag',
  modifiedAt: new Date('2020-01-01T00:00:00Z'),
  size: 100,
  deleteMarker: false,
};
function setup() {
  const clock = new FixedClock(new Date('2026-10-23T12:00:00Z')),
    candidates = new Map<string, CleanupCandidate>(),
    protectedKeys = new Set<string>(),
    completed = new Set<string>(),
    cursors = new Map<string, string | null>(),
    audit: AuditEntry[] = [];
  let locked = false;
  const repository: FileMaintenanceRepositoryPort = {
    withRunLock: vi.fn(async (_now, _lease, work) => {
      if (locked) return null;
      locked = true;
      try {
        return await work();
      } finally {
        locked = false;
      }
    }),
    cursor: vi.fn(async (namespace) => cursors.get(namespace) ?? null),
    saveCursor: vi.fn(async (namespace, cursor) => {
      cursors.set(namespace, cursor);
    }),
    observeBatch: vi.fn(async (observations) => {
      for (const row of observations) {
        if (completed.has(row.object.identity)) continue;
        if (!row.unreferencedAt) candidates.delete(row.object.identity);
        else if (!candidates.has(row.object.identity))
          candidates.set(row.object.identity, {
            id: row.object.identity,
            object: row.object,
            firstUnreferencedAt: row.unreferencedAt,
          });
      }
    }),
    due: vi.fn(async (cutoff, limit) =>
      [...candidates.values()].filter((item) => item.firstUnreferencedAt <= cutoff).slice(0, limit),
    ),
    withCandidate: vi.fn(async (id, work) =>
      candidates.has(id) ? work(candidates.get(id)!, { id: Symbol() }) : null,
    ),
    preserve: vi.fn(async (id) => {
      candidates.delete(id);
    }),
    complete: vi.fn(async (id, _now, entry) => {
      candidates.delete(id);
      completed.add(id);
      audit.push(entry);
    }),
    fail: vi.fn(async () => undefined),
  };
  const inventory: FileInventoryPort = {
    listPage: vi.fn(async (input) => ({
      items: input.prefix === 'product-catalogs/' ? [object] : [],
      nextCursor: null,
    })),
    purgeIdentity: vi.fn(async () => 'deleted' as const),
  };
  const refs: FileObjectReferencesPort = {
    inspect: vi.fn(async (_bucket: string, keys: readonly string[]) =>
      keys
        .filter((key) => protectedKeys.has(key))
        .map((key) => ({ key, protected: true, retiredAt: null })),
    ),
  };
  const empty: FileObjectReferencesPort = { inspect: vi.fn(async () => []) };
  const useCase = new ReconcileFilesUseCase(repository, inventory, empty, refs, clock, {
    ...DEFAULT_FILE_MAINTENANCE_OPTIONS,
    enabled: true,
  });
  return {
    clock,
    candidates,
    protectedKeys,
    completed,
    cursors,
    audit,
    repository,
    inventory,
    refs,
    empty,
    useCase,
  };
}
describe('durable 30-day file cleanup', () => {
  it('starts retention at first unreferenced observation, not the original upload age, and is idempotent', async () => {
    const s = setup();
    await s.useCase.execute();
    expect(s.inventory.purgeIdentity).not.toHaveBeenCalled();
    s.clock.advance(30 * 86400000 - 1);
    await s.useCase.execute();
    expect(s.inventory.purgeIdentity).not.toHaveBeenCalled();
    s.clock.advance(1);
    expect((await s.useCase.execute()).deleted).toBe(1);
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0]?.changes.retainedDays?.after).toBe(30);
    await s.useCase.execute();
    expect(s.inventory.purgeIdentity).toHaveBeenCalledTimes(1);
  });
  it('always protects current catalog references including recoverable soft-deleted rows', async () => {
    const s = setup();
    s.protectedKeys.add(key);
    await s.useCase.execute();
    s.clock.advance(40 * 86400000);
    await s.useCase.execute();
    expect(s.candidates.size).toBe(0);
    expect(s.inventory.purgeIdentity).not.toHaveBeenCalled();
  });
  it('rechecks references inside the object lock and restarts retention after a reference returns', async () => {
    const s = setup();
    await s.useCase.execute();
    s.clock.advance(31 * 86400000);
    vi.mocked(s.refs.inspect).mockImplementation(async (_bucket, keys, scope) =>
      scope ? keys.map((key) => ({ key, protected: true, retiredAt: null })) : [],
    );
    await s.useCase.execute();
    expect(s.inventory.purgeIdentity).not.toHaveBeenCalled();
    expect(s.repository.preserve).toHaveBeenCalledOnce();
    vi.mocked(s.refs.inspect).mockResolvedValue([]);
    await s.useCase.execute();
    s.clock.advance(29 * 86400000);
    await s.useCase.execute();
    expect(s.inventory.purgeIdentity).not.toHaveBeenCalled();
  });
  it('preserves an asset retired less than 30 days ago even when a stale candidate predates it', async () => {
    const s = setup();
    await s.useCase.execute();
    s.clock.advance(31 * 86400000);
    vi.mocked(s.empty.inspect).mockResolvedValue([
      { key, protected: false, retiredAt: s.clock.now() },
    ]);
    await s.useCase.execute();
    expect(s.inventory.purgeIdentity).not.toHaveBeenCalled();
  });
  it('retries failed physical deletion and never records a successful purge for an error', async () => {
    const s = setup();
    await s.useCase.execute();
    s.clock.advance(31 * 86400000);
    vi.mocked(s.inventory.purgeIdentity).mockRejectedValueOnce(new Error('denied'));
    expect((await s.useCase.execute()).failed).toBe(1);
    expect(s.audit).toHaveLength(0);
    expect(s.candidates.size).toBe(1);
    expect((await s.useCase.execute()).deleted).toBe(1);
    expect(s.audit).toHaveLength(1);
  });
  it('recovers after physical deletion when audit finalization fails without claiming bytes twice', async () => {
    const s = setup();
    await s.useCase.execute();
    s.clock.advance(31 * 86400000);
    const complete = s.repository.complete;
    vi.mocked(s.repository.complete).mockRejectedValueOnce(new Error('database unavailable'));
    expect((await s.useCase.execute()).failed).toBe(1);
    expect(s.audit).toHaveLength(0);
    vi.mocked(s.inventory.purgeIdentity).mockResolvedValueOnce('absent');
    s.repository.complete = complete;
    const retry = await s.useCase.execute();
    expect(retry.absent).toBe(1);
    expect(retry.reclaimedBytes).toBe(0);
    expect(s.audit).toHaveLength(1);
  });
  it('advances bounded durable cursors and rejects unmanaged keys instead of broad bucket cleanup', async () => {
    const s = setup();
    vi.mocked(s.inventory.listPage).mockImplementation(async (input) => ({
      items: [{ ...object, key: 'other/file.pdf' }],
      nextCursor: input.cursor ? null : 'page-two',
    }));
    await s.useCase.execute();
    expect(s.cursors.get('products/')).toBe('page-two');
    expect(s.candidates.size).toBe(0);
    await s.useCase.execute();
    expect(s.cursors.get('products/')).toBeNull();
    expect(s.inventory.listPage).toHaveBeenCalledTimes(4);
    expect(managedFileKey('products/a/../documents/file.pdf')).toBe(false);
    expect(managedFileKey(key)).toBe(true);
  });
});
