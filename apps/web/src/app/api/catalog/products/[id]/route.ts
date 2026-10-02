import { NextResponse } from 'next/server';

import { ApiClientError, createServerApiClient } from '@/lib/api-client';
import { securePrivateResponse } from '@/lib/http-security';
import { getAccessToken } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return securePrivateResponse(
      NextResponse.json({ message: 'Debes iniciar sesión.' }, { status: 401 }),
    );
  }

  const { id } = await context.params;
  try {
    return securePrivateResponse(
      NextResponse.json(await createServerApiClient({ accessToken }).getProduct(id)),
    );
  } catch (error) {
    if (error instanceof ApiClientError) {
      return securePrivateResponse(
        NextResponse.json(
          { message: error.message, correlationId: error.correlationId },
          { status: error.status },
        ),
      );
    }
    return securePrivateResponse(
      NextResponse.json({ message: 'No fue posible conectar con el catálogo.' }, { status: 502 }),
    );
  }
}
