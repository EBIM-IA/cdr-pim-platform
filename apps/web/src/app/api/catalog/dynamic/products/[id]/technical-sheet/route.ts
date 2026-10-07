import { NextResponse } from 'next/server';

import { createServerApiClient } from '@/lib/api-client';
import { catalogRouteError, unauthenticatedCatalogResponse } from '@/lib/dynamic-catalog-route';
import { securePrivateResponse } from '@/lib/http-security';
import { getAccessToken } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const accessToken = await getAccessToken();
  if (!accessToken) return unauthenticatedCatalogResponse();
  const { id } = await context.params;

  try {
    return securePrivateResponse(
      NextResponse.json(await createServerApiClient({ accessToken }).getProductTechnicalSheet(id)),
    );
  } catch (error) {
    return catalogRouteError(error, 'No fue posible generar la ficha técnica del producto.');
  }
}
