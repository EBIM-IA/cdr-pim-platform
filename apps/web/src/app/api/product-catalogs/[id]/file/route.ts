import { uuidSchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateDownload } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'El catálogo indicado no es válido.' }, { status: 400 }),
    );
  }
  const disposition = request.nextUrl.searchParams.get('disposition') ?? 'attachment';
  if (disposition !== 'inline' && disposition !== 'attachment') {
    return securePrivateResponse(
      NextResponse.json({ message: 'La descarga solicitada no es válida.' }, { status: 400 }),
    );
  }
  return proxyPrivateDownload({
    request,
    path: `/product-catalogs/${id.data}/file?disposition=${disposition}`,
    accept: 'application/pdf',
    allowedContentTypes: ['application/pdf'],
    timeoutMs: 60_000,
  });
}
