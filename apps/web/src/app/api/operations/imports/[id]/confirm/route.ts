import { importBatchSchema, uuidSchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { IMPORT_UPSTREAM_TIMEOUT_MS, securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'El lote indicado no es válido.' }, { status: 400 }),
    );
  }
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: `/imports/${encodeURIComponent(id.data)}/confirm`,
    outputSchema: importBatchSchema,
    timeoutMs: IMPORT_UPSTREAM_TIMEOUT_MS,
  });
}
