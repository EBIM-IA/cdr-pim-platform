import { productAssetListSchema, reorderProductAssetsSchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';
import { proxyPrivateApi } from '@/lib/private-api-route';
export const dynamic = 'force-dynamic';
export function POST(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: '/assets/order',
    inputSchema: reorderProductAssetsSchema,
    outputSchema: productAssetListSchema,
  });
}
