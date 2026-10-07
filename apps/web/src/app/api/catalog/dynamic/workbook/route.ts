import { catalogWorkbookQuerySchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { createServerApiClient } from '@/lib/api-client';
import {
  catalogRouteError,
  invalidCatalogRequest,
  unauthenticatedCatalogResponse,
} from '@/lib/dynamic-catalog-route';
import { securePrivateResponse } from '@/lib/http-security';
import { getAccessToken } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const accessToken = await getAccessToken();
  if (!accessToken) return unauthenticatedCatalogResponse();
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filter = request.nextUrl.searchParams.getAll('filter');
  const columnFilter = request.nextUrl.searchParams.getAll('columnFilter');
  const parsed = catalogWorkbookQuerySchema.safeParse({ ...raw, filter, columnFilter });
  if (!parsed.success) {
    return invalidCatalogRequest(
      'Los criterios de la tabla del catálogo no son válidos.',
      parsed.error.issues,
    );
  }

  try {
    return securePrivateResponse(
      NextResponse.json(
        await createServerApiClient({ accessToken }).listCatalogWorkbook(parsed.data),
      ),
    );
  } catch (error) {
    return catalogRouteError(error, 'No fue posible cargar la tabla dinámica del catálogo.');
  }
}
