import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { proxyPrivateApi } from '@/lib/private-api-route';
export const dynamic = 'force-dynamic';
export function GET(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: '/catalog/technical-sheets/authorize',
    outputSchema: z.object({ allowed: z.literal(true) }),
  });
}
