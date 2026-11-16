import { FixedClock, ConflictError, assertUuid } from '@cdr/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleApplicationColumnSettings } from '../../src/modules/applications/infrastructure/persistence/drizzle-application-column-settings';
import { DrizzleGroupApplicationRepository } from '../../src/modules/applications/infrastructure/persistence/drizzle-group-application.repository';
import { ApplicationColumnSettingsUseCases } from '../../src/modules/applications/application/application-column-settings.use-cases';
import {
  CreateGroupApplicationUseCase,
  UpdateGroupApplicationUseCase,
} from '../../src/modules/applications/application/manage-applications.use-cases';
import { type TestDatabase, createTestDatabase } from './database.helper';
const actor: import('../../src/modules/identity/domain/entities/role').AuthenticatedActor = {
  id: 'admin',
  email: 'admin@example.test',
  roles: ['ADMINISTRADOR'],
};
const groupId = assertUuid('20000000-0000-4000-8000-000000000001');
describe('customer application column persistence', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  beforeEach(async () => {
    await database.truncateAll();
    await database.sql`INSERT INTO equivalence_groups (id,code,name,kind) VALUES (${groupId},'COLUMN-QA','QA','interchange')`;
  });
  afterAll(() => database?.close());
  it('starts empty, audits configuration, prevents stale saves, and retains additional values across partial edits', async () => {
    const settings = new DrizzleApplicationColumnSettings(database.db);
    expect(await settings.get()).toEqual({ columns: [], version: 0 });
    const clock = new FixedClock(new Date('2026-11-16T12:00:00Z'));
    const configure = new ApplicationColumnSettingsUseCases(settings, clock);
    const columns = [
      {
        key: 'campo_cliente',
        header: 'Campo Excel',
        label: 'Campo cliente',
        required: true,
        aliases: ['Dato proveedor'],
      },
      { key: 'otro_dato', header: 'Otro dato', label: 'Otro dato', required: false, aliases: [] },
    ];
    const configured = await configure.update({ columns, expectedVersion: 0 }, actor);
    expect(configured.version).toBe(1);
    await expect(
      configure.update({ columns: [], expectedVersion: 0 }, actor),
    ).rejects.toBeInstanceOf(ConflictError);
    const repository = new DrizzleGroupApplicationRepository(database.db);
    const created = await new CreateGroupApplicationUseCase(repository, clock, settings).execute(
      {
        unifiedCode: 'COLUMN-QA',
        vehicleType: 'AUTOMOTRIZ',
        make: 'Marca',
        model: 'Modelo',
        additionalFields: { campo_cliente: 'Dato aprobado', otro_dato: 'Conservar' },
      },
      actor,
    );
    const snapshot = created.toSnapshot();
    const updated = await new UpdateGroupApplicationUseCase(repository, clock, settings).execute(
      snapshot.id,
      {
        expectedUpdatedAt: snapshot.updatedAt.toISOString(),
        additionalFields: { campo_cliente: 'Dato corregido' },
      },
      actor,
    );
    expect(updated.toSnapshot().additionalFields).toEqual({
      campo_cliente: 'Dato corregido',
      otro_dato: 'Conservar',
    });
    expect(
      (await repository.list({ includeInactive: false }))[0]?.toSnapshot().additionalFields,
    ).toEqual(updated.toSnapshot().additionalFields);
    const [audit] = await database.sql<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM audit_entries WHERE resource_type='application_column_settings'`;
    expect(audit?.count).toBe(1);
  });
});
