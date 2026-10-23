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
const AUDIT_ATTRIBUTE_ID = '90000000-0000-4000-8000-000000000001';
const AUDIT_APPLICATION_ID = '90000000-0000-4000-8000-000000000002';
const AUDIT_NOVEMBER_ID = '90000000-0000-4000-8000-000000000003';
const AUDIT_CHANGE_ID = '91000000-0000-4000-8000-000000000001';

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
      INSERT INTO attribute_templates (id, category_id, variant_key, name, version, status)
      VALUES (${TEMPLATE_ID}, ${CATEGORY_ID}, '22.1', 'Rodamiento', 1, 'active')
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

    expect(projections).toHaveLength(12);
    for (const projection of projections) {
      expect(() => workspaceSchema.parse(projection)).not.toThrow();
    }
  });

  it('rolls product counts up to real root categories across leaves and template variants', async () => {
    const branchId = '30000000-0000-4000-8000-000000000002';
    const leafId = '30000000-0000-4000-8000-000000000003';
    const secondLeafId = '30000000-0000-4000-8000-000000000004';
    const emptyRootId = '30000000-0000-4000-8000-000000000005';
    const inactiveLeafId = '30000000-0000-4000-8000-000000000006';
    const variantTemplateId = '40000000-0000-4000-8000-000000000002';
    const secondTemplateId = '40000000-0000-4000-8000-000000000003';
    const inactiveTemplateId = '40000000-0000-4000-8000-000000000004';
    const secondProductId = '10000000-0000-4000-8000-000000000002';
    const thirdProductId = '10000000-0000-4000-8000-000000000003';
    const inactiveProductId = '10000000-0000-4000-8000-000000000004';
    await database.sql`
      INSERT INTO catalog_categories (id, parent_id, slug, name, path, active)
      VALUES
        (${branchId}, ${CATEGORY_ID}, 'bolas', 'De bolas', 'rodamientos/bolas', true),
        (${leafId}, ${branchId}, 'rigidos', 'Rígidos', 'rodamientos/bolas/rigidos', true),
        (${secondLeafId}, ${branchId}, 'axiales', 'Axiales', 'rodamientos/bolas/axiales', true),
        (${emptyRootId}, NULL, 'frenos', 'Frenos', 'frenos', true),
        (${inactiveLeafId}, ${branchId}, 'inactivos', 'Inactivos', 'rodamientos/bolas/inactivos', false)
    `;
    await database.sql`
      UPDATE attribute_templates SET category_id = ${leafId} WHERE id = ${TEMPLATE_ID}
    `;
    await database.sql`
      INSERT INTO attribute_templates (id, category_id, variant_key, name, version, status)
      VALUES
        (${variantTemplateId}, ${leafId}, '22.2', 'Segunda variante', 1, 'active'),
        (${secondTemplateId}, ${secondLeafId}, '23', 'Axial', 1, 'active'),
        (${inactiveTemplateId}, ${inactiveLeafId}, '24', 'No vigente', 1, 'active')
    `;
    await database.sql`
      INSERT INTO products (id, sku, name, status)
      VALUES
        (${secondProductId}, 'SKU-002', 'Segunda variante', 'in_review'),
        (${thirdProductId}, 'SKU-003', 'Otra hoja', 'in_review'),
        (${inactiveProductId}, 'SKU-004', 'Categoría inactiva', 'in_review')
    `;
    await database.sql`
      INSERT INTO product_template_assignments (product_id, template_id)
      VALUES
        (${secondProductId}, ${variantTemplateId}),
        (${thirdProductId}, ${secondTemplateId}),
        (${inactiveProductId}, ${inactiveTemplateId})
    `;

    const reports = await readModel.read('reports', actor, { report: 'summary' });
    const categories = reports.rows.filter((row) => row.values.section === 'Categoría');

    expect(categories).toEqual([
      {
        id: `category:${CATEGORY_ID}`,
        values: {
          section: 'Categoría',
          indicator: 'Rodamientos',
          value: 3,
        },
      },
      {
        id: `category:${emptyRootId}`,
        values: {
          section: 'Categoría',
          indicator: 'Frenos',
          value: 0,
        },
      },
    ]);
    expect(() => workspaceSchema.parse(reports)).not.toThrow();
  });

  it('exposes product catalogs as blocked without records or simulated write endpoints', async () => {
    const catalogs = await readModel.read('catalogs', actor);

    expect(() => workspaceSchema.parse(catalogs)).not.toThrow();
    expect(catalogs.operationalStatus).toBe('blocked');
    expect(catalogs.rows).toEqual([]);
    expect(catalogs.totalRows).toBe(0);
    expect(catalogs.metrics).toContainEqual({
      key: 'catalogs',
      label: 'Catálogos registrados',
      value: 0,
      format: 'integer',
    });
    expect(catalogs.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'upload-catalog', availability: 'blocked' }),
        expect.objectContaining({ id: 'share-catalog', availability: 'blocked' }),
      ]),
    );
    expect(
      catalogs.actions
        .filter((action) => action.id !== 'refresh')
        .every((action) => action.availability === 'blocked'),
    ).toBe(true);
  });

  it('reports the local AX mock honestly without treating it as the production adapter', async () => {
    const integrations = await readModel.read('integrations', actor);

    expect(integrations.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ax',
          values: expect.objectContaining({ configured: false }),
        }),
        expect.objectContaining({
          id: 'ax-mock',
          values: expect.objectContaining({
            configured: false,
            state: expect.stringContaining('Deshabilitado por defecto'),
          }),
        }),
      ]),
    );
    expect(integrations.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'receive-ax-mock-batch',
          availability: 'blocked',
        }),
        expect.objectContaining({ id: 'sync-ax', availability: 'blocked' }),
      ]),
    );
  });

  it('publishes the provisional AX receiver only when local mock mode is explicit', async () => {
    const localMock = new PostgresWorkspaceReadModel(
      database.sql,
      loadApiEnv({
        NODE_ENV: 'test',
        APP_ENV: 'test',
        DATABASE_URL: testDatabaseUrl(),
        AUTH_MODE: 'local',
        AUTH_LOCAL_USER_ID: 'integration-viewer',
        AUTH_LOCAL_EMAIL: actor.email,
        AUTH_LOCAL_PASSWORD: 'integration-local-password',
        AUTH_LOCAL_ROLES: 'VIEWER',
        JWT_ACCESS_SECRET: 'integration-test-access-secret-32-chars',
        AX_MOCK_MODE: 'local',
        AX_MOCK_SHARED_SECRET: 'integration-ax-mock-secret-32-chars',
        QUEUE_DRIVER: 'memory',
        STORAGE_DRIVER: 'memory',
        AI_PROVIDER: 'fake',
      }),
    );

    const integrations = await localMock.read('integrations', actor);

    expect(integrations.rows).toContainEqual(
      expect.objectContaining({
        id: 'ax-mock',
        values: expect.objectContaining({ configured: true }),
      }),
    );
    expect(integrations.actions).toContainEqual({
      id: 'receive-ax-mock-batch',
      label: 'Recibir lote en mock AX',
      availability: 'supported',
      method: 'POST',
      endpoint: '/api/v1/integrations/ax/mock/batches',
    });
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
    expect(publication.operationalStatus).toBe('partial');
    expect(publication.rows[0]?.values).toMatchObject({
      category: 'Rodamientos',
      template: 'Rodamiento',
      eligibility: 'No publicable',
      missing: expect.stringContaining('Diámetro interior'),
    });
    expect(publication.actions).toContainEqual(
      expect.objectContaining({
        id: 'configure-publication-fields',
        availability: 'blocked',
      }),
    );
    expect(reports.metrics).toContainEqual({
      key: 'products',
      label: 'Productos',
      value: 1,
      format: 'integer',
    });
    expect(reports.operationalStatus).toBe('partial');
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
        values: {
          section: 'Categoría',
          indicator: 'Rodamientos',
          value: 1,
        },
      }),
    );
    expect(reports.actions).toContainEqual(
      expect.objectContaining({
        id: 'refresh',
        availability: 'supported',
        endpoint: '/api/v1/workspaces/reports?report=summary',
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

  it('projects the three PIM report formats without inventing a historical baseline', async () => {
    await database.sql`
      INSERT INTO product_attribute_values (
        product_id, attribute_definition_id, value_number, source, confidence, version
      ) VALUES (${PRODUCT_ID}, ${ATTRIBUTE_ID}, 25, 'manual', 1, 1)
    `;
    await database.sql`
      INSERT INTO audit_entries (
        id, resource_type, resource_id, action, actor_id, source, correlation_id,
        occurred_at, changes
      ) VALUES
        (
          ${AUDIT_ATTRIBUTE_ID}, 'product', ${PRODUCT_ID}, 'updated', ${actor.id}, 'api',
          'report-attribute-change', '2026-10-10T12:00:00.000Z',
          '{"diametro_interior":{"before":20,"after":25}}'::jsonb
        ),
        (
          ${AUDIT_APPLICATION_ID}, 'group_application', ${APPLICATION_ID}, 'updated',
          ${actor.id}, 'api', 'report-application-change', '2026-10-11T12:00:00.000Z',
          '{}'::jsonb
        ),
        (
          ${AUDIT_NOVEMBER_ID}, 'product', ${PRODUCT_ID}, 'updated', ${actor.id}, 'api',
          'report-november-change', '2026-11-02T12:00:00.000Z', '{}'::jsonb
        )
    `;
    await database.sql`
      INSERT INTO audit_change_items (
        id, audit_entry_id, field_name, before_value, after_value, previous_value_valid_from
      ) VALUES (
        ${AUDIT_CHANGE_ID}, ${AUDIT_ATTRIBUTE_ID}, 'diametro_interior', '20'::jsonb, '25'::jsonb,
        '2026-09-01T12:00:00.000Z'
      )
    `;

    const [attributes, general, period] = await Promise.all([
      readModel.read('reports', actor, { report: 'attribute_changes' }),
      readModel.read('reports', actor, { report: 'general_results' }),
      readModel.read('reports', actor, { report: 'period_results' }),
    ]);

    expect(attributes.columns.map((column) => column.label)).toEqual([
      'Código artículo',
      'Código Unificador',
      'Categoría',
      'Completitud %',
      'Obligatorios faltantes',
      'Opcionales faltantes',
      'Campo',
      'Valor anterior',
      'Valor nuevo',
      'Fecha anterior',
      'Fecha nueva',
      'Origen',
      'Actor',
      'Motivo',
    ]);
    expect(attributes.rows[0]?.values).toMatchObject({
      sku: 'SKU-001',
      unifiedCode: 'UNIF-001',
      category: 'Rodamientos',
      completeness: 50,
      requiredMissing: 1,
      field: 'Diámetro interior',
      before: '20',
      after: '25',
      actor: actor.id,
      reason: null,
    });

    expect(general.columns.map((column) => column.label)).toEqual([
      'Código artículo',
      'Código Unificador',
      'Categoría',
      'Completitud %',
      'Obligatorios faltantes',
      'Opcionales faltantes',
      'Aplicaciones anteriores',
      'Aplicaciones actuales',
      'OEM anteriores',
      'OEM actuales',
      'Homólogos anteriores',
      'Homólogos actuales',
      'Atributos actualizados anteriores',
      'Atributos actualizados actuales',
    ]);
    expect(general.rows[0]?.values).toMatchObject({
      sku: 'SKU-001',
      previousApplications: null,
      currentApplications: 1,
      previousOem: null,
      currentOem: 0,
      previousHomologs: null,
      currentHomologs: 1,
      previousAttributes: null,
      currentAttributes: 1,
    });

    expect(period.rows.map((row) => row.values)).toEqual([
      { year: 2026, month: 'Noviembre', products: 1 },
      { year: 2026, month: 'Octubre', products: 1 },
    ]);
    expect(period.notices).toContainEqual(
      expect.objectContaining({ id: 'period-report-definition' }),
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
