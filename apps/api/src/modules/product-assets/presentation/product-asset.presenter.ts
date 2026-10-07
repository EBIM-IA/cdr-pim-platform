import type { ProductAssetBulkResultDto, ProductAssetDto } from '@cdr/contracts';

import type { BulkAssetResult } from '../application/manage-product-assets.use-cases';
import type { ProductAsset } from '../domain/entities/product-asset';

export function toProductAssetDto(asset: ProductAsset): ProductAssetDto {
  const snapshot = asset.toSnapshot();
  return {
    id: snapshot.id,
    productId: snapshot.productId,
    sku: snapshot.sku,
    kind: snapshot.kind,
    type: snapshot.type,
    filename: snapshot.filename,
    mimeType: snapshot.mimeType,
    size: snapshot.size,
    checksum: snapshot.checksum,
    position: snapshot.position,
    source: snapshot.source,
    uploadedBy: snapshot.uploadedBy,
    uploadedAt: snapshot.uploadedAt.toISOString(),
    replacesAssetId: snapshot.replacesAssetId,
  };
}

export function toProductAssetBulkResultDto(result: BulkAssetResult): ProductAssetBulkResultDto {
  return {
    ...result,
    items: result.items.map((item) => ({
      ...item,
      asset: item.asset ? toProductAssetDto(item.asset) : null,
    })),
  };
}
