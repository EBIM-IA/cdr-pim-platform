import { productNameSettingsSchema, updateProductNameSettingsSchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';

import { proxyPrivateApi } from '@/lib/private-api-route';

export function GET(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: '/product-experience/settings',
    outputSchema: productNameSettingsSchema,
  });
}
export function PATCH(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'PATCH',
    path: '/product-experience/settings',
    inputSchema: updateProductNameSettingsSchema,
    outputSchema: productNameSettingsSchema,
  });
}
