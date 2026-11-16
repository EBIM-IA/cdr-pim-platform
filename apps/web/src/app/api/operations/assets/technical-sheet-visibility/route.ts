import { productAssetBatchQuerySchema, technicalSheetVisibilityListSchema } from '@cdr/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';
export const dynamic = 'force-dynamic';
export function GET(request: NextRequest) {
  const query = productAssetBatchQuerySchema.safeParse({
    productIds: request.nextUrl.searchParams.get('productIds'),
  });
  if (!query.success)
    return securePrivateResponse(
      NextResponse.json(
        { message: 'Selecciona entre 1 y 100 productos válidos.' },
        { status: 400 },
      ),
    );
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/assets/technical-sheet-visibility?productIds=${encodeURIComponent(query.data.productIds.join(','))}`,
    outputSchema: technicalSheetVisibilityListSchema,
  });
}
