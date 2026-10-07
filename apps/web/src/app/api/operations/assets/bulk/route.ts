import { PRODUCT_ASSET_ZIP_MAX_BYTES, productAssetBulkResultSchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';

import { proxyPrivateMultipart } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export function POST(request: NextRequest) {
  return proxyPrivateMultipart({
    request,
    path: '/assets/bulk',
    outputSchema: productAssetBulkResultSchema,
    maxBytes: PRODUCT_ASSET_ZIP_MAX_BYTES + 64 * 1024,
    timeoutMs: 120_000,
  });
}
