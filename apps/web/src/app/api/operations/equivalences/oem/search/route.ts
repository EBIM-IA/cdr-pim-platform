import { eligibleOemSearchQuerySchema, oemSearchResultSchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const query = eligibleOemSearchQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'Ingresa un código OEM o marca válidos.' }, { status: 400 }),
    );
  }
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/equivalences/oem-search?q=${encodeURIComponent(query.data.q)}`,
    outputSchema: z.array(oemSearchResultSchema),
  });
}
