import {
  confirmCategorySkuAssignmentsSchema,
  confirmedCategorySkuAssignmentsSchema,
} from '@cdr/contracts';
import type { NextRequest } from 'next/server';
import { proxyPrivateApi } from '@/lib/private-api-route';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: '/catalog/admin/category-assignments/confirm',
    inputSchema: confirmCategorySkuAssignmentsSchema,
    outputSchema: confirmedCategorySkuAssignmentsSchema,
  });
}
