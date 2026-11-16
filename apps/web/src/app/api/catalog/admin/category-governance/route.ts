import { categoryGovernanceSchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';
import { proxyPrivateApi } from '@/lib/private-api-route';
export function GET(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: '/catalog/admin/category-governance',
    outputSchema: categoryGovernanceSchema,
  });
}
