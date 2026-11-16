import { qualityReviewSchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';
import { proxyPrivateApi } from '@/lib/private-api-route';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/quality/reviews/${encodeURIComponent(id)}`,
    outputSchema: qualityReviewSchema,
  });
}
