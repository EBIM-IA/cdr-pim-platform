import { newUuid } from '@cdr/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CLIENT_TEMPLATE_MANIFEST } from '../../src/database/client-template-manifest';
import { QasDemoSeedCollisionError, runQasDemoSeed } from '../../src/database/qas-demo-seed';
import { type TestDatabase, createTestDatabase } from './database.helper';

describe('additive QAS demo seed', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  beforeEach(() => database.truncateAll());
  afterAll(() => database.close());

  it('projects a full dry run and rolls every planned row back', async () => {
    const preview = await runQasDemoSeed(database.db);
    expect(preview).toMatchObject({
      mode: 'dry-run',
      sourceSha256: CLIENT_TEMPLATE_MANIFEST.source.sha256,
      productCount: 97,
    });
    expect(preview.tables.products).toEqual({ before: 0, inserted: 97, after: 97 });
    expect(preview.tables.attribute_templates?.inserted).toBe(52);
    expect(preview.insertedIds.products).toHaveLength(97);
    const [counts] =
      await database.sql`SELECT (SELECT COUNT(*)::int FROM products) AS products, (SELECT COUNT(*)::int FROM catalog_categories) AS categories`;
    expect(counts).toEqual({ products: 0, categories: 0 });
  });

  it('adds all canonical and illustrative rows idempotently without fake vectors or approvals', async () => {
    const { QAS_DEMO_SUPPLEMENT } = await import('../../src/database/qas-demo-manifest');
    const result = await runQasDemoSeed(database.db, {
      apply: true,
      supplement: QAS_DEMO_SUPPLEMENT,
    });
    expect(result.tables.products).toEqual({ before: 0, inserted: 105, after: 105 });
    expect(result.tables.attribute_templates?.inserted).toBe(52);
    expect(result.tables.catalog_categories?.inserted).toBe(351);
    expect(result.warnings).toContainEqual({
      code: 'PROVIDER_IDENTIFIER_ALREADY_OWNED_SKIPPED',
      count: 1,
    });
    const repeat = await runQasDemoSeed(database.db, {
      apply: true,
      supplement: QAS_DEMO_SUPPLEMENT,
    });
    expect(
      Object.values(repeat.tables).every(
        (table) => table.inserted === 0 && table.before === table.after,
      ),
    ).toBe(true);
    const [counts] =
      await database.sql`SELECT (SELECT COUNT(*)::int FROM product_embeddings) AS vectors, (SELECT COUNT(*)::int FROM products WHERE status <> 'in_review') AS published, (SELECT COUNT(*)::int FROM external_homologs WHERE approval_status <> 'pending') AS approved`;
    expect(counts).toEqual({ vectors: 0, published: 0, approved: 0 });
    const [missingCodes] =
      await database.sql`SELECT COUNT(*)::int AS count FROM equivalence_groups WHERE code = ''`;
    expect(missingCodes?.count).toBe(0);
  });

  it('preserves existing IDs, edited product states, typed values and role policies on subsequent runs', async () => {
    await runQasDemoSeed(database.db, { apply: true });
    const [product] = await database.sql`SELECT id FROM products WHERE sku = 'D1672'`;
    await database.sql`UPDATE products SET name = 'Curated product', description = 'Curated description', status = 'published' WHERE id = ${product!.id}`;
    await database.sql`UPDATE product_attribute_values SET value_text = 'CURATED', source = 'manual', version = 10 WHERE product_id = ${product!.id} AND attribute_definition_id = (SELECT id FROM attribute_definitions WHERE key = 'codigo_proveedor')`;
    await database.sql`UPDATE template_attribute_role_access SET can_export = false WHERE role = 'ADMINISTRADOR'`;
    const repeat = await runQasDemoSeed(database.db, { apply: true });
    expect(repeat.tables.products?.inserted).toBe(0);
    const [preserved] =
      await database.sql`SELECT id, name, description, status FROM products WHERE sku = 'D1672'`;
    expect(preserved).toEqual({
      id: product!.id,
      name: 'Curated product',
      description: 'Curated description',
      status: 'published',
    });
    const [value] =
      await database.sql`SELECT value_text, source, version FROM product_attribute_values WHERE product_id = ${product!.id} AND attribute_definition_id = (SELECT id FROM attribute_definitions WHERE key = 'codigo_proveedor')`;
    expect(value).toEqual({ value_text: 'CURATED', source: 'manual', version: 10 });
    const [policies] =
      await database.sql`SELECT COUNT(*)::int AS count FROM template_attribute_role_access WHERE role = 'ADMINISTRADOR' AND can_export = true`;
    expect(policies!.count).toBe(0);
  });

  it('reuses a manually created product identity without overwriting it', async () => {
    const productId = newUuid();
    await database.sql`INSERT INTO products (id, sku, name, status) VALUES (${productId}, 'D1672', 'Existing manual product', 'draft')`;
    const result = await runQasDemoSeed(database.db, { apply: true });
    expect(result.tables.products?.inserted).toBe(96);
    const [product] = await database.sql`SELECT id, name, status FROM products WHERE sku = 'D1672'`;
    expect(product).toEqual({ id: productId, name: 'Existing manual product', status: 'draft' });
    const [assignment] =
      await database.sql`SELECT product_id FROM product_template_assignments WHERE product_id = ${productId}`;
    expect(assignment?.product_id).toBe(productId);
  });

  it('aborts the complete transaction when an existing attribute has incompatible type or authority', async () => {
    const definition = CLIENT_TEMPLATE_MANIFEST.definitions.find(
      (item) => item.key === 'codigo_proveedor',
    )!;
    await database.sql`INSERT INTO attribute_definitions (id, key, label, data_type, source_authority) VALUES (${newUuid()}, ${definition.key}, 'Manually configured incompatible field', 'number', 'pim')`;
    await expect(runQasDemoSeed(database.db, { apply: true })).rejects.toBeInstanceOf(
      QasDemoSeedCollisionError,
    );
    const [counts] =
      await database.sql`SELECT (SELECT COUNT(*)::int FROM products) AS products, (SELECT COUNT(*)::int FROM catalog_categories) AS categories, (SELECT COUNT(*)::int FROM attribute_definitions) AS definitions`;
    expect(counts).toEqual({ products: 0, categories: 0, definitions: 1 });
  });

  it('aborts instead of assigning a product to an additional unifier group', async () => {
    const productId = newUuid();
    const groupId = newUuid();
    await database.sql`INSERT INTO products (id, sku, name) VALUES (${productId}, 'D1672', 'Manual product')`;
    await database.sql`INSERT INTO equivalence_groups (id, code, name, kind) VALUES (${groupId}, 'MANUAL-GROUP', 'Manual group', 'interchange')`;
    await database.sql`INSERT INTO equivalence_group_members (group_id, product_id, role) VALUES (${groupId}, ${productId}, 'member')`;
    await expect(runQasDemoSeed(database.db, { apply: true })).rejects.toMatchObject({
      table: 'equivalence_group_members',
      reason: 'existing_different_group',
    });
    const [counts] =
      await database.sql`SELECT (SELECT COUNT(*)::int FROM products) AS products, (SELECT COUNT(*)::int FROM catalog_categories) AS categories, (SELECT COUNT(*)::int FROM equivalence_group_members) AS memberships`;
    expect(counts).toEqual({ products: 1, categories: 0, memberships: 1 });
  });

  it('rejects external references to an owned SKU and brand despite existing lowercase or padding', async () => {
    const homolog = CLIENT_TEMPLATE_MANIFEST.relations.homologs[0]!;
    const sku = ` ${String(homolog.codigo_homologo).toLowerCase()} `;
    const brand = ` ${homolog.marca_homologo.toLowerCase()} `;
    await database.sql`INSERT INTO products (id, sku, name, brand) VALUES (${newUuid()}, ${sku}, 'Owned catalog item', ${brand})`;
    await expect(runQasDemoSeed(database.db, { apply: true })).rejects.toMatchObject({
      table: 'external_homologs',
      reason: 'reference_is_owned_catalog_sku',
    });
    const [counts] =
      await database.sql`SELECT (SELECT COUNT(*)::int FROM products) AS products, (SELECT COUNT(*)::int FROM external_homologs) AS homologs, (SELECT COUNT(*)::int FROM catalog_categories) AS categories`;
    expect(counts).toEqual({ products: 1, homologs: 0, categories: 0 });
  });
});
