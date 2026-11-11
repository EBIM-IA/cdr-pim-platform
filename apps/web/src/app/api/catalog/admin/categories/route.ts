import {
  adminCatalogCategorySchema,
  adminCategoryListQuerySchema,
  createCatalogCategorySchema,
} from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const query = adminCategoryListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'El filtro de categorías no es válido.' }, { status: 400 }),
    );
  }
  const params = new URLSearchParams({ includeInactive: String(query.data.includeInactive) });
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/catalog/admin/categories?${params.toString()}`,
    outputSchema: z.array(adminCatalogCategorySchema),
  });
}

export async function POST(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: '/catalog/admin/categories',
    inputSchema: createCatalogCategorySchema,
    outputSchema: adminCatalogCategorySchema,
  });
}
