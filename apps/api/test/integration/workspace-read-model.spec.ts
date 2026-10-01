import { loadApiEnv } from '@cdr/config';
import { workspaceSchema, workspaceSlugSchema } from '@cdr/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresWorkspaceReadModel } from '../../src/modules/workspaces/infrastructure/postgres-workspace-read-model';
import { Role, type AuthenticatedActor } from '../../src/modules/identity/domain/entities/role';
import { type TestDatabase, createTestDatabase, testDatabaseUrl } from './database.helper';

const PRODUCT_ID = '10000000-0000-4000-8000-000000000001';
const GROUP_ID = '20000000-0000-4000-8000-000000000001';

const actor: AuthenticatedActor = {
  id: 'integration-viewer',
  email: 'viewer@casadelruliman.com',
  roles: [Role.Viewer],
};

describe('PostgresWorkspaceReadModel', () => {
  let database: TestDatabase;
  let readModel: PostgresWorkspaceReadModel;

  beforeAll(async () => {
    database = await createTestDatabase();
    const env = loadApiEnv({
      NODE_ENV: 'test',
      APP_ENV: 'test',
      DATABASE_URL: testDatabaseUrl(),
      AUTH_MODE: 'local',
      AUTH_LOCAL_USER_ID: 'integration-viewer',
      AUTH_LOCAL_EMAIL: actor.email,
      AUTH_LOCAL_PASSWORD: 'integration-local-password',
      AUTH_LOCAL_ROLES: 'VIEWER',
      JWT_ACCESS_SECRET: 'integration-test-access-secret-32-chars',
      QUEUE_DRIVER: 'memory',
      STORAGE_DRIVER: 'memory',
      AI_PROVIDER: 'fake',
    });
    readModel = new PostgresWorkspaceReadModel(database.sql, env);
  });

  beforeEach(async () => {
    await database.truncateAll();
    await database.sql`
      INSERT INTO products (id, sku, name, description, brand, status)
      VALUES (${PRODUCT_ID}, 'SKU-001', 'Rodamiento de prueba', NULL, NULL, 'in_review')
    `;
    await database.sql`
      INSERT INTO equivalence_groups (id, code, name, kind)
      VALUES (${GROUP_ID}, 'UNIF-001', 'Grupo de prueba', 'interchange')
    `;
    await database.sql`
      INSERT INTO equivalence_group_members (group_id, product_id, role)
      VALUES (${GROUP_ID}, ${PRODUCT_ID}, 'member')
    `;
  });

  afterAll(async () => {
    await database?.close();
  });

  it('returns a contract-valid projection for every web workspace', async () => {
    const projections = await Promise.all(
      workspaceSlugSchema.options.map((slug) => readModel.read(slug, actor)),
    );

    expect(projections).toHaveLength(11);
    for (const projection of projections) {
      expect(() => workspaceSchema.parse(projection)).not.toThrow();
    }
  });

  it('uses persisted catalog and equivalence data without inventing missing capabilities', async () => {
    const [equivalences, quality, publication, reports, templates] = await Promise.all([
      readModel.read('equivalences', actor),
      readModel.read('quality', actor),
      readModel.read('publication', actor),
      readModel.read('reports', actor),
      readModel.read('templates', actor),
    ]);

    expect(equivalences.rows[0]?.values).toMatchObject({
      code: 'UNIF-001',
      members: 1,
      skus: 'SKU-001',
    });
    expect(quality.totalRows).toBe(1);
    expect(quality.rows[0]?.values.findings).toContain('marca faltante');
    expect(publication.totalRows).toBe(1);
    expect(reports.metrics).toContainEqual({
      key: 'products',
      label: 'Productos',
      value: 1,
      format: 'integer',
    });
    expect(templates.operationalStatus).toBe('blocked');
    expect(templates.rows).toEqual([]);
  });
});
