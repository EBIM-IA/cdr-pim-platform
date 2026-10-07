import { newUuid } from '@cdr/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedDemoCatalog } from '../../src/database/demo-seed';
import {
  attributeDefinitions,
  auditEntries,
  equivalenceGroupMembers,
  productAttributeValues,
  products,
  productTemplateAssignments,
  templateAttributeAssignments,
  templateAttributeRoleAccess,
} from '../../src/database/schema';
import { DrizzleCategoryAttributeImportAdapter } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-category-attribute-import.adapter';
import { type TestDatabase, createTestDatabase } from './database.helper';

const roles = ['COMPRAS'];
const now = new Date('2026-10-07T15:00:00.000Z');

describe('category attribute imports', () => {
  let database: TestDatabase;
  let adapter: DrizzleCategoryAttributeImportAdapter;

  beforeAll(async () => {
    database = await createTestDatabase();
    adapter = new DrizzleCategoryAttributeImportAdapter(database.db);
  });

  beforeEach(async () => {
    await database.truncateAll();
    await seedDemoCatalog(database.db);
  });

  afterAll(() => database.close());

  it('previews only active PIM-owned importable columns and persists source + audit atomically', async () => {
    const fixture = await findImportFixture(database);
    const importedValue = 'Nuevo valor desde archivo';
    const [prepared] = await adapter.prepare({
      categorySlug: fixture.categorySlug,
      roles,
      rows: [
        {
          rowNumber: 1,
          data: { sku: fixture.sku, [fixture.attributeKey]: importedValue },
          errors: [],
        },
      ],
    });

    expect(prepared).toMatchObject({
      valid: true,
      data: { sku: fixture.sku, [fixture.attributeKey]: importedValue },
      plan: {
        sku: fixture.sku,
        cells: [{ attributeKey: fixture.attributeKey, value: importedValue }],
      },
    });
    const plan = prepared!.plan!;
    const result = await adapter.applyRow({
      categorySlug: fixture.categorySlug,
      plan,
      roles,
      actorId: 'buyer-1',
      batchId: newUuid(),
      correlationId: 'category-import-1',
      now,
    });
    expect(result).toEqual({ applied: true, errors: [] });

    const [stored] = await database.db
      .select()
      .from(productAttributeValues)
      .where(
        and(
          eq(productAttributeValues.productId, plan.productId),
          eq(productAttributeValues.attributeDefinitionId, fixture.definitionId),
        ),
      );
    expect(stored).toMatchObject({
      valueText: importedValue,
      source: 'import',
      version: plan.cells[0]!.expectedVersion + 1,
    });
    const entries = await database.db
      .select()
      .from(auditEntries)
      .where(
        and(
          eq(auditEntries.resourceType, 'product'),
          eq(auditEntries.resourceId, plan.productId),
          eq(auditEntries.source, 'import'),
        ),
      );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.changes).toMatchObject({
      [fixture.attributeKey]: { after: importedValue },
    });
  });

  it('ignores foreign/ERP columns, accepts required clears with warnings and rejects bad types', async () => {
    const fixture = await findImportFixture(database);
    const erpAttributeKey = await findErpAttributeKey(database, fixture.templateId);
    const context = await addPimAttribute({
      database,
      categorySlug: fixture.categorySlug,
      key: 'test_peso_neto',
      dataType: 'measurement',
      required: true,
    });
    await addPimAttribute({
      database,
      categorySlug: fixture.categorySlug,
      key: 'test_atributo_inactivo',
      dataType: 'text',
      required: false,
      active: false,
    });
    await addPimAttribute({
      database,
      categorySlug: fixture.categorySlug,
      key: 'test_archivo_tecnico',
      dataType: 'text',
      required: false,
      canImport: false,
    });
    expect(context).toBeTruthy();
    const rowData: Array<Record<string, string>> = [
      { sku: fixture.sku, [erpAttributeKey]: 'NO-DEBE' },
      { sku: fixture.sku, desconocida: 'valor' },
      { sku: fixture.sku, test_peso_neto: '-' },
      { sku: fixture.sku, test_peso_neto: 'no-numérico' },
      { sku: fixture.sku, test_atributo_inactivo: 'ignorar' },
      { sku: fixture.sku, test_archivo_tecnico: 'ficha.pdf' },
    ];
    const rows = await Promise.all(
      rowData.map(async (data, index) => {
        const [row] = await adapter.prepare({
          categorySlug: fixture.categorySlug,
          roles,
          rows: [{ rowNumber: index + 1, data, errors: [] }],
        });
        return row!;
      }),
    );
    expect(rows.map((row) => row.valid)).toEqual([true, true, true, false, true, true]);
    expect(rows[0]?.warnings.join(' ')).toContain('dato base ERP');
    expect(rows[1]?.warnings.join(' ')).toContain('no pertenece a la plantilla');
    expect(rows[2]).toMatchObject({
      errors: [],
      warnings: [expect.stringContaining('obligatorio')],
      plan: { cells: [{ attributeKey: 'test_peso_neto', value: null }] },
    });
    expect(rows[3]?.errors.join(' ')).toContain('número finito');
    expect(rows[4]?.warnings.join(' ')).toContain('atributo inactivo');
    expect(rows[5]?.warnings.join(' ')).toContain('archivo, campo del sistema o no importable');
  });

  it('treats blank cells as no-op and keeps ignored columns as a valid warned row', async () => {
    const fixture = await findImportFixture(database);
    const rows = await adapter.prepare({
      categorySlug: fixture.categorySlug,
      roles,
      rows: [
        {
          rowNumber: 1,
          data: { sku: fixture.sku, [fixture.attributeKey]: '   ', columna_ajena: 'dato' },
          errors: [],
        },
      ],
    });

    expect(rows[0]).toMatchObject({
      valid: true,
      errors: [],
      warnings: [expect.stringContaining('columna_ajena')],
      plan: { sku: fixture.sku, cells: [] },
    });
  });

  it('uses previewed versions and rolls back the complete row when one cell became stale', async () => {
    const fixture = await findImportFixture(database);
    const extra = await addPimAttribute({
      database,
      categorySlug: fixture.categorySlug,
      key: 'test_nota_interna',
      dataType: 'text',
      required: false,
    });
    const [prepared] = await adapter.prepare({
      categorySlug: fixture.categorySlug,
      roles,
      rows: [
        {
          rowNumber: 1,
          data: {
            sku: fixture.sku,
            [fixture.attributeKey]: 'Valor de archivo',
            test_nota_interna: 'No debe persistir',
          },
          errors: [],
        },
      ],
    });
    const plan = prepared!.plan!;
    const primaryCell = plan.cells.find((cell) => cell.attributeKey === fixture.attributeKey)!;
    expect(primaryCell).toBeTruthy();
    await database.db
      .insert(productAttributeValues)
      .values({
        productId: plan.productId,
        attributeDefinitionId: fixture.definitionId,
        valueText: 'Cambio concurrente',
        source: 'manual',
        version: primaryCell.expectedVersion + 1,
      })
      .onConflictDoUpdate({
        target: [productAttributeValues.productId, productAttributeValues.attributeDefinitionId],
        set: { valueText: 'Cambio concurrente', version: primaryCell.expectedVersion + 1 },
      });

    const result = await adapter.applyRow({
      categorySlug: fixture.categorySlug,
      plan,
      roles,
      actorId: 'buyer-1',
      batchId: newUuid(),
      correlationId: 'category-import-stale',
      now,
    });
    expect(result.applied).toBe(false);
    expect(result.errors.join(' ')).toContain('cambió después de la vista previa');
    const [unexpected] = await database.db
      .select()
      .from(productAttributeValues)
      .where(
        and(
          eq(productAttributeValues.productId, plan.productId),
          eq(productAttributeValues.attributeDefinitionId, extra.definitionId),
        ),
      );
    expect(unexpected).toBeUndefined();
  });

  it('replicates configured attributes to the other products in codigoUnificador', async () => {
    const fixture = await findImportFixture(database, { replicable: true });
    const [membership] = await database.db
      .select({ groupId: equivalenceGroupMembers.groupId })
      .from(equivalenceGroupMembers)
      .where(eq(equivalenceGroupMembers.productId, fixture.productId));
    expect(membership).toBeTruthy();
    const replicaId = newUuid();
    const replicaSku = `TEST-REPLICA-${replicaId.slice(0, 8)}`;
    await database.db.insert(products).values({
      id: replicaId,
      sku: replicaSku,
      name: 'Producto alternativo para réplica',
      status: 'draft',
    });
    await database.db.insert(productTemplateAssignments).values({
      productId: replicaId,
      templateId: fixture.templateId,
    });
    await database.db.insert(equivalenceGroupMembers).values({
      productId: replicaId,
      groupId: membership!.groupId,
      role: 'member',
    });

    const [prepared] = await adapter.prepare({
      categorySlug: fixture.categorySlug,
      roles,
      rows: [
        {
          rowNumber: 1,
          data: { sku: fixture.sku, [fixture.attributeKey]: 'Dato compartido' },
          errors: [],
        },
      ],
    });
    await adapter.applyRow({
      categorySlug: fixture.categorySlug,
      plan: prepared!.plan!,
      roles,
      actorId: 'buyer-1',
      batchId: newUuid(),
      correlationId: 'category-import-replication',
      now,
    });

    const [replicated] = await database.db
      .select()
      .from(productAttributeValues)
      .where(
        and(
          eq(productAttributeValues.productId, replicaId),
          eq(productAttributeValues.attributeDefinitionId, fixture.definitionId),
        ),
      );
    expect(replicated).toMatchObject({ valueText: 'Dato compartido', source: 'import' });

    const [clearPrepared] = await adapter.prepare({
      categorySlug: fixture.categorySlug,
      roles,
      rows: [
        {
          rowNumber: 1,
          data: { sku: fixture.sku, [fixture.attributeKey]: '-' },
          errors: [],
        },
      ],
    });
    await adapter.applyRow({
      categorySlug: fixture.categorySlug,
      plan: clearPrepared!.plan!,
      roles,
      actorId: 'buyer-1',
      batchId: newUuid(),
      correlationId: 'category-import-replication-clear',
      now: new Date(now.getTime() + 1_000),
    });
    const [clearedReplica] = await database.db
      .select()
      .from(productAttributeValues)
      .where(
        and(
          eq(productAttributeValues.productId, replicaId),
          eq(productAttributeValues.attributeDefinitionId, fixture.definitionId),
        ),
      );
    expect(clearedReplica).toMatchObject({ valueText: null, source: 'import' });
    expect(clearedReplica?.deletedAt).toBeInstanceOf(Date);
  });
});

interface ImportFixture {
  readonly categorySlug: string;
  readonly templateId: string;
  readonly productId: string;
  readonly sku: string;
  readonly definitionId: string;
  readonly attributeKey: string;
}

async function findImportFixture(
  database: TestDatabase,
  input: { replicable?: boolean } = {},
): Promise<ImportFixture> {
  const replicable = input.replicable ?? false;
  const [resolved] = await database.sql<ImportFixture[]>`
    SELECT
      c.slug AS "categorySlug",
      t.id AS "templateId",
      p.id AS "productId",
      p.sku,
      ad.id AS "definitionId",
      ad.key AS "attributeKey"
    FROM products p
    JOIN product_template_assignments pta ON pta.product_id = p.id
    JOIN attribute_templates t ON t.id = pta.template_id AND t.status = 'active'
    JOIN catalog_categories c ON c.id = t.category_id AND c.active = true
    JOIN template_attribute_assignments taa
      ON taa.template_id = t.id AND taa.active = true
    JOIN attribute_definitions ad
      ON ad.id = taa.attribute_definition_id
      AND ad.active = true
      AND ad.source_authority = 'pim'
      AND ad.data_type = 'text'
    JOIN template_attribute_role_access access
      ON access.template_id = taa.template_id
      AND access.attribute_definition_id = taa.attribute_definition_id
      AND access.role = 'COMPRAS'
      AND access.can_view = true
      AND access.can_import = true
    WHERE (${replicable}::boolean = false OR taa.replicable = true)
      AND (
        ${replicable}::boolean = false
        OR EXISTS (
          SELECT 1 FROM equivalence_group_members membership
          WHERE membership.product_id = p.id
        )
      )
    ORDER BY c.path, p.sku, taa.position, ad.key
    LIMIT 1
  `;
  expect(resolved).toBeTruthy();
  return resolved!;
}

async function findErpAttributeKey(database: TestDatabase, templateId: string): Promise<string> {
  const [resolved] = await database.sql<{ key: string }[]>`
    SELECT ad.key
    FROM template_attribute_assignments taa
    JOIN attribute_definitions ad ON ad.id = taa.attribute_definition_id
    WHERE taa.template_id = ${templateId}
      AND taa.active = true
      AND ad.active = true
      AND ad.source_authority = 'erp'
    ORDER BY taa.position, ad.key
    LIMIT 1
  `;
  expect(resolved).toBeTruthy();
  return resolved!.key;
}

async function addPimAttribute(input: {
  database: TestDatabase;
  categorySlug: string;
  key: string;
  dataType: 'text' | 'measurement';
  required: boolean;
  active?: boolean;
  canImport?: boolean;
}) {
  const [resolved] = await input.database.sql<{ id: string }[]>`
    SELECT t.id
    FROM attribute_templates t
    JOIN catalog_categories c ON c.id = t.category_id
    WHERE c.slug = ${input.categorySlug} AND c.active = true AND t.status = 'active'
    LIMIT 1
  `;
  expect(resolved).toBeTruthy();
  const definitionId = newUuid();
  await input.database.db.insert(attributeDefinitions).values({
    id: definitionId,
    key: input.key,
    label: input.key,
    dataType: input.dataType,
    unit: input.dataType === 'measurement' ? 'kg' : null,
    sourceAuthority: 'pim',
  });
  await input.database.db.insert(templateAttributeAssignments).values({
    templateId: resolved!.id,
    attributeDefinitionId: definitionId,
    position: 99,
    required: input.required,
    replicable: false,
    active: input.active ?? true,
  });
  await input.database.db.insert(templateAttributeRoleAccess).values({
    templateId: resolved!.id,
    attributeDefinitionId: definitionId,
    role: 'COMPRAS',
    canView: true,
    canEdit: true,
    canImport: input.canImport ?? true,
    canExport: true,
  });
  return { definitionId, templateId: resolved!.id };
}
