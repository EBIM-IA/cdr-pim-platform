import {
  type ProductAssetBulkMode,
  type ProductAssetBulkResultDto,
  type ProductAssetDto,
  type ProductAssetSelector,
  type ProductAssetType,
  deleteProductAssetResultSchema,
  productAssetBulkResultSchema,
  productAssetListSchema,
  productAssetSchema,
} from '@cdr/contracts';
import type { z } from 'zod';

import { authenticatedBffFetch } from '@/lib/bff-client';

export class ProductAssetsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ProductAssetsApiError';
  }
}

async function parseResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : `La operación respondió con estado ${response.status}.`;
    throw new ProductAssetsApiError(message, response.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ProductAssetsApiError('La respuesta de activos no coincide con el contrato.', 502);
  }
  return parsed.data;
}

export async function listProductAssets(
  selector: ProductAssetSelector,
  signal?: AbortSignal,
): Promise<ProductAssetDto[]> {
  const query = new URLSearchParams();
  if (selector.productId) query.set('productId', selector.productId);
  if (selector.sku) query.set('sku', selector.sku);
  const response = await authenticatedBffFetch(`/api/operations/assets?${query.toString()}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  return parseResponse(response, productAssetListSchema);
}

export async function uploadProductAsset(input: {
  readonly productId: string;
  readonly type: ProductAssetType;
  readonly file: File;
}): Promise<ProductAssetDto> {
  const body = new FormData();
  body.set('productId', input.productId);
  body.set('type', input.type);
  body.set('file', input.file);
  const response = await authenticatedBffFetch('/api/operations/assets', {
    method: 'POST',
    headers: { accept: 'application/json' },
    body,
  });
  return parseResponse(response, productAssetSchema);
}

export async function processProductAssetZip(
  file: File,
  mode: ProductAssetBulkMode,
): Promise<ProductAssetBulkResultDto> {
  const body = new FormData();
  body.set('mode', mode);
  body.set('file', file);
  const response = await authenticatedBffFetch('/api/operations/assets/bulk', {
    method: 'POST',
    headers: { accept: 'application/json' },
    body,
  });
  return parseResponse(response, productAssetBulkResultSchema);
}

export async function deleteProductAsset(id: string): Promise<void> {
  const response = await authenticatedBffFetch(`/api/operations/assets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { accept: 'application/json' },
  });
  await parseResponse(response, deleteProductAssetResultSchema);
}

export function productAssetDownloadUrl(id: string): string {
  return `/api/operations/assets/${encodeURIComponent(id)}/download`;
}
