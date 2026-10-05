import { updateProductAttributeSchema } from '@cdr/contracts';
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; attributeKey: string }> },
) {
  if (!hasExpectedOrigin(request.headers.get('origin'), request.nextUrl.origin)) {
    return securePrivateResponse(
      NextResponse.json({ message: 'Origen de solicitud no permitido.' }, { status: 403 }),
    );
  }
  const accessToken = await getAccessToken();
  if (!accessToken) return unauthenticatedCatalogResponse();
  const body: unknown = await request.json().catch(() => null);
  const parsed = updateProductAttributeSchema.safeParse(body);
  if (!parsed.success) {
    return invalidCatalogRequest('El valor del atributo no es válido.', parsed.error.issues);
  }
  const { id, attributeKey } = await context.params;

  try {
    return securePrivateResponse(
      NextResponse.json(
        await createServerApiClient({ accessToken }).updateProductAttribute(
          id,
          attributeKey,
          parsed.data,
        ),
      ),
    );
  } catch (error) {
    return catalogRouteError(error, 'No fue posible actualizar el atributo.');
  }
}
