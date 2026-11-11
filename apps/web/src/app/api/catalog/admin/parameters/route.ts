import {
  catalogParameterSchema,
  catalogParameterQuerySchema,
  saveCatalogParameterSchema,
} from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const query = catalogParameterQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success)
    return securePrivateResponse(
      NextResponse.json({ message: 'Catálogo no válido' }, { status: 400 }),
    );
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/catalog/admin/parameters?${new URLSearchParams(query.data)}`,
    outputSchema: catalogParameterSchema.array(),
  });
}
export async function POST(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: '/catalog/admin/parameters',
    inputSchema: saveCatalogParameterSchema,
    outputSchema: catalogParameterSchema,
  });
}
