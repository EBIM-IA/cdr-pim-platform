import {
  applicationColumnSettingsSchema,
  updateApplicationColumnSettingsSchema,
} from '@cdr/contracts';
import type { NextRequest } from 'next/server';
import { proxyPrivateApi } from '@/lib/private-api-route';
export const dynamic = 'force-dynamic';
export function GET(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: '/applications/columns',
    outputSchema: applicationColumnSettingsSchema,
  });
}
export function PATCH(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'PATCH',
    path: '/applications/columns',
    inputSchema: updateApplicationColumnSettingsSchema,
    outputSchema: applicationColumnSettingsSchema,
  });
}
