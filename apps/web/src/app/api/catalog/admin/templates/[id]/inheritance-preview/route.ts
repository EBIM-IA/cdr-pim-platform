import { templateInheritancePreviewSchema, uuidSchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = uuidSchema.safeParse((await context.params).id);
  const unifiedCode = request.nextUrl.searchParams.get('unifiedCode')?.trim();
  if (!id.success || !unifiedCode || unifiedCode.length > 200)
    return securePrivateResponse(
      NextResponse.json(
        { message: 'Indica una plantilla y un código unificador válidos' },
        { status: 400 },
      ),
    );
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/catalog/admin/templates/${encodeURIComponent(id.data)}/inheritance-preview?${new URLSearchParams({ unifiedCode })}`,
    outputSchema: templateInheritancePreviewSchema,
  });
}
