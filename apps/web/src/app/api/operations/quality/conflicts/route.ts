import { qualityConflictSchema, qualityReviewSchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';
import { proxyPrivateApi } from '@/lib/private-api-route';
export function POST(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: '/quality/conflicts',
    inputSchema: qualityConflictSchema,
    outputSchema: qualityReviewSchema,
  });
}
