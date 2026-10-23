import {
  PRODUCT_CATALOG_MAX_BYTES,
  productCatalogDetailSchema,
  productCatalogSchema,
  productCatalogVersionSchema,
  uuidSchema,
} from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi, proxyPrivateMultipart } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

function invalidId() {
  return securePrivateResponse(
    NextResponse.json({ message: 'El catálogo indicado no es válido.' }, { status: 400 }),
  );
}

export async function GET(request: NextRequest, context: Context) {
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) return invalidId();
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/product-catalogs/${id.data}`,
    outputSchema: productCatalogDetailSchema,
  });
}

export async function POST(request: NextRequest, context: Context) {
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) return invalidId();
  return proxyPrivateMultipart({
    request,
    path: `/product-catalogs/${id.data}`,
    outputSchema: productCatalogSchema,
    maxBytes: PRODUCT_CATALOG_MAX_BYTES + 64 * 1024,
    timeoutMs: 60_000,
  });
}

export async function DELETE(request: NextRequest, context: Context) {
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) return invalidId();
  return proxyPrivateApi({
    request,
    method: 'DELETE',
    path: `/product-catalogs/${id.data}`,
    inputSchema: productCatalogVersionSchema,
    outputSchema: productCatalogSchema,
  });
}
