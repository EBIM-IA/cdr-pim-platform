import { productExperienceSchema, uuidSchema } from '@cdr/contracts';
import { NextResponse, type NextRequest } from 'next/server';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success)
    return securePrivateResponse(
      NextResponse.json({ message: 'Producto no válido.' }, { status: 400 }),
    );
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/product-experience/${encodeURIComponent(id)}`,
    outputSchema: productExperienceSchema,
  });
}
