import { newUuid } from '@cdr/shared';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import {
  products,
  equivalenceGroups,
  equivalenceGroupMembers,
  auditEntries,
} from '../../src/database/schema';
import { DrizzleUnifiedCodeRequests } from '../../src/modules/equivalences/infrastructure/persistence/drizzle-unified-code-requests';
import { createAuditEntry, AuditAction } from '../../src/modules/audit/domain/entities/audit-entry';
import type { UnifiedCodeRequest } from '../../src/modules/equivalences/domain/ports/unified-code-requests.port';
import { createTestDatabase, type TestDatabase } from './database.helper';
const productId = newUuid(),
  groupId = newUuid();
const audit = (id: string, action: AuditAction) =>
  createAuditEntry({
    resourceType: 'unified_code_request',
    resourceId: id,
    action,
    actorId: 'admin-test',
    source: 'api',
    correlationId: newUuid(),
    occurredAt: new Date(),
    changes: {},
  });
function request(): UnifiedCodeRequest {
  const now = new Date();
  return {
    id: newUuid(),
    productId,
    sku: 'TEST-1',
    currentCode: '6205',
    action: 'correct',
    proposedCode: '6206',
    reason: 'Medidas diferentes',
    status: 'pending_dispatch',
    requestedBy: 'admin-test',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}
describe('unified code request persistence', () => {
  let database: TestDatabase;
  let repository: DrizzleUnifiedCodeRequests;
  beforeAll(async () => {
    database = await createTestDatabase();
    repository = new DrizzleUnifiedCodeRequests(database.db);
  });
  beforeEach(async () => {
    await database.truncateAll();
    await database.db.insert(products).values({ id: productId, sku: 'TEST-1', name: 'Prueba' });
    await database.db.insert(equivalenceGroups).values({ id: groupId, code: '6205', name: '6205' });
    await database.db.insert(equivalenceGroupMembers).values({ groupId, productId });
  });
  afterAll(async () => {
    if (database) await database.close();
  });
  it('persists an auditable pending request while preserving actual group membership', async () => {
    const input = request();
    await repository.create(input, audit(input.id, AuditAction.Created));
    expect(await repository.list('TEST-1')).toMatchObject([
      { status: 'pending_dispatch', proposedCode: '6206', currentCode: '6205' },
    ]);
    expect(await database.db.select().from(equivalenceGroupMembers)).toMatchObject([
      { groupId, productId },
    ]);
    expect(await database.db.select().from(equivalenceGroups)).toMatchObject([{ code: '6205' }]);
    expect(await database.db.select().from(auditEntries)).toHaveLength(1);
  });
  it('rejects an outdated group snapshot and stale queue edits', async () => {
    const input = request();
    await expect(
      repository.create({ ...input, currentCode: 'STALE' }, audit(input.id, AuditAction.Created)),
    ).rejects.toThrow(/grupo del SKU cambió/);
    await repository.create(input, audit(input.id, AuditAction.Created));
    const edit = {
      action: 'move' as const,
      proposedCode: '6207',
      reason: 'Otro grupo',
      expectedVersion: 1,
      updatedAt: new Date(),
    };
    expect(
      await repository.update(input.id, edit, audit(input.id, AuditAction.Updated)),
    ).toMatchObject({ version: 2, proposedCode: '6207', status: 'pending_dispatch' });
    await expect(
      repository.update(input.id, edit, audit(input.id, AuditAction.Updated)),
    ).rejects.toThrow(/Otra persona/);
  });
});
