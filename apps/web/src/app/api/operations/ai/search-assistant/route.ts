import { aiSearchAssistantRequestSchema, aiSearchAssistantResponseSchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';
import { AI_UPSTREAM_TIMEOUT_MS } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';
export const dynamic = 'force-dynamic';
export function POST(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: '/ai/search-assistant',
    inputSchema: aiSearchAssistantRequestSchema,
    outputSchema: aiSearchAssistantResponseSchema,
    timeoutMs: AI_UPSTREAM_TIMEOUT_MS,
  });
}
