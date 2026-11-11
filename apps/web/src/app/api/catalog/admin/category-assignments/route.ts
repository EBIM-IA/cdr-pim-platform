import { categorySkuAssignmentExportSchema } from '@cdr/contracts';
import type { NextRequest } from 'next/server';
import { proxyPrivateApi } from '@/lib/private-api-route';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: '/catalog/admin/category-assignments',
    outputSchema: categorySkuAssignmentExportSchema,
  });
}
