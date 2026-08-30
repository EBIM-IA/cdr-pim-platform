import { Inject, Injectable } from '@nestjs/common';
import { type Uuid, ValidationError, newUuid } from '@cdr/shared';
import { and, cosineDistance, eq, sql } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';
import type {
  ProductVectorIndexPort,
  UpsertVectorCommand,
  VectorSearchHit,
} from '../../domain/ports/product-vector-index.port';
import { EMBEDDING_DIMENSIONS, productEmbeddings } from './search.tables';

/**
 * pgvector adapter.
 *
 * Similarity is computed with the `<=>` cosine-distance operator, which is what the HNSW
 * index built in migration 0002 is defined over — using any other operator here would
 * silently fall back to a sequential scan.
 */
@Injectable()
export class DrizzleProductVectorIndex implements ProductVectorIndexPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async upsert(command: UpsertVectorCommand): Promise<void> {
    if (command.vector.length !== EMBEDDING_DIMENSIONS) {
      // Caught here rather than at the database, so the message names the real cause:
      // AI_EMBEDDING_DIMENSIONS drifting away from the vector(N) column width.
      throw new ValidationError('Embedding dimensionality does not match the vector column', {
        expected: EMBEDDING_DIMENSIONS,
        received: command.vector.length,
        model: command.model,
      });
    }

    await this.db
      .insert(productEmbeddings)
      .values({
        id: newUuid(),
        productId: command.productId,
        model: command.model,
        dimensions: command.dimensions,
        embedding: command.vector,
        sourceHash: command.sourceHash,
      })
      .onConflictDoUpdate({
        target: [productEmbeddings.productId, productEmbeddings.model],
        set: {
          embedding: command.vector,
          dimensions: command.dimensions,
          sourceHash: command.sourceHash,
          createdAt: new Date(),
        },
      });
  }

  async currentSourceHash(productId: Uuid, model: string): Promise<string | null> {
    const rows = await this.db
      .select({ sourceHash: productEmbeddings.sourceHash })
      .from(productEmbeddings)
      .where(and(eq(productEmbeddings.productId, productId), eq(productEmbeddings.model, model)))
      .limit(1);
    return rows[0]?.sourceHash ?? null;
  }

  async searchSimilar(input: {
    vector: number[];
    model: string;
    limit: number;
  }): Promise<VectorSearchHit[]> {
    const similarity = sql<number>`1 - (${cosineDistance(productEmbeddings.embedding, input.vector)})`;

    const rows = await this.db
      .select({
        productId: products.id,
        sku: products.sku,
        name: products.name,
        score: similarity,
      })
      .from(productEmbeddings)
      .innerJoin(products, eq(products.id, productEmbeddings.productId))
      // Restricting to one model matters: vectors from different models are not
      // comparable, and the table holds several by design.
      .where(eq(productEmbeddings.model, input.model))
      .orderBy(cosineDistance(productEmbeddings.embedding, input.vector))
      .limit(input.limit);

    return rows.map((row) => ({
      productId: row.productId as Uuid,
      sku: row.sku,
      name: row.name,
      // Floating-point drift can push this a hair outside [0,1]; the contract says otherwise.
      score: Math.min(1, Math.max(0, Number(row.score))),
    }));
  }
}
