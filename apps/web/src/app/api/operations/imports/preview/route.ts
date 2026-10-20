import { importBatchSchema, previewImportSchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';

import { proxyPrivateApi } from '@/lib/private-api-route';
import { IMPORT_UPSTREAM_TIMEOUT_MS } from '@/lib/http-security';

export const dynamic = 'force-dynamic';

export function POST(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: '/imports/preview',
    inputSchema: previewImportSchema,
    outputSchema: importBatchSchema,
    timeoutMs: IMPORT_UPSTREAM_TIMEOUT_MS,
  });
}
