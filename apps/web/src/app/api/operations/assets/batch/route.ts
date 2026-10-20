import { productAssetBatchQuerySchema, productAssetBatchSchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  const query = productAssetBatchQuerySchema.safeParse({
    productIds: request.nextUrl.searchParams.get('productIds'),
  });
  if (!query.success) {
    return securePrivateResponse(
      NextResponse.json(
        { message: 'Selecciona entre 1 y 100 productos válidos.' },
        { status: 400 },
      ),
    );
  }
  const productIds = query.data.productIds.join(',');
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/assets/batch?productIds=${encodeURIComponent(productIds)}`,
    outputSchema: productAssetBatchSchema,
  });
}
