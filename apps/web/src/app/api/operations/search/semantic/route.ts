import { semanticSearchQuerySchema, semanticSearchResponseSchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

/**
 * Same-origin, authenticated gateway for semantic search. The browser never receives the
 * upstream bearer token and neither an unvalidated query nor an unvalidated AI response can
 * cross the BFF boundary.
 */
export function GET(request: NextRequest) {
  const query = semanticSearchQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) {
    return securePrivateResponse(
      NextResponse.json(
        { message: 'Ingresa una consulta de al menos dos caracteres.', issues: query.error.issues },
        { status: 400 },
      ),
    );
  }

  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/search/semantic?q=${encodeURIComponent(query.data.q)}&limit=${query.data.limit}`,
    outputSchema: semanticSearchResponseSchema,
  });
}
