import { productListQuerySchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { ApiClientError, createServerApiClient } from '@/lib/api-client';
import { getAccessToken } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Debes iniciar sesión.' }, { status: 401 });
  }

  const parsed = productListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Los filtros del catálogo no son válidos.', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const { page, pageSize, q, brand, status } = parsed.data;
    const result = await createServerApiClient({ accessToken }).listProducts(page, pageSize, {
      q,
      brand,
      status,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiClientError) {
      return NextResponse.json(
        { message: error.message, correlationId: error.correlationId },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { message: 'No fue posible conectar con el catálogo.' },
      { status: 502 },
    );
  }
}
