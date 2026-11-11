import { reportSettingsSchema, updateReportSettingsSchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';
import { proxyPrivateApi } from '@/lib/private-api-route';
export function GET(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: '/reports/preferences',
    outputSchema: reportSettingsSchema,
  });
}
export function POST(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: '/reports/preferences',
    inputSchema: updateReportSettingsSchema,
    outputSchema: reportSettingsSchema,
  });
}
