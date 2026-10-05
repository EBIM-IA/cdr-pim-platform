import {
  createExternalHomologSchema,
  externalHomologSchema,
  homologListQuerySchema,
} from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const query = homologListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) {
    return securePrivateResponse(
      NextResponse.json(
        { message: 'Los filtros de equivalencias no son válidos.' },
        { status: 400 },
      ),
    );
  }
  const params = new URLSearchParams({ includeInactive: String(query.data.includeInactive) });
  if (query.data.unifiedCode) params.set('unifiedCode', query.data.unifiedCode);
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/equivalences/homologs?${params.toString()}`,
    outputSchema: z.array(externalHomologSchema),
  });
}

export function POST(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: '/equivalences/homologs',
    inputSchema: createExternalHomologSchema,
    outputSchema: externalHomologSchema,
  });
}
