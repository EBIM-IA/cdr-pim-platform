import { updateProductAttributesBatchSchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { createServerApiClient } from '@/lib/api-client';
import { hasExpectedOrigin } from '@/lib/auth';
import {
  catalogRouteError,
  invalidCatalogRequest,
  unauthenticatedCatalogResponse,
} from '@/lib/dynamic-catalog-route';
import { securePrivateResponse } from '@/lib/http-security';
import { getAccessToken } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasExpectedOrigin(request.headers.get('origin'), request.nextUrl.origin)) {
    return securePrivateResponse(
      NextResponse.json({ message: 'Origen de solicitud no permitido.' }, { status: 403 }),
    );
  }
  const accessToken = await getAccessToken();
  if (!accessToken) return unauthenticatedCatalogResponse();
  const body: unknown = await request.json().catch(() => null);
  const parsed = updateProductAttributesBatchSchema.safeParse(body);
  if (!parsed.success) {
    return invalidCatalogRequest('El lote de atributos no es válido.', parsed.error.issues);
  }
  const { id } = await context.params;

  try {
    return securePrivateResponse(
      NextResponse.json(
        await createServerApiClient({ accessToken }).updateProductAttributes(id, parsed.data),
      ),
    );
  } catch (error) {
    return catalogRouteError(error, 'No fue posible guardar el enriquecimiento completo.');
  }
}
