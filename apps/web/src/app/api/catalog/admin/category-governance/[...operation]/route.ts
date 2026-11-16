import {
  categoryTreeConfirmSchema,
  categoryGovernanceSchema,
  categoryTreeImportSchema,
  categoryTreePreviewSchema,
  saveCategoryDynamicAttributeSchema,
} from '@cdr/contracts';
import type { NextRequest } from 'next/server';
import { proxyPrivateApi } from '@/lib/private-api-route';
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ operation: string[] }> },
) {
  const { operation } = await context.params;
  const path = operation.join('/');
  if (path === 'tree/preview' || path === 'tree/confirm')
    return proxyPrivateApi({
      request,
      method: 'POST',
      path: `/catalog/admin/category-governance/${path}`,
      inputSchema: path === 'tree/confirm' ? categoryTreeConfirmSchema : categoryTreeImportSchema,
      outputSchema: categoryTreePreviewSchema,
    });
  if (path === 'attributes')
    return proxyPrivateApi({
      request,
      method: 'POST',
      path: '/catalog/admin/category-governance/attributes',
      inputSchema: saveCategoryDynamicAttributeSchema,
      outputSchema: categoryGovernanceSchema,
    });
  return new Response(null, { status: 404 });
}
