import { modulePoliciesSchema, modulePolicySchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';
import { proxyPrivateApi } from '@/lib/private-api-route';
export function GET(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: '/identity/module-policies',
    outputSchema: modulePoliciesSchema,
  });
}
export function PATCH(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'PATCH',
    path: '/identity/module-policies',
    inputSchema: modulePolicySchema,
    outputSchema: modulePoliciesSchema,
  });
}
