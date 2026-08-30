import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FakeEmbeddingAdapter } from '../../src/modules/ai/infrastructure/fake/fake-embedding.adapter';
import { Product } from '../../src/modules/catalog/domain/entities/product';
import { DrizzleProductRepository } from '../../src/modules/catalog/infrastructure/persistence/drizzle-product.repository';
import { IndexProductUseCase } from '../../src/modules/search/application/index-product.use-case';
import { SemanticSearchUseCase } from '../../src/modules/search/application/semantic-search.use-case';
import { DrizzleProductVectorIndex } from '../../src/modules/search/infrastructure/persistence/drizzle-product-vector-index.adapter';
import { type TestDatabase, createTestDatabase } from './database.helper';

const now = new Date('2026-08-30T12:00:00.000Z');

/**
 * End-to-end proof of the pgvector pipeline:
 *
 *   product -> embedding provider -> vector(1536) column -> cosine similarity -> ranked hits
 *
 * The provider is the deterministic fake, so this suite costs nothing, never flakes and
 * never calls OpenAI — while still exercising the real SQL, the real column type and the
 * real HNSW-backed operator.
 */
describe('pgvector semantic search', () => {
  let database: TestDatabase;
  let products: DrizzleProductRepository;
  let index: DrizzleProductVectorIndex;
  let indexProduct: IndexProductUseCase;
  let search: SemanticSearchUseCase;
  const embeddings = new FakeEmbeddingAdapter('fake-embedding-v1', 1536);

  beforeAll(async () => {
    database = await createTestDatabase();
    products = new DrizzleProductRepository(database.db);
    index = new DrizzleProductVectorIndex(database.db);
    indexProduct = new IndexProductUseCase(products, embeddings, index);
    search = new SemanticSearchUseCase(embeddings, index);
  });

  beforeEach(() => database.truncateAll());
  afterAll(() => database.close());

  async function seed(sku: string, name: string, description: string): Promise<Product> {
    const product = Product.create({ sku, name, description, brand: 'SKF', now });
    await products.save(product);
    await indexProduct.execute(product.id);
    return product;
  }

  it('stores a 1536-dimension vector and finds the closest product', async () => {
    const bearing = await seed(
      '6205-2RS',
      'Rodamiento rigido de bolas 6205 2RS',
      'Rodamiento sellado por ambos lados para eje de 25 mm',
    );
    await seed(
      'ACE-15W40',
      'Aceite lubricante mineral 15W40',
      'Aceite para motor diesel, balde de 5 galones',
    );

    const stored = await database.sql<{ dimensions: number; model: string }[]>`
      SELECT dimensions, model FROM product_embeddings WHERE product_id = ${bearing.id}
    `;
    expect(stored[0]?.dimensions).toBe(1536);
    expect(stored[0]?.model).toBe('fake-embedding-v1');

    const result = await search.execute('rodamiento de bolas sellado 6205', 5);

    expect(result.model).toBe('fake-embedding-v1');
    expect(result.hits[0]?.sku).toBe('6205-2RS');
    expect(result.hits[0]?.score).toBeGreaterThan(result.hits[1]?.score ?? 0);
    expect(result.hits[0]?.score).toBeGreaterThanOrEqual(0);
    expect(result.hits[0]?.score).toBeLessThanOrEqual(1);
  });

  it('skips re-embedding when the source text has not changed', async () => {
    const product = await seed('6205-2RS', 'Rodamiento', 'Sellado por ambos lados');

    const second = await indexProduct.execute(product.id);
    expect(second).toMatchObject({ indexed: false, reason: 'unchanged' });

    const forced = await indexProduct.execute(product.id, true);
    expect(forced.indexed).toBe(true);
  });

  it('re-embeds once the product text changes', async () => {
    const product = await seed('6205-2RS', 'Rodamiento', 'Sellado por ambos lados');

    product.describe('Sellado por ambos lados, jaula de poliamida.', now);
    await products.save(product);

    expect((await indexProduct.execute(product.id)).indexed).toBe(true);

    const rows = await database.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM product_embeddings WHERE product_id = ${product.id}
    `;
    // Still one row per (product, model): the upsert replaced the vector in place.
    expect(rows[0]?.count).toBe('1');
  });

  it('keeps vectors from different models side by side', async () => {
    const product = await seed('6205-2RS', 'Rodamiento', 'Sellado');
    const nextModel = new FakeEmbeddingAdapter('fake-embedding-v2', 1536);
    const [vector] = await nextModel.embed(['whatever']);

    await index.upsert({
      productId: product.id,
      model: nextModel.model,
      dimensions: 1536,
      vector: vector!.vector,
      sourceHash: 'hash-v2',
    });

    const rows = await database.sql<{ model: string }[]>`
      SELECT model FROM product_embeddings WHERE product_id = ${product.id} ORDER BY model
    `;
    expect(rows.map((row) => row.model)).toEqual(['fake-embedding-v1', 'fake-embedding-v2']);

    // A search for v1 must not be polluted by v2's vectors.
    const result = await search.execute('rodamiento', 10);
    expect(result.hits).toHaveLength(1);
  });

  it('rejects a vector whose width does not match the column', async () => {
    const product = await seed('6205-2RS', 'Rodamiento', 'Sellado');

    await expect(
      index.upsert({
        productId: product.id,
        model: 'wrong-width',
        dimensions: 768,
        vector: new Array(768).fill(0.1),
        sourceHash: 'x',
      }),
    ).rejects.toThrow(/dimensionality does not match/);
  });

  it('deletes embeddings when the product is deleted', async () => {
    const product = await seed('6205-2RS', 'Rodamiento', 'Sellado');
    await database.sql`DELETE FROM products WHERE id = ${product.id}`;

    const rows = await database.sql`SELECT 1 FROM product_embeddings`;
    expect(rows).toHaveLength(0);
  });
});
