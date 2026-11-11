import {
  ecommerceDescriptionResultSchema,
  ecommerceDescriptionSchema,
  ecommerceMutationSchema,
  ecommerceVariantSchema,
  uuidSchema,
} from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const variant = ecommerceVariantSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!uuidSchema.safeParse(id).success || !variant.success)
    return securePrivateResponse(
      NextResponse.json({ message: 'Producto o variante no válidos.' }, { status: 400 }),
    );
  const query = new URLSearchParams({ type: variant.data.type });
  if (variant.data.applicationId) query.set('applicationId', variant.data.applicationId);
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/ecommerce-descriptions/${encodeURIComponent(id)}?${query}`,
    outputSchema: ecommerceDescriptionResultSchema,
  });
}
export async function POST(request: NextRequest, context: Context) {
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success)
    return securePrivateResponse(
      NextResponse.json({ message: 'Producto no válido.' }, { status: 400 }),
    );
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: `/ecommerce-descriptions/${encodeURIComponent(id)}`,
    inputSchema: ecommerceMutationSchema,
    outputSchema: ecommerceDescriptionSchema,
    timeoutMs: 60_000,
  });
}
