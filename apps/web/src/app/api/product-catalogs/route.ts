import {
  PRODUCT_CATALOG_MAX_BYTES,
  productCatalogListQuerySchema,
  productCatalogListSchema,
  productCatalogSchema,
} from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi, proxyPrivateMultipart } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const query = productCatalogListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'Los filtros de catálogos no son válidos.' }, { status: 400 }),
    );
  }
  const params = new URLSearchParams({
    page: String(query.data.page),
    pageSize: String(query.data.pageSize),
    includeDeleted: String(query.data.includeDeleted),
  });
  if (query.data.q) params.set('q', query.data.q);
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/product-catalogs?${params.toString()}`,
    outputSchema: productCatalogListSchema,
  });
}

export function POST(request: NextRequest) {
  return proxyPrivateMultipart({
    request,
    path: '/product-catalogs',
    outputSchema: productCatalogSchema,
    maxBytes: PRODUCT_CATALOG_MAX_BYTES + 64 * 1024,
    timeoutMs: 60_000,
  });
}
