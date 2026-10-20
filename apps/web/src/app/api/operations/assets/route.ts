import {
  PRODUCT_ASSET_MAX_BYTES,
  productAssetListSchema,
  productAssetSchema,
  productAssetSelectorSchema,
} from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi, proxyPrivateMultipart } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export async function GET(request: NextRequest) {
  const query = productAssetSelectorSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'Selecciona un único producto o SKU.' }, { status: 400 }),
    );
  }
  const params = new URLSearchParams();
  if (query.data.productId) params.set('productId', query.data.productId);
  if (query.data.sku) params.set('sku', query.data.sku);
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/assets?${params.toString()}`,
    outputSchema: productAssetListSchema,
  });
}

export function POST(request: NextRequest) {
  return proxyPrivateMultipart({
    request,
    path: '/assets',
    outputSchema: productAssetSchema,
    maxBytes: PRODUCT_ASSET_MAX_BYTES + MULTIPART_OVERHEAD_BYTES,
    timeoutMs: 60_000,
  });
}
