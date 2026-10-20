import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUuid } from '@cdr/shared';

import { AuditAction, createAuditEntry } from '../../src/modules/audit/domain/entities/audit-entry';
import { PostgresAuditAdapter } from '../../src/modules/audit/infrastructure/persistence/postgres-audit.adapter';
import { type TestDatabase, createTestDatabase } from './database.helper';

describe('PostgresAuditAdapter field-level history', () => {
  let database: TestDatabase;
  let audit: PostgresAuditAdapter;

  beforeAll(async () => {
    database = await createTestDatabase();
    audit = new PostgresAuditAdapter(database.db);
  });
  beforeEach(() => database.truncateAll());
  afterAll(() => database.close());

  it('returns one row per field and tracks when the previous value became valid', async () => {
    const resourceId = newUuid();
    const sku = `AUD-${newUuid().slice(0, 8)}`;
    const firstAt = new Date('2026-09-01T10:00:00.000Z');
    await audit.record(
      createAuditEntry({
        resourceType: 'product',
        resourceId,
        action: AuditAction.Created,
        actorId: 'buyer-1',
        source: 'api',
        correlationId: newUuid(),
        occurredAt: firstAt,
        changes: { sku: { after: sku }, diameter: { after: 10 } },
      }),
    );
    await audit.record(
      createAuditEntry({
        resourceType: 'product',
        resourceId,
        action: AuditAction.Updated,
        actorId: 'buyer-2',
        source: 'import:attributes',
        correlationId: newUuid(),
        occurredAt: new Date('2026-09-02T10:00:00.000Z'),
        changes: { diameter: { before: 10, after: 11 } },
      }),
    );

    const page = await audit.listChanges({
      page: 1,
      pageSize: 25,
      sku,
      resourceType: 'product',
      field: 'diameter',
    });

    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      sku,
      before: 10,
      after: 11,
      actorId: 'buyer-2',
      source: 'import:attributes',
      previousValueValidFrom: firstAt,
    });
  });

  it('rejects updates and deletes at the database boundary', async () => {
    const entry = createAuditEntry({
      resourceType: 'product',
      resourceId: newUuid(),
      action: AuditAction.Updated,
      actorId: null,
      source: 'worker:test',
      correlationId: newUuid(),
      occurredAt: new Date(),
      changes: { status: { before: 'draft', after: 'published' } },
    });
    await audit.record(entry);

    await expect(
      database.sql`DELETE FROM audit_change_items WHERE audit_entry_id = ${entry.id}`,
    ).rejects.toThrow(/append-only/);
  });

  it('cleans audit data between tests without weakening its append-only triggers', async () => {
    const entry = createAuditEntry({
      resourceType: 'product',
      resourceId: newUuid(),
      action: AuditAction.Created,
      actorId: 'integration-test',
      source: 'test',
      correlationId: newUuid(),
      occurredAt: new Date(),
      changes: { sku: { after: 'RESET-TEST' } },
    });
    await audit.record(entry);

    await database.truncateAll();

    const [entries] = await database.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM audit_entries
    `;
    const [items] = await database.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM audit_change_items
    `;
    expect({ entries: entries?.count, items: items?.count }).toEqual({ entries: 0, items: 0 });
    await expect(database.sql`TRUNCATE TABLE audit_entries CASCADE`).rejects.toThrow(/append-only/);
  });
});
