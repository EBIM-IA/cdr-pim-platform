import { createDefaultPdfDesignConfig, type PdfDesignSettingsDto } from '@cdr/contracts';
import { ConflictError, newUuid } from '@cdr/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createAuditEntry } from '../../src/modules/audit/domain/entities/audit-entry';
import { DrizzlePdfDesignSettings } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-pdf-design-settings';
import {
  createTestDatabase,
  expectConstraintViolation,
  type TestDatabase,
} from './database.helper';

const now = new Date('2026-11-20T14:00:00.000Z');
const audit = () =>
  createAuditEntry({
    resourceType: 'pdf_design',
    resourceId: 'default',
    action: 'updated',
    actorId: 'admin',
    source: 'test',
    correlationId: newUuid(),
    occurredAt: now,
    changes: { configuration: { before: 'anterior', after: 'nuevo' } },
  });
function input(updatedAt: string | null = null, name = 'Diseño aprobado'): PdfDesignSettingsDto {
  const config = createDefaultPdfDesignConfig();
  config.designs[0]!.name = name;
  return { config, updatedAt };
}

describe('Shared PDF design persistence and bulk permissions', () => {
  let database: TestDatabase;
  let repository: DrizzlePdfDesignSettings;
  beforeAll(async () => {
    database = await createTestDatabase();
    repository = new DrizzlePdfDesignSettings(database.db);
  });
  beforeEach(async () => {
    await database.truncateAll();
  });
  afterAll(async () => {
    if (database) await database.close();
  });

  it('returns approved defaults without writing, then shares saved settings across instances', async () => {
    expect(await repository.get()).toEqual({
      config: createDefaultPdfDesignConfig(),
      updatedAt: null,
    });
    expect(await database.sql`SELECT * FROM pdf_design_settings`).toHaveLength(0);
    const stored = await repository.save(input(), audit());
    expect(stored.updatedAt).toBe(now.toISOString());
    expect(await new DrizzlePdfDesignSettings(database.db).get()).toEqual(stored);
    const [entry] =
      await database.sql`SELECT resource_type, resource_id, actor_id FROM audit_entries`;
    expect(entry).toMatchObject({
      resource_type: 'pdf_design',
      resource_id: 'default',
      actor_id: 'admin',
    });
  });

  it('allows one concurrent initial writer and records only its audit entry', async () => {
    const results = await Promise.allSettled([
      repository.save(input(null, 'Diseño A'), audit()),
      repository.save(input(null, 'Diseño B'), audit()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: expect.any(ConflictError),
    });
    expect(await database.sql`SELECT * FROM pdf_design_settings`).toHaveLength(1);
    expect(await database.sql`SELECT * FROM audit_entries`).toHaveLength(1);
  });

  it('rejects a stale concurrent update and advances the token with a fixed clock', async () => {
    const initial = await repository.save(input(), audit());
    const results = await Promise.allSettled([
      repository.save(input(initial.updatedAt, 'Diseño A'), audit()),
      repository.save(input(initial.updatedAt, 'Diseño B'), audit()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: expect.any(ConflictError),
    });
    expect((await repository.get()).updatedAt).toBe('2026-11-20T14:00:00.001Z');
    expect(await database.sql`SELECT * FROM audit_entries`).toHaveLength(2);
  });

  it('rolls back the settings update when its append-only audit cannot be inserted', async () => {
    const entry = audit();
    const initial = await repository.save(input(), entry);
    await expect(
      repository.save(input(initial.updatedAt, 'No debe persistir'), entry),
    ).rejects.toThrow();
    expect(await repository.get()).toEqual(initial);
    expect(await database.sql`SELECT * FROM audit_entries`).toHaveLength(1);
  });

  it('persists revocable consultation bulk grants and rejects disabling the administrator at the database boundary', async () => {
    await database.sql`INSERT INTO identity_module_policies (role, capability, visible, actor_id) VALUES ('VENTAS', 'technical-sheets:bulk', false, 'admin')`;
    expect(
      await database.sql`SELECT role, capability, visible FROM identity_module_policies`,
    ).toEqual([{ role: 'VENTAS', capability: 'technical-sheets:bulk', visible: false }]);
    await expectConstraintViolation(
      database.sql`INSERT INTO identity_module_policies (role, capability, visible, actor_id) VALUES ('ADMINISTRADOR', 'technical-sheets:bulk', false, 'admin')`,
      'administrator_bulk_pdf_access',
    );
  });
});
