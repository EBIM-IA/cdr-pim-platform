import { unifiedCodeRequestSchema, createUnifiedCodeRequestSchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';
import { proxyPrivateApi } from '@/lib/private-api-route';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: '/equivalences/code-requests',
    outputSchema: unifiedCodeRequestSchema.array(),
  });
}
export async function POST(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: '/equivalences/code-requests',
    inputSchema: createUnifiedCodeRequestSchema,
    outputSchema: unifiedCodeRequestSchema,
  });
}
