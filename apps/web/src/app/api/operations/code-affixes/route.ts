import { codeAffixListQuerySchema, codeAffixSchema, createCodeAffixSchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const query = codeAffixListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) {
    return securePrivateResponse(
      NextResponse.json(
        { message: 'Los filtros de prefijos y sufijos no son válidos.' },
        { status: 400 },
      ),
    );
  }
  const params = new URLSearchParams({ includeInactive: String(query.data.includeInactive) });
  if (query.data.q) params.set('q', query.data.q);
  if (query.data.kind) params.set('kind', query.data.kind);
  if (query.data.status) params.set('status', query.data.status);
  if (query.data.source) params.set('source', query.data.source);
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/code-affixes?${params.toString()}`,
    outputSchema: z.array(codeAffixSchema),
  });
}

export function POST(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: '/code-affixes',
    inputSchema: createCodeAffixSchema,
    outputSchema: codeAffixSchema,
  });
}
