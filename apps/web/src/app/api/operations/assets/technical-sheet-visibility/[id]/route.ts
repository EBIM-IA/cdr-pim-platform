import {
  technicalSheetVisibilitySchema,
  updateTechnicalSheetVisibilitySchema,
  uuidSchema,
} from '@cdr/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';
export const dynamic = 'force-dynamic';
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  method: 'GET' | 'PATCH',
) {
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success)
    return securePrivateResponse(
      NextResponse.json({ message: 'El producto indicado no es válido.' }, { status: 400 }),
    );
  return proxyPrivateApi({
    request,
    method,
    path: `/assets/technical-sheet-visibility/${encodeURIComponent(id.data)}`,
    inputSchema: method === 'PATCH' ? updateTechnicalSheetVisibilitySchema : undefined,
    outputSchema: technicalSheetVisibilitySchema,
  });
}
export function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return proxy(request, context, 'GET');
}
export function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return proxy(request, context, 'PATCH');
}
