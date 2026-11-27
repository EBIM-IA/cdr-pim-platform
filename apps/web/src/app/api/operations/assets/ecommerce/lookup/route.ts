import {
  ecommerceImageLookupRequestSchema,
  ecommerceImageLookupResponseSchema,
} from '@cdr/contracts';
import type { NextRequest } from 'next/server';

import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export function POST(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: '/assets/ecommerce/lookup',
    inputSchema: ecommerceImageLookupRequestSchema,
    outputSchema: ecommerceImageLookupResponseSchema,
    timeoutMs: 20_000,
  });
}
