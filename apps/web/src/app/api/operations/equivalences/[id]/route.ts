import { externalHomologSchema, updateExternalHomologSchema, uuidSchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'El homólogo indicado no es válido.' }, { status: 400 }),
    );
  }
  return proxyPrivateApi({
    request,
    method: 'PATCH',
    path: `/equivalences/homologs/${encodeURIComponent(id.data)}`,
    inputSchema: updateExternalHomologSchema,
    outputSchema: externalHomologSchema,
  });
}
