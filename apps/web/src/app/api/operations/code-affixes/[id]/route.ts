import { codeAffixSchema, updateCodeAffixSchema, uuidSchema } from '@cdr/contracts';
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
      NextResponse.json({ message: 'La regla indicada no es válida.' }, { status: 400 }),
    );
  }
  return proxyPrivateApi({
    request,
    method: 'PATCH',
    path: `/code-affixes/${encodeURIComponent(id.data)}`,
    inputSchema: updateCodeAffixSchema,
    outputSchema: codeAffixSchema,
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = await parseId(context);
  if (!id.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'La regla indicada no es válida.' }, { status: 400 }),
    );
  }
  return proxyPrivateApi({
    request,
    method: 'DELETE',
    path: `/code-affixes/${encodeURIComponent(id.data)}`,
    outputSchema: codeAffixSchema,
  });
}
