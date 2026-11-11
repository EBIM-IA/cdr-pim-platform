import { qualitySourcePrioritySchema } from '@cdr/contracts';
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { proxyPrivateApi } from '@/lib/private-api-route';
export function POST(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: '/quality/source-priority',
    inputSchema: qualitySourcePrioritySchema,
    outputSchema: z.object({ updated: z.literal(true) }),
  });
}
