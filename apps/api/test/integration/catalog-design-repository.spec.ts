import { newUuid } from '@cdr/shared';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import {
  attributeDefinitions,
  attributeTemplates,
  catalogCategories,
  products,
  productAttributeValues,
  productTemplateAssignments,
  templateAttributeAssignments,
  templateAttributeRoleAccess,
  auditEntries,
} from '../../src/database/schema';
import { DrizzleCatalogDesignRepository } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-catalog-design.repository';
import { DrizzleCatalogAdministrationRepository } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-catalog-administration.repository';
import { createTestDatabase, type TestDatabase } from './database.helper';

const root = newUuid(),
  category = newUuid(),
  template = newUuid(),
  unifier = newUuid(),
  diameter = newUuid(),
  product = newUuid();
const audit = () => ({ actorId: 'admin-test', correlationId: newUuid(), occurredAt: new Date() });
describe('catalog design persistence', () => {
  let db: TestDatabase;
  let repository: DrizzleCatalogDesignRepository;
  beforeAll(async () => {
    db = await createTestDatabase();
    repository = new DrizzleCatalogDesignRepository(db.db);
  });
  beforeEach(async () => {
    await db.truncateAll();
    await db.db.insert(catalogCategories).values([
      { id: root, name: 'Rodamientos', slug: 'rodamientos', path: 'rodamientos' },
      { id: category, parentId: root, name: 'Bolas', slug: 'bolas', path: 'rodamientos/bolas' },
    ]);
    await db.db.insert(attributeTemplates).values({
      id: template,
      categoryId: category,
      name: 'Bolas',
      variantKey: 'default',
      version: 1,
      status: 'active',
    });
    await db.db.insert(attributeDefinitions).values([
      {
        id: unifier,
        key: 'codigo_unificador',
        label: 'Unificador',
        dataType: 'text',
        sourceAuthority: 'erp',
      },
      { id: diameter, key: 'diametro', label: 'Diámetro', dataType: 'number', unit: 'mm' },
    ]);
    await db.db.insert(templateAttributeAssignments).values([
      { templateId: template, attributeDefinitionId: unifier },
      { templateId: template, attributeDefinitionId: diameter, replicable: true, required: true },
    ]);
    await db.db.insert(templateAttributeRoleAccess).values({
      templateId: template,
      attributeDefinitionId: diameter,
      role: 'ADMINISTRADOR',
      canView: true,
      canEdit: true,
    });
    await db.db.insert(products).values({ id: product, sku: 'TEST-1', name: 'Prueba' });
    await db.db
      .insert(productTemplateAssignments)
      .values({ productId: product, templateId: template });
    await db.db.insert(productAttributeValues).values([
      { productId: product, attributeDefinitionId: unifier, valueText: '6205' },
      { productId: product, attributeDefinitionId: diameter, valueNumber: 25 },
    ]);
  });
  afterAll(async () => {
    if (db) await db.close();
  });
  it('creates a category and moves its subtree; rejects stale edits and cycles', async () => {
    const created = await repository.createCategory({
      id: newUuid(),
      name: 'Otra',
      slug: 'otra',
      parentId: null,
      position: 0,
      audit: audit(),
    });
    const [current] = await db.db
      .select()
      .from(catalogCategories)
      .where(eq(catalogCategories.id, root));
    await repository.moveCategory({
      id: root,
      parentId: created.id,
      expectedUpdatedAt: current!.updatedAt,
      audit: audit(),
    });
    expect(
      (await db.db.select().from(catalogCategories).where(eq(catalogCategories.id, category)))[0]
        ?.path,
    ).toBe('Otra > Rodamientos > Bolas');
    await expect(
      repository.moveCategory({
        id: root,
        parentId: null,
        expectedUpdatedAt: current!.updatedAt,
        audit: audit(),
      }),
    ).rejects.toThrow(/Otra persona/);
    await expect(
      repository.moveCategory({
        id: created.id,
        parentId: category,
        expectedUpdatedAt: created.updatedAt,
        audit: audit(),
      }),
    ).rejects.toThrow();
  });
  it('copies and assigns only the target category, retaining all stored values and audit', async () => {
    const [current] = await db.db
      .select()
      .from(catalogCategories)
      .where(eq(catalogCategories.id, category));
    const values = await db.db.select().from(productAttributeValues);
    const metadata = audit();
    const copied = await repository.configureTemplate({
      id: newUuid(),
      categoryId: category,
      mode: 'copy',
      sourceTemplateId: template,
      name: 'Copia',
      expectedUpdatedAt: current!.updatedAt,
      audit: metadata,
    });
    expect(copied.attributes).toHaveLength(2);
    expect((await db.db.select().from(productTemplateAssignments))[0]?.templateId).toBe(copied.id);
    expect(await db.db.select().from(productAttributeValues)).toEqual(values);
    expect(
      await db.db
        .select()
        .from(auditEntries)
        .where(eq(auditEntries.correlationId, metadata.correlationId)),
    ).toHaveLength(2);
    await expect(
      repository.configureTemplate({
        id: newUuid(),
        categoryId: category,
        mode: 'empty',
        name: 'Vacía',
        expectedUpdatedAt: current!.updatedAt,
        audit: audit(),
      }),
    ).rejects.toThrow(/Otra persona/);
  });
  it('adds private attributes, prevents duplicate keys, and refuses a type change with existing values', async () => {
    const [current] = await db.db
      .select()
      .from(attributeTemplates)
      .where(eq(attributeTemplates.id, template));
    const added = await repository.addAttribute({
      id: newUuid(),
      templateId: template,
      key: 'nuevo',
      label: 'Nuevo',
      dataType: 'text',
      unit: null,
      allowedValues: [],
      expectedUpdatedAt: current!.updatedAt,
      audit: audit(),
    });
    expect(
      added.attributes?.find((row) => row.key === 'nuevo')?.roleAccess.map((row) => row.role),
    ).toEqual(['ADMINISTRADOR']);
    const admin = new DrizzleCatalogAdministrationRepository(db.db);
    const attribute = added.attributes!.find((row) => row.key === 'diametro')!;
    await expect(
      admin.updateTemplateAttribute({
        templateId: template,
        attributeDefinitionId: diameter,
        dataType: 'text',
        expectedUpdatedAt: attribute.updatedAt,
        audit: audit(),
      }),
    ).rejects.toThrow(/valores registrados/);
  });
  it('previews and confirms SKU category changes atomically, preserving values and rejecting stale previews', async () => {
    const targetCategory = newUuid(),
      targetTemplate = newUuid();
    await db.db
      .insert(catalogCategories)
      .values({ id: targetCategory, name: 'Sellos', slug: 'sellos', path: 'sellos' });
    await db.db.insert(attributeTemplates).values({
      id: targetTemplate,
      categoryId: targetCategory,
      name: 'Sellos',
      variantKey: 'seal',
      version: 1,
      status: 'active',
    });
    const rows = [{ sku: 'TEST-1', categorySlug: 'sellos' }];
    const preview = await repository.previewCategoryAssignments(rows);
    expect(preview.rows).toMatchObject([
      { expectedTemplateId: template, targetTemplateId: targetTemplate, error: null },
    ]);
    const before = await db.db.select().from(productAttributeValues);
    const confirmation = [
      { ...rows[0]!, expectedTemplateId: template, targetTemplateId: targetTemplate },
    ];
    await expect(repository.confirmCategoryAssignments(confirmation, audit())).resolves.toEqual({
      changed: 1,
    });
    expect(await db.db.select().from(productAttributeValues)).toEqual(before);
    expect((await repository.exportCategoryAssignments())[0]).toMatchObject({
      sku: 'TEST-1',
      categorySlug: 'sellos',
      variantKey: 'seal',
    });
    await expect(repository.confirmCategoryAssignments(confirmation, audit())).rejects.toThrow(
      /vista previa/,
    );
  });
  it('reports invalid SKU assignments and never applies a partially invalid confirmation', async () => {
    const result = await repository.previewCategoryAssignments([
      { sku: 'TEST-1', categorySlug: 'rodamientos' },
      { sku: 'UNKNOWN', categorySlug: 'bolas' },
    ]);
    expect(result.rows[0]?.error).toMatch(/categoría final/);
    expect(result.rows[1]?.error).toMatch(/inexistente/);
    const duplicates = await repository.previewCategoryAssignments([
      { sku: 'TEST-1', categorySlug: 'bolas' },
      { sku: 'TEST-1', categorySlug: 'bolas' },
    ]);
    expect(duplicates.rows.every((row) => row.error === 'SKU repetido en el archivo')).toBe(true);
    await expect(
      repository.confirmCategoryAssignments(
        [
          {
            sku: 'TEST-1',
            categorySlug: 'bolas',
            expectedTemplateId: template,
            targetTemplateId: template,
          },
          {
            sku: 'UNKNOWN',
            categorySlug: 'bolas',
            expectedTemplateId: null,
            targetTemplateId: template,
          },
        ],
        audit(),
      ),
    ).rejects.toThrow(/filas rechazadas/);
    expect((await db.db.select().from(productTemplateAssignments))[0]?.templateId).toBe(template);
  });
  it('invalidates shared-definition tokens across templates after a metadata edit', async () => {
    const otherTemplate = newUuid();
    await db.db.insert(attributeTemplates).values({
      id: otherTemplate,
      categoryId: category,
      name: 'Otro subtipo',
      variantKey: 'other',
      version: 1,
      status: 'active',
    });
    await db.db
      .insert(templateAttributeAssignments)
      .values({ templateId: otherTemplate, attributeDefinitionId: diameter });
    const admin = new DrizzleCatalogAdministrationRepository(db.db);
    const original = (await admin.getTemplate(template))!.attributes!.find(
      (row) => row.id === diameter,
    )!;
    const other = (await admin.getTemplate(otherTemplate))!.attributes![0]!;
    await admin.updateTemplateAttribute({
      templateId: template,
      attributeDefinitionId: diameter,
      label: 'Diámetro nominal',
      expectedUpdatedAt: original.updatedAt,
      audit: audit(),
    });
    expect((await admin.getTemplate(otherTemplate))!.attributes![0]!.label).toBe(
      'Diámetro nominal',
    );
    await expect(
      admin.updateTemplateAttribute({
        templateId: otherTemplate,
        attributeDefinitionId: diameter,
        label: 'Cambio obsoleto',
        expectedUpdatedAt: other.updatedAt,
        audit: audit(),
      }),
    ).resolves.toMatchObject({ kind: 'version_conflict' });
  });
  it('simulates actual replicable values by unifier and reports conflicting values without guessing', async () => {
    expect(await repository.previewInheritance(template, '6205')).toMatchObject({
      sourceSkus: ['TEST-1'],
      attributes: [{ key: 'diametro', value: 25, conflict: false }],
    });
    const second = newUuid();
    await db.db.insert(products).values({ id: second, sku: 'TEST-2', name: 'Otro' });
    await db.db
      .insert(productTemplateAssignments)
      .values({ productId: second, templateId: template });
    await db.db.insert(productAttributeValues).values([
      { productId: second, attributeDefinitionId: unifier, valueText: '6205' },
      { productId: second, attributeDefinitionId: diameter, valueNumber: 30 },
    ]);
    expect(await repository.previewInheritance(template, '6205')).toMatchObject({
      sourceSkus: ['TEST-1', 'TEST-2'],
      attributes: [{ key: 'diametro', value: null, conflict: true }],
    });
    expect((await repository.previewInheritance(template, 'NO-EXISTE')).sourceSkus).toEqual([]);
  });
});
