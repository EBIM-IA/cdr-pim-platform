import {
  deactivateGroupApplicationQuerySchema,
  groupApplicationSchema,
  updateGroupApplicationSchema,
  uuidSchema,
} from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

async function parseId(context: { params: Promise<{ id: string }> }) {
  return uuidSchema.safeParse((await context.params).id);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = await parseId(context);
  if (!id.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'La aplicación indicada no es válida.' }, { status: 400 }),
    );
  }
  return proxyPrivateApi({
    request,
    method: 'PATCH',
    path: `/applications/${encodeURIComponent(id.data)}`,
    inputSchema: updateGroupApplicationSchema,
    outputSchema: groupApplicationSchema,
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = await parseId(context);
  if (!id.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'La aplicación indicada no es válida.' }, { status: 400 }),
    );
  }
  const query = deactivateGroupApplicationQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'La versión de la aplicación no es válida.' }, { status: 400 }),
    );
  }
  return proxyPrivateApi({
    request,
    method: 'DELETE',
    path: `/applications/${encodeURIComponent(id.data)}?expectedUpdatedAt=${encodeURIComponent(query.data.expectedUpdatedAt)}`,
    outputSchema: groupApplicationSchema,
  });
}
