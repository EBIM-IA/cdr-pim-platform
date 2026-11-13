import { catalogHomeSettingsSchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';
import { proxyPrivateApi } from '@/lib/private-api-route';
export function GET(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: '/catalog/home',
    outputSchema: catalogHomeSettingsSchema,
  });
}
export function PATCH(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'PATCH',
    path: '/catalog/home',
    inputSchema: catalogHomeSettingsSchema,
    outputSchema: catalogHomeSettingsSchema,
  });
}
