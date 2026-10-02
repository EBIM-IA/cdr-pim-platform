import { newUuid } from '@cdr/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Product } from '../../src/modules/catalog/domain/entities/product';
import {
  ProductIdentifier,
  ProductIdentifierType,
} from '../../src/modules/catalog/domain/entities/product-identifier';
import { DrizzleProductRepository } from '../../src/modules/catalog/infrastructure/persistence/drizzle-product.repository';
import {
  type TestDatabase,
  createTestDatabase,
  expectConstraintViolation,
} from './database.helper';

const now = new Date('2026-08-30T12:00:00.000Z');

describe('DrizzleProductRepository', () => {
  let database: TestDatabase;
  let repository: DrizzleProductRepository;

  beforeAll(async () => {
    database = await createTestDatabase();
    repository = new DrizzleProductRepository(database.db);
  });

  beforeEach(() => database.truncateAll());
  afterAll(() => database.close());

  it('round-trips an aggregate with its identifiers', async () => {
    const product = Product.create({
      sku: '6205-2RS',
      name: 'Rodamiento rígido de bolas 6205-2RS',
      description: 'Sellado por ambos lados.',
      brand: 'SKF',
      now,
    });
    product.addIdentifier(
      ProductIdentifier.create(ProductIdentifierType.ErpItemId, 'AX-000123'),
      now,
    );

    await repository.save(product);
    const loaded = await repository.findById(product.id);

    expect(loaded).not.toBeNull();
    expect(loaded?.sku).toBe('6205-2RS');
    expect(loaded?.brand).toBe('SKF');
    expect(loaded?.identifiers.map(String).sort()).toEqual([
      'erp_item_id:AX-000123',
      'sku:6205-2RS',
    ]);
    // Timestamps must survive the round trip as UTC instants, not local times.
    expect(loaded?.createdAt.toISOString()).toBe('2026-08-30T12:00:00.000Z');
  });

  it('updates in place instead of inserting a second row', async () => {
    const product = Product.create({ sku: '6205-2RS', name: 'Rodamiento', now });
    await repository.save(product);

    product.rename('Rodamiento rígido de bolas', now);
    product.describe('Jaula de acero.', now);
    await repository.save(product);

    const { total, items } = await repository.list({ page: 1, pageSize: 10 });
    expect(total).toBe(1);
    expect(items[0]?.name).toBe('Rodamiento rígido de bolas');
  });

  it('replaces the identifier set on save rather than accumulating duplicates', async () => {
    const product = Product.create({ sku: '6205-2RS', name: 'Rodamiento', now });
    product.addIdentifier(
      ProductIdentifier.create(ProductIdentifierType.Ean, '7501031311309'),
      now,
    );
    await repository.save(product);
    await repository.save(product);

    const loaded = await repository.findById(product.id);
    expect(loaded?.identifiers).toHaveLength(2);
  });

  it('enforces SKU uniqueness at the database level, not just in the use case', async () => {
    await repository.save(Product.create({ sku: '6205-2RS', name: 'Uno', now }));

    const duplicate = Product.create({ sku: '6205-2RS', name: 'Dos', now, id: newUuid() });
    await expectConstraintViolation(repository.save(duplicate), 'products_sku_key');
  });

  it('refuses to let two products claim the same manufacturer part number', async () => {
    const first = Product.create({ sku: 'A-1', name: 'Uno', now });
    first.addIdentifier(
      ProductIdentifier.create(ProductIdentifierType.ManufacturerPartNumber, '6205-2RS'),
      now,
    );
    await repository.save(first);

    const second = Product.create({ sku: 'B-1', name: 'Dos', now });
    second.addIdentifier(
      ProductIdentifier.create(ProductIdentifierType.ManufacturerPartNumber, '6205-2RS'),
      now,
    );
    await expectConstraintViolation(repository.save(second), 'product_identifiers_type_value_key');
  });

  it('paginates deterministically by SKU', async () => {
    for (const sku of ['C-3', 'A-1', 'B-2']) {
      await repository.save(Product.create({ sku, name: `Producto ${sku}`, now }));
    }

    const first = await repository.list({ page: 1, pageSize: 2 });
    const second = await repository.list({ page: 2, pageSize: 2 });

    expect(first.items.map((product) => product.sku)).toEqual(['A-1', 'B-2']);
    expect(second.items.map((product) => product.sku)).toEqual(['C-3']);
    expect(first.total).toBe(3);
  });

  it('filters free text using the product description', async () => {
    await repository.save(
      Product.create({
        sku: 'D1672',
        name: 'Pastilla de freno',
        description: 'Compuesto cerámico de baja emisión de polvo.',
        now,
      }),
    );
    await repository.save(Product.create({ sku: '6205-2RS', name: 'Rodamiento', now }));

    const result = await repository.list({ page: 1, pageSize: 10, q: 'cerámico' });

    expect(result.total).toBe(1);
    expect(result.items.map((product) => product.sku)).toEqual(['D1672']);
  });

  it('returns null for an unknown id', async () => {
    expect(await repository.findById(newUuid())).toBeNull();
  });
});
