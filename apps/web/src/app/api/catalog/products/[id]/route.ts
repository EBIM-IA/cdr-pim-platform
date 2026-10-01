import { NextResponse } from 'next/server';

import { ApiClientError, createServerApiClient } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return NextResponse.json(await createServerApiClient().getProduct(id));
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
