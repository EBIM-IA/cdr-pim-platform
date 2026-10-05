import { catalogSchemaQuerySchema } from '@cdr/contracts';
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
  const parsed = catalogSchemaQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return invalidCatalogRequest('La categoría seleccionada no es válida.', parsed.error.issues);
  }

  try {
    return securePrivateResponse(
      NextResponse.json(
        await createServerApiClient({ accessToken }).getCatalogGridSchema(parsed.data.categoryId),
      ),
    );
  } catch (error) {
    return catalogRouteError(error, 'No fue posible cargar la plantilla de la categoría.');
  }
}
