import { bootstrapCodeAffixesSchema, bootstrapCodeAffixesResultSchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';
import { AI_UPSTREAM_TIMEOUT_MS } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';
export function POST(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: '/ai/code-affixes/bootstrap',
    inputSchema: bootstrapCodeAffixesSchema,
    outputSchema: bootstrapCodeAffixesResultSchema,
    timeoutMs: AI_UPSTREAM_TIMEOUT_MS,
  });
}
