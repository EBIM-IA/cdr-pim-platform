import { pdfDesignSettingsSchema, savePdfDesignSettingsSchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';
import { proxyPrivateApi } from '@/lib/private-api-route';
export const dynamic = 'force-dynamic';
export function GET(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: '/catalog/admin/pdf-design',
    outputSchema: pdfDesignSettingsSchema,
  });
}
export function PUT(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'PUT',
    path: '/catalog/admin/pdf-design',
    inputSchema: savePdfDesignSettingsSchema,
    outputSchema: pdfDesignSettingsSchema,
  });
}
