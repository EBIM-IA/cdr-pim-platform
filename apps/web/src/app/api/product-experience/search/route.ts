import { productVariantSearchQuerySchema, productVariantSearchSchema } from '@cdr/contracts';
import { NextResponse, type NextRequest } from 'next/server';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export function GET(request: NextRequest) {
  const parsed = productVariantSearchQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success)
    return securePrivateResponse(
      NextResponse.json({ message: 'La búsqueda no es válida.' }, { status: 400 }),
    );
  const params = new URLSearchParams({ q: parsed.data.q, limit: String(parsed.data.limit) });
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/product-experience/search?${params}`,
    outputSchema: productVariantSearchSchema,
  });
}
