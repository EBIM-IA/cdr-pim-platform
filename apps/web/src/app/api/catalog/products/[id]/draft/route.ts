import { productDraftSchema, saveProductDraftSchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';

import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { id } = await context.params;
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/catalog/products/${encodeURIComponent(id)}/draft`,
    outputSchema: productDraftSchema,
  });
}

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  return proxyPrivateApi({
    request,
    method: 'PATCH',
    path: `/catalog/products/${encodeURIComponent(id)}/draft`,
    inputSchema: saveProductDraftSchema,
    outputSchema: productDraftSchema,
  });
}
