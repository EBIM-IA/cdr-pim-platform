import { ecommerceImageStatusSchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';

import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: '/assets/ecommerce/status',
    outputSchema: ecommerceImageStatusSchema,
  });
}
