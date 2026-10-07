import { uuidSchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateDownload } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

const ASSET_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/vnd.dwg',
] as const;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'El activo indicado no es válido.' }, { status: 400 }),
    );
  }
  return proxyPrivateDownload({
    request,
    path: `/assets/${encodeURIComponent(id.data)}/download${
      request.nextUrl.searchParams.get('inline') === 'true' ? '?inline=true' : ''
    }`,
    accept: '*/*',
    allowedContentTypes: ASSET_CONTENT_TYPES,
    timeoutMs: 60_000,
  });
}
