import { loadApiEnv } from '@cdr/config';
import { workspaceSchema, workspaceSlugSchema } from '@cdr/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresWorkspaceReadModel } from '../../src/modules/workspaces/infrastructure/postgres-workspace-read-model';
import { Role, type AuthenticatedActor } from '../../src/modules/identity/domain/entities/role';
import { type TestDatabase, createTestDatabase, testDatabaseUrl } from './database.helper';

const PRODUCT_ID = '10000000-0000-4000-8000-000000000001';
const GROUP_ID = '20000000-0000-4000-8000-000000000001';
const CATEGORY_ID = '30000000-0000-4000-8000-000000000001';
const TEMPLATE_ID = '40000000-0000-4000-8000-000000000001';
const ATTRIBUTE_ID = '50000000-0000-4000-8000-000000000001';
const ASSET_ID = '55000000-0000-4000-8000-000000000001';
const APPLICATION_ID = '60000000-0000-4000-8000-000000000001';
const HOMOLOG_ID = '70000000-0000-4000-8000-000000000001';
const BATCH_ID = '80000000-0000-4000-8000-000000000001';

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
    await database.sql`
      INSERT INTO catalog_categories (id, slug, name, path, position)
      VALUES (${CATEGORY_ID}, 'rodamientos', 'Rodamientos', 'rodamientos', 1)
    `;
    await database.sql`
      INSERT INTO attribute_templates (id, category_id, name, version, status)
      VALUES (${TEMPLATE_ID}, ${CATEGORY_ID}, 'Rodamiento', 1, 'active')
    `;
    await database.sql`
      INSERT INTO attribute_definitions (id, key, label, data_type, unit, source_authority)
      VALUES (${ATTRIBUTE_ID}, 'diametro_interior', 'Diámetro interior', 'measurement', 'mm', 'pim')
    `;
    await database.sql`
      INSERT INTO template_attribute_assignments (
        template_id, attribute_definition_id, position, required, replicable, active
      ) VALUES (${TEMPLATE_ID}, ${ATTRIBUTE_ID}, 1, true, true, true)
    `;
    await database.sql`
      INSERT INTO product_template_assignments (product_id, template_id)
      VALUES (${PRODUCT_ID}, ${TEMPLATE_ID})
    `;
    await database.sql`
      INSERT INTO template_asset_requirements (template_id, type_code, required, active)
      VALUES (${TEMPLATE_ID}, 'FT', true, true)
    `;
    await database.sql`
      INSERT INTO group_applications (
        id, equivalence_group_id, vehicle_type, make, model, year_from, year_to, active, source
      ) VALUES (${APPLICATION_ID}, ${GROUP_ID}, 'AUTOMOTRIZ', 'Toyota', 'Corolla', 2014, 2018, true, 'manual')
    `;
    await database.sql`
      INSERT INTO external_homologs (
        id, equivalence_group_id, external_code, external_brand, active, approval_status, source
      ) VALUES (${HOMOLOG_ID}, ${GROUP_ID}, 'ALT-001', 'WAGNER', true, 'approved', 'manual')
    `;
    await database.sql`
      INSERT INTO import_batches (
        id, target, format, status, idempotency_key, payload_hash, created_by,
        total_rows, valid_rows, invalid_rows
      ) VALUES (${BATCH_ID}, 'applications', 'json', 'confirmed', 'workspace-test', 'hash', ${actor.id}, 2, 1, 1)
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
    const [
      equivalences,
      quality,
      publication,
      reports,
      templates,
      applications,
      imports,
      categories,
    ] = await Promise.all([
      readModel.read('equivalences', actor),
      readModel.read('quality', actor),
      readModel.read('publication', actor),
      readModel.read('reports', actor),
      readModel.read('templates', actor),
      readModel.read('applications', actor),
      readModel.read('imports', actor),
      readModel.read('categories', actor),
    ]);

    expect(equivalences.rows[0]?.values).toMatchObject({
      code: 'UNIF-001',
      members: 1,
      skus: 'SKU-001',
    });
    expect(quality.totalRows).toBe(1);
    expect(quality.rows[0]?.values.findings).toContain('Diámetro interior');
    expect(quality.rows[0]?.values.findings).toContain('Ficha técnica (FT)');
    expect(publication.totalRows).toBe(1);
    expect(publication.rows[0]?.values).toMatchObject({
      eligibility: 'No publicable',
      missing: expect.stringContaining('Diámetro interior'),
    });
    expect(reports.metrics).toContainEqual({
      key: 'products',
      label: 'Productos',
      value: 1,
      format: 'integer',
    });
    expect(reports.metrics).toEqual(
      expect.arrayContaining([
        {
          key: 'affected-products',
          label: 'Productos con hallazgos',
          value: 1,
          format: 'integer',
        },
        {
          key: 'active-templates',
          label: 'Plantillas activas',
          value: 1,
          format: 'integer',
        },
      ]),
    );
    expect(reports.rows).toContainEqual(
      expect.objectContaining({
        values: { section: 'Categoría', indicator: 'Rodamientos', value: 1 },
      }),
    );
    expect(templates.operationalStatus).toBe('operational');
    expect(templates.rows[0]?.values).toMatchObject({
      category: 'Rodamientos',
      attributes: 1,
      replicable: 1,
    });
    expect(applications.rows[0]?.values).toMatchObject({
      unifiedCode: 'UNIF-001',
      make: 'Toyota',
      model: 'Corolla',
      status: 'Activo',
    });
    expect(equivalences.metrics).toContainEqual({
      key: 'eligible-homologs',
      label: 'Activos y aprobados',
      value: 1,
      format: 'integer',
    });
    expect(imports.rows[0]?.values).toMatchObject({
      target: 'applications',
      status: 'confirmed',
      totalRows: 2,
      invalidRows: 1,
    });
    expect(categories.rows).toContainEqual(
      expect.objectContaining({
        values: { dimension: 'Categoría', value: 'Rodamientos', products: 1 },
      }),
    );
  });

  it('improves completeness and publication eligibility after the required asset is uploaded', async () => {
    await database.sql`
      INSERT INTO product_attribute_values (
        product_id, attribute_definition_id, value_number, source, confidence, version
      ) VALUES (${PRODUCT_ID}, ${ATTRIBUTE_ID}, 25, 'manual', 1, 1)
    `;

    const [beforeQuality, beforePublication, beforeReports] = await Promise.all([
      readModel.read('quality', actor),
      readModel.read('publication', actor),
      readModel.read('reports', actor),
    ]);

    expect(beforeQuality.totalRows).toBe(1);
    expect(beforeQuality.metrics).toContainEqual({
      key: 'completion',
      label: 'Completitud media (%)',
      value: 50,
      format: 'integer',
    });
    expect(beforePublication.metrics).toContainEqual({
      key: 'publishable',
      label: 'Elegibilidad base',
      value: 0,
      format: 'integer',
    });
    expect(beforePublication.rows[0]?.values).toMatchObject({
      eligibility: 'No publicable',
      missing: 'Ficha técnica (FT)',
    });
    expect(beforeReports.metrics).toContainEqual({
      key: 'completion',
      label: 'Completitud media (%)',
      value: 50,
      format: 'integer',
    });

    // This row represents the metadata committed by the product-asset upload flow. No workbook
    // seed ever creates it on behalf of the product.
    await database.sql`
      INSERT INTO product_assets (
        id, product_id, kind, type_code, original_filename, object_key, bucket, mime_type,
        size_bytes, checksum_sha256, source, uploaded_by
      ) VALUES (
        ${ASSET_ID}, ${PRODUCT_ID}, 'document', 'FT', 'SKU-001__FT.pdf',
        'products/SKU-001/documents/ft.pdf', 'integration-assets', 'application/pdf',
        128, 'required-asset-checksum', 'manual', ${actor.id}
      )
    `;

    const [quality, publication, reports] = await Promise.all([
      readModel.read('quality', actor),
      readModel.read('publication', actor),
      readModel.read('reports', actor),
    ]);

    expect(quality.totalRows).toBe(0);
    expect(quality.metrics).toContainEqual({
      key: 'completion',
      label: 'Completitud media (%)',
      value: 100,
      format: 'integer',
    });
    expect(publication.metrics).toContainEqual({
      key: 'publishable',
      label: 'Elegibilidad base',
      value: 1,
      format: 'integer',
    });
    expect(publication.rows[0]?.values).toMatchObject({
      eligibility: 'Publicable',
      missing: '—',
    });
    expect(reports.metrics).toContainEqual({
      key: 'completion',
      label: 'Completitud media (%)',
      value: 100,
      format: 'integer',
    });
  });
});
