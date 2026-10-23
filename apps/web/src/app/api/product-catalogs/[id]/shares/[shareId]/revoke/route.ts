import { productCatalogShareSchema, productCatalogVersionSchema, uuidSchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; shareId: string }> },
) {
  const params = await context.params;
  const id = uuidSchema.safeParse(params.id);
  const shareId = uuidSchema.safeParse(params.shareId);
  if (!id.success || !shareId.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'El enlace indicado no es válido.' }, { status: 400 }),
    );
  }
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: `/product-catalogs/${id.data}/shares/${shareId.data}/revoke`,
    inputSchema: productCatalogVersionSchema,
    outputSchema: productCatalogShareSchema,
  });
}
