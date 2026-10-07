import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, type Uuid } from '@cdr/shared';
import { and, asc, desc, eq, isNull, max } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';
import { ProductAsset, type ProductAssetSnapshot } from '../../domain/entities/product-asset';
import type {
  AssetSlot,
  ProductAssetRepositoryPort,
} from '../../domain/ports/product-asset-repository.port';
import { productAssets, type ProductAssetRow } from './product-assets.tables';
import { recordAssetAuditWithin } from './record-asset-audit-within-transaction';

@Injectable()
export class DrizzleProductAssetRepository implements ProductAssetRepositoryPort {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async listByProductId(productId: Uuid): Promise<ProductAsset[]> {
    const rows = await this.database
      .select({ asset: productAssets, sku: products.sku })
      .from(productAssets)
      .innerJoin(products, eq(productAssets.productId, products.id))
      .where(and(eq(productAssets.productId, productId), isNull(productAssets.deletedAt)))
      .orderBy(asc(productAssets.kind), asc(productAssets.typeCode), asc(productAssets.position));
    return rows.map((row) => this.toDomain(row.asset, row.sku));
  }

  async findById(id: Uuid): Promise<ProductAsset | null> {
    const [row] = await this.database
      .select({ asset: productAssets, sku: products.sku })
      .from(productAssets)
      .innerJoin(products, eq(productAssets.productId, products.id))
      .where(and(eq(productAssets.id, id), isNull(productAssets.deletedAt)))
      .limit(1);
    return row ? this.toDomain(row.asset, row.sku) : null;
  }

  async findActiveSlot(slot: AssetSlot): Promise<ProductAsset | null> {
    const position =
      slot.position === null
        ? isNull(productAssets.position)
        : eq(productAssets.position, slot.position);
    const [row] = await this.database
      .select({ asset: productAssets, sku: products.sku })
      .from(productAssets)
      .innerJoin(products, eq(productAssets.productId, products.id))
      .where(
        and(
          eq(productAssets.productId, slot.productId),
          eq(productAssets.typeCode, slot.type),
          position,
          isNull(productAssets.deletedAt),
        ),
      )
      .limit(1);
    return row ? this.toDomain(row.asset, row.sku) : null;
  }

  async nextPhotoPosition(productId: Uuid): Promise<number> {
    const [row] = await this.database
      .select({ position: max(productAssets.position) })
      .from(productAssets)
      .where(
        and(
          eq(productAssets.productId, productId),
          eq(productAssets.typeCode, 'FOTO'),
          isNull(productAssets.deletedAt),
        ),
      );
    return (row?.position ?? 0) + 1;
  }

  async saveReplacing(
    asset: ProductAsset,
    actorId: string,
    now: Date,
    audit: (saved: ProductAsset, replaced: ProductAsset | null) => AuditEntry,
  ): Promise<{ saved: ProductAsset; replaced: ProductAsset | null }> {
    const snapshot = asset.toSnapshot();
    try {
      return await this.database.transaction(async (transaction) => {
        // All asset-slot mutations for a product serialize on its catalog row.
        await transaction
          .select({ id: products.id })
          .from(products)
          .where(eq(products.id, snapshot.productId))
          .for('update');
        const slotPosition =
          snapshot.position === null
            ? isNull(productAssets.position)
            : eq(productAssets.position, snapshot.position);
        const [current] = await transaction
          .select({ asset: productAssets, sku: products.sku })
          .from(productAssets)
          .innerJoin(products, eq(productAssets.productId, products.id))
          .where(
            and(
              eq(productAssets.productId, snapshot.productId),
              eq(productAssets.typeCode, snapshot.type),
              slotPosition,
              isNull(productAssets.deletedAt),
            ),
          )
          .orderBy(desc(productAssets.uploadedAt))
          .limit(1);

        if (current) {
          await transaction
            .update(productAssets)
            .set({ deletedAt: now, deletedBy: actorId })
            .where(and(eq(productAssets.id, current.asset.id), isNull(productAssets.deletedAt)));
        }

        const replacesAssetId = current ? (current.asset.id as Uuid) : null;
        await transaction.insert(productAssets).values({
          id: snapshot.id,
          productId: snapshot.productId,
          kind: snapshot.kind,
          typeCode: snapshot.type,
          originalFilename: snapshot.filename,
          objectKey: snapshot.objectKey,
          bucket: snapshot.bucket,
          mimeType: snapshot.mimeType,
          sizeBytes: snapshot.size,
          checksumSha256: snapshot.checksum,
          storageVersionId: snapshot.storageVersionId,
          position: snapshot.position,
          source: snapshot.source,
          uploadedBy: snapshot.uploadedBy,
          uploadedAt: snapshot.uploadedAt,
          replacesAssetId,
        });

        const saved = ProductAsset.rehydrate({ ...snapshot, replacesAssetId });
        const replaced = current ? this.toDomain(current.asset, current.sku) : null;
        await recordAssetAuditWithin(transaction, audit(saved, replaced));
        return {
          saved,
          replaced,
        };
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictError('Another asset already occupies this product slot');
      }
      throw error;
    }
  }

  async softDelete(
    id: Uuid,
    actorId: string,
    now: Date,
    audit: (deleted: ProductAsset) => AuditEntry,
  ): Promise<ProductAsset | null> {
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .select({ asset: productAssets, sku: products.sku })
        .from(productAssets)
        .innerJoin(products, eq(productAssets.productId, products.id))
        .where(and(eq(productAssets.id, id), isNull(productAssets.deletedAt)))
        .limit(1)
        .for('update');
      if (!row) return null;
      const current = this.toDomain(row.asset, row.sku);
      await transaction
        .update(productAssets)
        .set({ deletedAt: now, deletedBy: actorId })
        .where(and(eq(productAssets.id, id), isNull(productAssets.deletedAt)));
      await recordAssetAuditWithin(transaction, audit(current));
      return current;
    });
  }

  private toDomain(row: ProductAssetRow, sku: string): ProductAsset {
    const snapshot: ProductAssetSnapshot = {
      id: row.id as Uuid,
      productId: row.productId as Uuid,
      sku,
      kind: row.kind as ProductAssetSnapshot['kind'],
      type: row.typeCode as ProductAssetSnapshot['type'],
      filename: row.originalFilename,
      objectKey: row.objectKey,
      bucket: row.bucket,
      mimeType: row.mimeType,
      size: row.sizeBytes,
      checksum: row.checksumSha256,
      storageVersionId: row.storageVersionId,
      position: row.position,
      source: row.source as ProductAssetSnapshot['source'],
      uploadedBy: row.uploadedBy,
      uploadedAt: row.uploadedAt,
      replacesAssetId: row.replacesAssetId as Uuid | null,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy,
    };
    return ProductAsset.rehydrate(snapshot);
  }
}
