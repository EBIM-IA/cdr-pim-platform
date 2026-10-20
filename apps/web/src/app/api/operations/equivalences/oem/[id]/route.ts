import {
  deactivateGroupOemCodeQuerySchema,
  groupOemCodeSchema,
  updateGroupOemCodeSchema,
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
      NextResponse.json({ message: 'El código OEM indicado no es válido.' }, { status: 400 }),
    );
  }
  return proxyPrivateApi({
    request,
    method: 'PATCH',
    path: `/equivalences/oem/${encodeURIComponent(id.data)}`,
    inputSchema: updateGroupOemCodeSchema,
    outputSchema: groupOemCodeSchema,
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = await parseId(context);
  if (!id.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'El código OEM indicado no es válido.' }, { status: 400 }),
    );
  }
  const query = deactivateGroupOemCodeQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'La versión del código OEM no es válida.' }, { status: 400 }),
    );
  }
  return proxyPrivateApi({
    request,
    method: 'DELETE',
    path: `/equivalences/oem/${encodeURIComponent(id.data)}?expectedUpdatedAt=${encodeURIComponent(query.data.expectedUpdatedAt)}`,
    outputSchema: groupOemCodeSchema,
  });
}
