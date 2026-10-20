import { auditChangeListQuerySchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateDownload } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const query = auditChangeListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'Los filtros del reporte no son válidos.' }, { status: 400 }),
    );
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query.data)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return proxyPrivateDownload({
    request,
    path: `/audit/changes/export?${params.toString()}`,
    accept: 'text/csv',
  });
}
