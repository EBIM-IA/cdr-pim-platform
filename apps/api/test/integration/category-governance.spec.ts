import { newUuid } from '@cdr/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresCategoryGovernanceAdapter } from '../../src/modules/catalog-schema/infrastructure/persistence/postgres-category-governance.adapter';
import { PostgresModulePolicyAdapter } from '../../src/modules/identity/infrastructure/postgres-module-policy.adapter';
import { ModulePolicyUseCase } from '../../src/modules/identity/application/module-policy.use-case';
import {
  Capability,
  Role,
  actorHasCapability,
} from '../../src/modules/identity/domain/entities/role';
import { createTestDatabase, type TestDatabase } from './database.helper';
describe('Category governance and module policies', () => {
  let database: TestDatabase;
  let repository: PostgresCategoryGovernanceAdapter;
  const audit = {
    actorId: 'catalog-admin',
    correlationId: newUuid(),
    occurredAt: new Date('2026-11-16T12:00:00Z'),
  };
  beforeAll(async () => {
    database = await createTestDatabase();
    repository = new PostgresCategoryGovernanceAdapter(database.sql);
  });
  beforeEach(async () => {
    await database.truncateAll();
  });
  afterAll(async () => {
    await database.close();
  });
  const rows = [
    {
      level1: 'Industrial',
      level2: 'Rodamientos',
      level3: 'Rodamientos',
      code1: '10',
      code2: '20',
      code3: '',
    },
  ];
  it('previews without writing, confirms supplied ERP codes and rejects a stale preview', async () => {
    const preview = await repository.importTree(rows, false, audit);
    expect((await database.sql`SELECT id FROM catalog_categories`).length).toBe(0);
    await repository.importTree(rows, true, audit, preview.revision);
    const data = await repository.read();
    expect(data.erpCodes.map((entry) => entry.code)).toEqual(['10', '20']);
    expect(data.diagnostics).toEqual([
      expect.objectContaining({ kind: 'missing_template', category: 'Industrial > Rodamientos' }),
    ]);
    await expect(repository.importTree(rows, true, audit, preview.revision)).rejects.toThrow(
      'vista previa',
    );
    const [events] =
      await database.sql`SELECT COUNT(*)::int AS count FROM audit_entries WHERE resource_type='category_governance'`;
    expect(events?.count).toBe(1);
  });
  it('inherits attributes into existing and future templates; moving scope retains SKU values', async () => {
    const preview = await repository.importTree(rows, false, audit);
    await repository.importTree(rows, true, audit, preview.revision);
    const [root] = await database.sql<
      { id: string }[]
    >`SELECT id::text FROM catalog_categories WHERE parent_id IS NULL`;
    const [leaf] = await database.sql<
      { id: string }[]
    >`SELECT id::text FROM catalog_categories WHERE parent_id=${root!.id}::uuid`;
    const template = newUuid();
    const product = newUuid();
    await database.sql`INSERT INTO attribute_templates(id,category_id,variant_key,name,version,status) VALUES (${template},${leaf!.id},'rigid','Rígido',1,'active')`;
    await database.sql`INSERT INTO products(id,sku,name) VALUES (${product},'BEARING-01','Rodamiento')`;
    await database.sql`INSERT INTO product_template_assignments(product_id,template_id) VALUES (${product},${template})`;
    await repository.saveDynamicAttribute(
      {
        categoryId: root!.id,
        label: 'Carga nominal',
        dataType: 'number',
        unit: 'kg',
        required: true,
        includeInTechnicalSheet: true,
        active: true,
      },
      audit,
    );
    const attribute = (await repository.read()).dynamicAttributes[0]!;
    expect(attribute).toMatchObject({ templateCount: 1, skuCount: 1, filledCount: 0 });
    const [assignment] =
      await database.sql`SELECT required,include_in_technical_sheet FROM template_attribute_assignments WHERE template_id=${template}`;
    expect(assignment).toMatchObject({ required: true, include_in_technical_sheet: true });
    await database.sql`INSERT INTO product_attribute_values(product_id,attribute_definition_id,value_number) VALUES (${product},${attribute.id},25)`;
    const future = newUuid();
    await database.sql`INSERT INTO attribute_templates(id,category_id,variant_key,name,version,status) VALUES (${future},${leaf!.id},'cylindrical','Cilíndrico',1,'active')`;
    expect(
      (
        await database.sql`SELECT template_id FROM template_attribute_assignments WHERE attribute_definition_id=${attribute.id}`
      ).length,
    ).toBe(2);
    const otherRoot = newUuid();
    await database.sql`INSERT INTO catalog_categories(id,name,slug,path) VALUES (${otherRoot},'Otro','otro','Otro')`;
    await database.sql`UPDATE catalog_categories SET parent_id=${otherRoot},path='Otro > Rodamientos' WHERE id=${leaf!.id}`;
    expect(
      (
        await database.sql`SELECT template_id FROM template_attribute_assignments WHERE attribute_definition_id=${attribute.id}`
      ).length,
    ).toBe(0);
    expect(
      (
        await database.sql`SELECT value_number FROM product_attribute_values WHERE attribute_definition_id=${attribute.id}`
      )[0]?.value_number,
    ).toBe('25');
  });
  it('stores menu policies with audit and applies them to the next authorization resolution', async () => {
    const useCase = new ModulePolicyUseCase(new PostgresModulePolicyAdapter(database.sql));
    const admin = { id: audit.actorId, email: 'admin@example.test', roles: [Role.Administrator] };
    await useCase.save(
      { role: Role.Sales, capability: Capability.MenuProductsView, visible: false },
      admin,
    );
    const sales = await useCase.resolve({
      id: 'sales',
      email: 'sales@example.test',
      roles: [Role.Sales],
    });
    expect(actorHasCapability(sales, Capability.MenuProductsView)).toBe(false);
    expect(
      (await database.sql`SELECT id FROM audit_entries WHERE resource_type='module_policy'`).length,
    ).toBe(1);
    await useCase.save(
      { role: Role.Sales, capability: Capability.MenuProductsView, visible: true },
      admin,
    );
    expect(
      actorHasCapability(
        await useCase.resolve({ id: 'sales', email: 'sales@example.test', roles: [Role.Sales] }),
        Capability.MenuProductsView,
      ),
    ).toBe(true);
    expect(
      (await database.sql`SELECT id FROM audit_entries WHERE resource_type='module_policy'`).length,
    ).toBe(2);
  });
  it('projects all category diagnostics from real SKU assignments and ERP levels', async () => {
    const input = [...rows, { ...rows[0]!, level2: 'Filtros', level3: 'Filtros', code2: '30' }];
    const preview = await repository.importTree(input, false, audit);
    await repository.importTree(input, true, audit, preview.revision);
    const [root] = await database.sql<
      { id: string }[]
    >`SELECT id::text FROM catalog_categories WHERE parent_id IS NULL`;
    const [variantLeaf] = await database.sql<
      { id: string }[]
    >`SELECT id::text FROM catalog_categories WHERE name='Filtros'`;
    const rootTemplate = newUuid();
    await database.sql`INSERT INTO attribute_templates(id,category_id,variant_key,name,version,status) VALUES (${rootTemplate},${root!.id},'invalid-root','No final',1,'active'),(${newUuid()},${variantLeaf!.id},'a','A',1,'active'),(${newUuid()},${variantLeaf!.id},'b','B',1,'active')`;
    const unknown = newUuid(),
      incomplete = newUuid(),
      nonFinal = newUuid(),
      missing = newUuid(),
      ambiguous = newUuid();
    await database.sql`INSERT INTO products(id,sku,name) VALUES (${unknown},'UNKNOWN','Sin categoría'),(${incomplete},'INCOMPLETE','Incompleto'),(${nonFinal},'NONFINAL','No final'),(${missing},'MISSING','Sin plantilla'),(${ambiguous},'AMBIGUOUS','Sin variante')`;
    const level1 = newUuid(),
      level2 = newUuid();
    await database.sql`INSERT INTO attribute_definitions(id,key,label,data_type) VALUES (${level1},'categoria_n1','Nivel 1','text'),(${level2},'categoria_n2','Nivel 2','text')`;
    await database.sql`INSERT INTO product_attribute_values(product_id,attribute_definition_id,value_text) VALUES (${incomplete},${level1},'Industrial'),(${missing},${level1},'Industrial'),(${missing},${level2},'Rodamientos'),(${ambiguous},${level1},'Industrial'),(${ambiguous},${level2},'Filtros')`;
    await database.sql`INSERT INTO product_template_assignments(product_id,template_id) VALUES (${nonFinal},${rootTemplate})`;
    const diagnostics = (await repository.read()).diagnostics.filter((item) => item.sku);
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sku: 'UNKNOWN',
          kind: 'unknown_category',
          category: 'Sin categoría',
        }),
        expect.objectContaining({ sku: 'INCOMPLETE', kind: 'incomplete_levels' }),
        expect.objectContaining({ sku: 'NONFINAL', kind: 'non_final_category' }),
        expect.objectContaining({ sku: 'MISSING', kind: 'missing_template' }),
        expect.objectContaining({ sku: 'AMBIGUOUS', kind: 'ambiguous_variant' }),
      ]),
    );
  });
  it('advances category attribute tokens even when application writes share a clock tick', async () => {
    const preview = await repository.importTree(rows, false, audit);
    await repository.importTree(rows, true, audit, preview.revision);
    const [root] = await database.sql<
      { id: string }[]
    >`SELECT id::text FROM catalog_categories WHERE parent_id IS NULL`;
    const input = {
      categoryId: root!.id,
      label: 'Norma inicial',
      dataType: 'text' as const,
      unit: null,
      required: false,
      includeInTechnicalSheet: true,
      active: true,
    };
    await repository.saveDynamicAttribute(input, audit);
    const original = (await repository.read()).dynamicAttributes[0]!;
    await repository.saveDynamicAttribute(
      {
        ...input,
        id: original.id,
        label: 'Norma actualizada',
        expectedUpdatedAt: original.updatedAt,
      },
      audit,
    );
    const current = (await repository.read()).dynamicAttributes[0]!;
    expect(current.updatedAt).not.toBe(original.updatedAt);
    await expect(
      repository.saveDynamicAttribute(
        {
          ...input,
          id: original.id,
          label: 'Cambio obsoleto',
          expectedUpdatedAt: original.updatedAt,
        },
        audit,
      ),
    ).rejects.toThrow('cambió');
    expect((await repository.read()).dynamicAttributes[0]?.label).toBe('Norma actualizada');
  });
});
